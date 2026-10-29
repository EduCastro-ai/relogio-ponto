"""Fluxos de votos entre o 1º e o 2º turno por seção eleitoral (inferência ecológica).

Origem (1º turno): Lula, Flávio, Outros candidatos, Brancos+nulos, Abstenção.
Destino (2º turno): Lula, Flávio, Brancos+nulos, Abstenção.
Só as "pontas" (totais por seção em cada turno) são observadas; os fluxos entre elas não, por causa do voto secreto.

Dois resultados:
  1) Limites exatos (Duncan-Davis) por seção, somados: o que é logicamente possível, sem nenhuma suposição de comportamento.
  2) Estimativa por máxima verossimilhança (EM multinomial, Rosen et al. 2001) com probabilidades de transição por estrato (UF),
     mais intervalo por bootstrap de municípios. Supõe que, dentro de um estrato, o eleitor de cada origem se comporta de modo parecido.

Uso: python scripts/fluxos.py [--boot N]   ->  dados/fluxos.json
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = ['Lula', 'Flávio', 'Outros', 'Brancos/nulos', 'Abstenção']
DESTINO = ['Lula', 'Flávio', 'Brancos/nulos', 'Abstenção']


def carregar(caminho=None):
    """Lê dados/secoes.csv e devolve o DataFrame e as matrizes de origem (S×5) e destino (S×4), em contagens."""
    df = pd.read_csv(caminho or RAIZ / 'dados' / 'secoes.csv', sep=';')
    r = np.column_stack([df.L1, df.F1, df.O1, df.B1, df.A1 - df.C1]).astype(float)
    c = np.column_stack([df.L2, df.F2, df.B2, df.A2 - df.C2]).astype(float)
    assert np.allclose(r.sum(1), df.A1) and np.allclose(c.sum(1), df.A2), 'origem/destino não somam os aptos'
    # O modelo exige o mesmo universo de eleitores nos dois turnos. Em ~11% das seções os aptos diferem (eleitores trocaram de seção;
    # a soma nacional é igual): em 95% delas por no máximo 2 eleitores. Reescala a origem ao total do 2º turno em vez de descartá-las.
    reescaladas = int((df.A1 != df.A2).sum())
    r *= (df.A2 / df.A1).to_numpy()[:, None]
    assert np.allclose(r.sum(1), c.sum(1))
    return df, r, c, reescaladas


def limites(r, c):
    """Limites exatos por seção, somados. Cada célula T_ij satisfaz max(0, r_i + c_j - N) <= T_ij <= min(r_i, c_j)."""
    n = r.sum(1)[:, None, None]
    ri, cj = r[:, :, None], c[:, None, :]
    inf = np.maximum(0, ri + cj - n).sum(0)
    sup = np.minimum(ri, cj).sum(0)
    return inf, sup


def em(r, c, p0=None, iteracoes=3000, tol=1e-9):
    """EM multinomial: c_s ~ Multinomial(N_s, sum_i (r_si/N_s) P_i·). Devolve P (5×4, linhas somam 1)."""
    p = np.full((r.shape[1], c.shape[1]), 1 / c.shape[1]) if p0 is None else p0.copy()
    if p0 is None:  # ponto de partida: destino proporcional ao total, ligeiramente diferenciado por origem
        p = np.tile(c.sum(0) / c.sum(), (r.shape[1], 1))
    for _ in range(iteracoes):
        q = r @ p                              # destino esperado por seção (contagens), S×4
        razao = np.divide(c, q, out=np.zeros_like(c), where=q > 0)
        novo = p * (r.T @ razao)               # fluxo esperado agregado, 5×4
        novo /= novo.sum(1, keepdims=True)
        if np.abs(novo - p).max() < tol:
            p = novo
            break
        p = novo
    return p


def fluxo_total(r, c, p):
    """Fluxo esperado agregado T_ij = sum_s c_sj r_si P_ij / (r_s · P_j), com os totais do destino respeitados."""
    q = r @ p
    razao = np.divide(c, q, out=np.zeros_like(c), where=q > 0)
    return p * (r.T @ razao)


def ajustar_margens(t, linhas, colunas, iteracoes=200):
    """Ajuste proporcional iterativo (IPF): escala a matriz até as somas de linha e de coluna serem iguais aos totais observados.
    O EM respeita as colunas, mas as linhas só aproximadamente; sem o ajuste, a soma da origem não bate com o total do TSE."""
    t = t.copy()
    for _ in range(iteracoes):
        t *= np.divide(linhas, t.sum(1), out=np.ones_like(linhas), where=t.sum(1) > 0)[:, None]
        t *= np.divide(colunas, t.sum(0), out=np.ones_like(colunas), where=t.sum(0) > 0)[None, :]
        if np.abs(t.sum(1) - linhas).max() < 1e-6 * linhas.sum():
            break
    return t


def estimar(df, r, c, iteracoes=3000):
    """Estima P por UF e soma os fluxos esperados. Devolve T nacional (5×4) e T por UF, com as margens iguais às observadas."""
    t_uf = {}
    for uf, idx in df.groupby('uf').indices.items():
        p = em(r[idx], c[idx], iteracoes=iteracoes)
        t_uf[uf] = ajustar_margens(fluxo_total(r[idx], c[idx], p), r[idx].sum(0), c[idx].sum(0))
    return sum(t_uf.values()), t_uf


def bootstrap(df, r, c, reps, semente=1):
    """Bootstrap por município (cluster): reamostra municípios dentro de cada UF e reestima. Devolve reps × 5 × 4."""
    rng = np.random.default_rng(semente)
    por_uf = {}  # UF -> lista de arrays com os índices (no df original) das seções de cada município
    for uf, i_uf in df.groupby('uf').indices.items():
        sub = df.iloc[i_uf]
        por_uf[uf] = [i_uf[ix] for ix in sub.groupby('mun').indices.values()]
    base_p = {uf: em(r[i], c[i]) for uf, i in df.groupby('uf').indices.items()}
    saidas = []
    for b in range(reps):
        t = np.zeros((r.shape[1], c.shape[1]))
        for uf, muns in por_uf.items():
            escolha = rng.integers(0, len(muns), len(muns))
            idx = np.concatenate([muns[k] for k in escolha])
            p = em(r[idx], c[idx], p0=base_p[uf], iteracoes=150)
            t += ajustar_margens(fluxo_total(r[idx], c[idx], p), r[idx].sum(0), c[idx].sum(0)) * (r[np.concatenate(muns)].sum() / r[idx].sum())  # reescala ao universo original da UF
        saidas.append(t)
    return np.array(saidas)


def main():
    reps = int(sys.argv[sys.argv.index('--boot') + 1]) if '--boot' in sys.argv else 0
    t0 = time.time()
    df, r, c, reescaladas = carregar()
    print(f'seções usadas: {len(df):,} (com aptos reescalados por diferença entre turnos: {reescaladas})')
    inf, sup = limites(r, c)
    t, t_uf = estimar(df, r, c)
    print(f'estimativa ok em {time.time() - t0:.0f}s')
    saida = {
        'origem': ORIGEM, 'destino': DESTINO,
        'totais_origem': r.sum(0).tolist(), 'totais_destino': c.sum(0).tolist(),
        'limite_inferior': inf.tolist(), 'limite_superior': sup.tolist(),
        'estimativa': t.tolist(),
        'estimativa_por_uf': {uf: v.tolist() for uf, v in t_uf.items()},
        'secoes': int(len(df)), 'secoes_reescaladas': reescaladas,
    }
    if reps:
        b = bootstrap(df, r, c, reps)
        saida['bootstrap'] = {'reps': reps, 'p025': np.percentile(b, 2.5, axis=0).tolist(), 'p975': np.percentile(b, 97.5, axis=0).tolist()}
        print(f'bootstrap ({reps}) ok em {time.time() - t0:.0f}s')
    (RAIZ / 'dados' / 'fluxos.json').write_text(json.dumps(saida), encoding='utf-8')
    f = lambda m: pd.DataFrame(np.round(m / 1e6, 2), index=ORIGEM, columns=DESTINO)
    print('\nLimite inferior (mi de eleitores)\n', f(inf), '\nLimite superior\n', f(sup), '\nEstimativa EM\n', f(t))


if __name__ == '__main__':
    main()
