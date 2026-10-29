"""Validação do estimador de fluxos com dados simulados (o fluxo verdadeiro é conhecido).

Mantém a composição REAL de origem de cada seção (1º turno) e sorteia o destino a partir de probabilidades de transição conhecidas.
Cenários:
  A) homogêneo: todos os eleitores de uma origem, numa UF, têm a mesma probabilidade de destino (o que o modelo supõe);
  B) heterogêneo: a probabilidade varia ao acaso entre seções (ruído independente da composição da seção);
  C) efeito contextual: a probabilidade depende da composição da seção (ex.: onde Lula é forte, os "outros" vão mais para Lula).
     É a situação que causa a falácia ecológica e vicia a estimativa.
Compara o fluxo agregado estimado com o verdadeiro (em milhões de eleitores).

Uso: python scripts/fluxos_validacao.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fluxos as fx  # noqa: E402

rng = np.random.default_rng(2026)


def sortear_destino(r_int, p_si):
    """r_int: S×5 contagens de origem; p_si: S×5×4 probabilidades. Devolve (c S×4, T S×5×4) por binomiais condicionais."""
    S, K, J = p_si.shape
    t = np.zeros((S, K, J))
    resto_n = r_int.copy()
    resto_p = np.ones((S, K))
    for j in range(J - 1):
        pj = np.divide(p_si[:, :, j], resto_p, out=np.zeros((S, K)), where=resto_p > 1e-12)
        tj = rng.binomial(resto_n.astype(np.int64), np.clip(pj, 0, 1))
        t[:, :, j] = tj
        resto_n = resto_n - tj
        resto_p = resto_p - p_si[:, :, j]
    t[:, :, J - 1] = resto_n
    return t.sum(1), t


def softmax(z):
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def cenarios(df, r):
    """Devolve (nome, p_si) para cada cenário, partindo de P verdadeira por UF (estimada nos dados reais)."""
    p_uf = {uf: fx.em(r[i], r_dest(df, r, i)) for uf, i in df.groupby('uf').indices.items()}
    S, K, J = len(df), r.shape[1], 4
    base = np.zeros((S, K, J))
    for uf, i in df.groupby('uf').indices.items():
        base[i] = p_uf[uf]
    base = np.clip(base, 1e-4, None); base /= base.sum(-1, keepdims=True)
    logit = np.log(base)
    out = [('A) homogêneo', base)]
    out.append(('B) heterogêneo (ruído 0,5)', softmax(logit + rng.normal(0, 0.5, logit.shape))))
    # C) efeito contextual: desvio da parcela de Lula na origem da seção em relação à média; empurra "outros", brancos/nulos e abstenção para Lula
    share_lula = r[:, 0] / r.sum(1)
    desvio = (share_lula - share_lula.mean()) / share_lula.std()
    z = logit.copy()
    for k in (2, 3, 4):
        z[:, k, 0] += 0.5 * desvio       # destino Lula
        z[:, k, 1] -= 0.5 * desvio       # destino Flávio
    out.append(('C) contextual (efeito 0,5 d.p.)', softmax(z)))
    z2 = logit.copy()
    for k in (2, 3, 4):
        z2[:, k, 0] += 1.0 * desvio
        z2[:, k, 1] -= 1.0 * desvio
    out.append(('D) contextual forte (1,0 d.p.)', softmax(z2)))
    return out


def r_dest(df, r, idx):
    """Destino real da seção (só para ancorar a P 'verdadeira' em algo plausível)."""
    return np.column_stack([df.L2.to_numpy()[idx], df.F2.to_numpy()[idx], df.B2.to_numpy()[idx], (df.A2 - df.C2).to_numpy()[idx]]).astype(float)


def main():
    df, r_real, c_real, _ = fx.carregar()
    r = np.rint(r_real)
    nomes_c = ['Outros→Lula', 'Outros→Flávio', 'Abst.→Lula', 'Abst.→Flávio', 'Brancos/nulos→Lula', 'Lula→Lula', 'Flávio→Flávio']
    pos = [(2, 0), (2, 1), (4, 0), (4, 1), (3, 0), (0, 0), (1, 1)]
    linhas = []
    for nome, p_si in cenarios(df, r):
        c, t = sortear_destino(r, p_si)
        t_verd = t.sum(0)
        t_est, _ = fx.estimar(df, r, c)
        inf, sup = fx.limites(r, c)
        for (i, j), n in zip(pos, nomes_c):
            linhas.append({'cenário': nome, 'fluxo': n, 'verdadeiro (mi)': t_verd[i, j] / 1e6, 'estimado (mi)': t_est[i, j] / 1e6,
                           'erro (mi)': (t_est[i, j] - t_verd[i, j]) / 1e6, 'erro (%)': (t_est[i, j] - t_verd[i, j]) / t_verd[i, j] * 100,
                           'limite inf. (mi)': inf[i, j] / 1e6, 'limite sup. (mi)': sup[i, j] / 1e6,
                           'dentro dos limites': bool(inf[i, j] <= t_verd[i, j] <= sup[i, j])})
        erro_abs = np.abs(t_est - t_verd).sum() / 2 / t_verd.sum() * 100
        print(f'{nome}: fração de eleitores alocada no fluxo errado = {erro_abs:.2f}%')
    res = pd.DataFrame(linhas)
    pd.set_option('display.width', 220); pd.set_option('display.max_rows', 100)
    print(res.round(2).to_string(index=False))
    res.to_csv(fx.RAIZ / 'dados' / 'fluxos-validacao.csv', index=False, sep=';', decimal=',')


if __name__ == '__main__':
    main()
