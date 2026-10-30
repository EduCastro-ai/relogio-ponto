"""Fluxos de votos entre o 1º e o 2º turno por seção eleitoral (inferência ecológica).

Origem (1º turno): Lula, Flávio, Outros candidatos, Brancos+nulos, Abstenção.
Destino (2º turno): Lula, Flávio, Brancos+nulos, Abstenção.
Só as "pontas" (totais por seção em cada turno) são observadas; os fluxos entre elas não, por causa do voto secreto.

Dois resultados:
  1) Limites exatos (Duncan-Davis) por seção, somados: o que é logicamente possível, sem nenhuma suposição de comportamento.
  2) Estimativa por máxima verossimilhança (EM multinomial, Rosen et al. 2001) com probabilidades de transição por ESTRATO:
     cada capital é um estrato próprio e o restante de cada UF (o interior) é outro; o exterior é um estrato à parte.
     Supõe que, dentro de um estrato, o eleitor de cada origem se comporta de modo parecido. Como os estratos não se sobrepõem,
     Brasil = capitais + demais municípios + exterior, e cada UF = capital + interior.
     Intervalo por bootstrap: reamostra locais de votação dentro de cada capital e municípios dentro do interior de cada UF.

Recortes gerados: BR, K:ALL (27 capitais), K:INT (demais municípios, sem exterior), C:<UF> (capital de cada UF) e, na saída,
estimativa por UF (capital + interior), da qual o painel soma as regiões.

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
    """Lê dados/secoes.csv e devolve o DataFrame (com capital, estrato e cluster) e as matrizes de origem (S×5) e destino (S×4)."""
    df = pd.read_csv(caminho or RAIZ / 'dados' / 'secoes.csv', sep=';')
    r = np.column_stack([df.L1, df.F1, df.O1, df.B1, df.A1 - df.C1]).astype(float)
    c = np.column_stack([df.L2, df.F2, df.B2, df.A2 - df.C2]).astype(float)
    assert np.allclose(r.sum(1), df.A1) and np.allclose(c.sum(1), df.A2), 'origem/destino não somam os aptos'
    # O modelo exige o mesmo universo de eleitores nos dois turnos. Em ~11% das seções os aptos diferem (eleitores trocaram de seção;
    # a soma nacional é igual): em 95% delas por no máximo 2 eleitores. Reescala a origem ao total do 2º turno em vez de descartá-las.
    reescaladas = int((df.A1 != df.A2).sum())
    r *= (df.A2 / df.A1).to_numpy()[:, None]
    assert np.allclose(r.sum(1), c.sum(1))
    # capitais: código TSE do município, de dados/analise.json (node scripts/analise.mjs)
    caps = json.loads((RAIZ / 'dados' / 'analise.json').read_text(encoding='utf-8'))['capitais']
    chaves = {(x['uf'].upper(), int(x['tse'])) for x in caps}
    df['capital'] = [(u, m) in chaves for u, m in zip(df.uf, df.mun)]
    achadas = df[df.capital].groupby('uf').mun.nunique()
    assert len(achadas) == 27 and (achadas == 1).all(), f'capitais não encontradas na base por seção: {len(achadas)} de 27'
    df['estrato'] = np.where(df.capital, df.uf + '_C', df.uf)
    df['cl'] = np.where(df.capital, df.local, df.mun)  # unidade de reamostragem: local de votação nas capitais, município no resto
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
    if p0 is None:  # ponto de partida: destino proporcional ao total
        p = np.tile(c.sum(0) / c.sum(), (r.shape[1], 1))
    else:
        p = p0.copy()
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
    """Estima P por estrato e soma os fluxos esperados. Devolve T nacional (5×4) e T por estrato, com margens iguais às observadas."""
    t_est = {}
    for est, idx in df.groupby('estrato').indices.items():
        p = em(r[idx], c[idx], iteracoes=iteracoes)
        t_est[est] = ajustar_margens(fluxo_total(r[idx], c[idx], p), r[idx].sum(0), c[idx].sum(0))
    return sum(t_est.values()), t_est


def agrupar(t_est):
    """De T por estrato para: T por UF (capital + interior), T das capitais (por UF e somadas) e T do interior (sem exterior)."""
    por_uf, cap = {}, {}
    for est, t in t_est.items():
        uf = est.split('_')[0]
        por_uf[uf] = por_uf.get(uf, 0) + t
        if est.endswith('_C'):
            cap['C:' + uf] = t
    interior = sum(t for est, t in t_est.items() if not est.endswith('_C') and est != 'ZZ')
    return por_uf, cap, sum(cap.values()), interior


def bootstrap(df, r, c, reps, semente=1):
    """Bootstrap por cluster dentro de cada estrato (local de votação nas capitais, município no resto) e reestimação.
    Devolve {recorte: array reps × 5 × 4} para BR, K:ALL, K:INT e C:<UF>."""
    rng = np.random.default_rng(semente)
    est_idx = df.groupby('estrato').indices
    clusters = {est: [idx[ix] for ix in df.iloc[idx].groupby('cl').indices.values()] for est, idx in est_idx.items()}
    base_p = {est: em(r[idx], c[idx]) for est, idx in est_idx.items()}
    saidas = {}
    for _ in range(reps):
        t_est = {}
        for est, grupos in clusters.items():
            escolha = rng.integers(0, len(grupos), len(grupos))
            idx = np.concatenate([grupos[k] for k in escolha])
            p = em(r[idx], c[idx], p0=base_p[est], iteracoes=150)
            t = ajustar_margens(fluxo_total(r[idx], c[idx], p), r[idx].sum(0), c[idx].sum(0))
            t_est[est] = t * (r[est_idx[est]].sum() / r[idx].sum())  # reescala ao universo original do estrato
        _, cap, cap_total, interior = agrupar(t_est)
        for nome, t in {'BR': sum(t_est.values()), 'K:ALL': cap_total, 'K:INT': interior, **cap}.items():
            saidas.setdefault(nome, []).append(t)
    return {k: np.array(v) for k, v in saidas.items()}


def main():
    reps = int(sys.argv[sys.argv.index('--boot') + 1]) if '--boot' in sys.argv else 0
    t0 = time.time()
    df, r, c, reescaladas = carregar()
    print(f'seções usadas: {len(df):,} (com aptos reescalados por diferença entre turnos: {reescaladas}); estratos: {df.estrato.nunique()}')
    t, t_est = estimar(df, r, c)
    por_uf, cap, cap_total, interior = agrupar(t_est)
    print(f'estimativa ok em {time.time() - t0:.0f}s')

    mascaras = {'BR': np.ones(len(df), bool), 'K:ALL': df.capital.to_numpy(), 'K:INT': (~df.capital & (df.uf != 'ZZ')).to_numpy()}
    mascaras.update({'C:' + uf: (df.capital & (df.uf == uf)).to_numpy() for uf in df[df.capital].uf.unique()})
    estim = {'BR': t, 'K:ALL': cap_total, 'K:INT': interior, **cap}
    recortes = {}
    for nome, m in mascaras.items():
        inf, sup = limites(r[m], c[m])
        recortes[nome] = {'estimativa': estim[nome].tolist(), 'limite_inferior': inf.tolist(), 'limite_superior': sup.tolist(),
                          'secoes': int(m.sum()), 'totais_origem': r[m].sum(0).tolist(), 'totais_destino': c[m].sum(0).tolist(), 'ic': None}
    if reps:
        b = bootstrap(df, r, c, reps)
        for nome, arr in b.items():
            recortes[nome]['ic'] = {'reps': reps, 'p025': np.percentile(arr, 2.5, axis=0).tolist(), 'p975': np.percentile(arr, 97.5, axis=0).tolist()}
        print(f'bootstrap ({reps}) ok em {time.time() - t0:.0f}s')
    saida = {'origem': ORIGEM, 'destino': DESTINO, 'recortes': recortes, 'estimativa_por_uf': {uf: v.tolist() for uf, v in por_uf.items()},
             'secoes': int(len(df)), 'secoes_reescaladas': reescaladas}
    (RAIZ / 'dados' / 'fluxos.json').write_text(json.dumps(saida), encoding='utf-8')
    f = lambda m: pd.DataFrame(np.round(m / 1e6, 2), index=ORIGEM, columns=DESTINO)
    print('\nBrasil (mi)\n', f(t), '\n27 capitais\n', f(cap_total), '\nDemais municípios\n', f(interior))


if __name__ == '__main__':
    main()
