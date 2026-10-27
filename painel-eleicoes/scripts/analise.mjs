// Análises para a apresentação "Por que Lula virou no 2º turno": lê dados/painel.js e grava dados/analise.json.
// Tudo é calculado a partir da soma dos municípios (mesma base do painel; confere com os totais do TSE em processar.mjs).
// Uso: node scripts/analise.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(await readFile(path.join(RAIZ, 'dados', 'painel.js'), 'utf8'), ctx);
const P = ctx.window.PAINEL, M = P.municipios;

const CAPITAIS = new Set(['1200401','2704302','1600303','1302603','2927408','2304400','5300108','3205309','5208707','2111300','5103403','5002704','3106200','1501402','2507507','4106902','2611606','2211001','3304557','2408102','4314902','1100205','1400100','4205407','3550308','2800308','1721000']);
const FAIXAS = [['f1', 'Até 10 mil', 1e4], ['f2', '10 a 50 mil', 5e4], ['f3', '50 a 200 mil', 2e5], ['f4', 'Mais de 200 mil', Infinity]];
for (const m of M) {
  const a = m.L1 + m.F1, b = m.L2 + m.F2;
  m.ok = m.val1 > 0 && m.val2 > 0 && a > 0 && b > 0;
  m.dsh = m.ok ? (m.L2 / b - m.L1 / a) * 100 : 0;
  m.capital = CAPITAIS.has(String(m.ibge));
  m.faixa = m.uf === 'zz' ? null : FAIXAS.find(f => m.aptos <= f[2])[0];
}
const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
const tot = arr => {
  const o = {}; for (const k of ['aptos', 'comp1', 'comp2', 'val1', 'val2', 'bn1', 'bn2', 'L1', 'F1', 'O1', 'L2', 'F2']) o[k] = sum(arr, k);
  o.n = arr.length;
  o.m1 = (o.L1 - o.F1) / o.val1 * 100; o.m2 = (o.L2 - o.F2) / o.val2 * 100; o.swing = o.m2 - o.m1;
  o.dfatia = (o.L2 / (o.L2 + o.F2) - o.L1 / (o.L1 + o.F1)) * 100;
  o.dL = o.L2 - o.L1; o.dF = o.F2 - o.F1; o.saldo = o.dL - o.dF;            // ganho líquido de Lula sobre Flávio em votos
  o.abs1 = (1 - o.comp1 / o.aptos) * 100; o.abs2 = (1 - o.comp2 / o.aptos) * 100;
  o.dComp = o.comp2 - o.comp1; o.dPart = (o.comp2 - o.comp1) / o.aptos * 100;
  o.dBn = o.bn1 - o.bn2; o.dVal = o.val2 - o.val1;
  o.viradas = arr.filter(m => m.virada).length; o.viradasFL = arr.filter(m => m.virada === 'F>L').length; o.viradasLF = arr.filter(m => m.virada === 'L>F').length;
  const ok = arr.filter(m => m.ok), tv = sum(ok, 'val2');
  const pro = ok.filter(m => m.dsh >= 3); const con = ok.filter(m => m.dsh <= -3);
  o.pmunPro = ok.length ? pro.length / ok.length * 100 : 0; o.pvotPro = tv ? sum(pro, 'val2') / tv * 100 : 0;
  o.nPro = pro.length; o.nCon = con.length; o.nOk = ok.length;
  o.lead1 = o.L1 > o.F1 ? 'L' : 'F'; o.lead2 = o.L2 > o.F2 ? 'L' : 'F';
  return o;
};
const por = (arr, fn) => { const g = new Map(); for (const m of arr) { const k = fn(m); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(m); } return g; };
const R = {};
const br = M.filter(m => m.uf !== 'zz'), ext = M.filter(m => m.uf === 'zz');
R.meta = { ...P.meta, geradoEm: P.meta.geradoEm };
R.brasil = tot(M); R.semExterior = tot(br); R.exterior = ext.length ? tot(ext) : null;

// Regiões, UFs
R.regioes = [...por(br, m => m.regiao)].map(([k, a]) => ({ k, ...tot(a) }));
R.ufs = [...por(br, m => m.uf)].map(([k, a]) => ({ k, regiao: a[0].regiao, ...tot(a) }));
// Capitais × interior
R.capitaisAgg = tot(br.filter(m => m.capital)); R.interiorAgg = tot(br.filter(m => !m.capital));
R.capitais = br.filter(m => m.capital).map(m => ({ nome: m.nome, uf: m.uf, regiao: m.regiao, ...tot([m]), dsh: m.dsh })).sort((a, b) => b.val2 - a.val2);
// Tamanho
R.faixas = FAIXAS.map(([k, nome]) => ({ k, nome, ...tot(br.filter(m => m.faixa === k)) }));
// Região × tamanho (Δ fatia e saldo de votos)
R.regFaixa = [];
for (const [reg, a] of por(br, m => m.regiao)) for (const [k, nome] of FAIXAS) { const s = a.filter(m => m.faixa === k); if (s.length) R.regFaixa.push({ regiao: reg, faixa: k, ...tot(s) }); }
// Viradas
const vir = br.filter(m => m.virada);
R.viradasAgg = tot(vir);
R.viradasPorUF = [...por(vir, m => m.uf)].map(([k, a]) => ({ k, regiao: a[0].regiao, n: a.length, val2: sum(a, 'val2'), saldo: sum(a, 'L2') - sum(a, 'F2') - (sum(a, 'L1') - sum(a, 'F1')) })).sort((a, b) => b.n - a.n);
R.viradasPorRegiao = [...por(vir, m => m.regiao)].map(([k, a]) => ({ k, n: a.length, FL: a.filter(m => m.virada === 'F>L').length, val2: sum(a, 'val2') }));
R.viradasPorFaixa = FAIXAS.map(([k, nome]) => { const a = vir.filter(m => m.faixa === k); return { k, nome, n: a.length, val2: sum(a, 'val2') }; });
R.viradasTop = [...vir].sort((a, b) => b.val2 - a.val2).slice(0, 15).map(m => ({ nome: m.nome, uf: m.uf, virada: m.virada, val2: m.val2, m1: m.m1, m2: m.m2, dsh: m.dsh, dPart: (m.comp2 - m.comp1) / m.aptos * 100, capital: m.capital }));
// Abstenção
R.abstPorRegiao = R.regioes.map(r => ({ k: r.k, abs1: r.abs1, abs2: r.abs2, dComp: r.dComp }));
// Correlação município a município (Δ comparecimento × Δ fatia; ponderada por votos não, simples)
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const ok = br.filter(m => m.ok && m.aptos > 0);
const dpart = m => (m.comp2 - m.comp1) / m.aptos * 100;
R.correl = { dPart_dsh: corr(ok.map(dpart), ok.map(m => m.dsh)), m1_dsh: corr(ok.map(m => m.m1), ok.map(m => m.dsh)), logAptos_dsh: corr(ok.map(m => Math.log(m.aptos)), ok.map(m => m.dsh)), n: ok.length };
// Quartis de Δ comparecimento → Δ fatia média (ponderada pelos votos válidos)
const ord = [...ok].sort((a, b) => dpart(a) - dpart(b)), q = Math.floor(ord.length / 4);
R.quartisPart = [0, 1, 2, 3].map(i => { const a = ord.slice(i * q, i === 3 ? undefined : (i + 1) * q); return { i, min: dpart(a[0]), max: dpart(a[a.length - 1]), n: a.length, dfatia: tot(a).dfatia, dPart: tot(a).dPart }; });
// Quem liderava no 1º turno: Δ fatia por faixa de margem do 1º turno
const FM = [['Flávio > 20 p.p.', m => m.m1 <= -20], ['Flávio 5–20', m => m.m1 > -20 && m.m1 <= -5], ['Equilíbrio ±5', m => m.m1 > -5 && m.m1 < 5], ['Lula 5–20', m => m.m1 >= 5 && m.m1 < 20], ['Lula > 20 p.p.', m => m.m1 >= 20]];
R.porMargem1 = FM.map(([nome, f]) => { const a = br.filter(f); return { nome, ...tot(a) }; });
// Destaques (municípios ≥ 10 mil válidos)
const g10 = br.filter(m => m.ok && m.val2 >= 10000);
const slim = m => ({ nome: m.nome, uf: m.uf, regiao: m.regiao, val2: m.val2, m1: m.m1, m2: m.m2, dsh: m.dsh, dPart: dpart(m), saldo: (m.L2 - m.F2) - (m.L1 - m.F1), virada: m.virada || '', capital: m.capital });
R.topFatiaL = [...g10].sort((a, b) => b.dsh - a.dsh).slice(0, 10).map(slim);
R.topFatiaF = [...g10].sort((a, b) => a.dsh - b.dsh).slice(0, 10).map(slim);
R.topSaldo = [...br].sort((a, b) => ((b.L2 - b.F2) - (b.L1 - b.F1)) - ((a.L2 - a.F2) - (a.L1 - a.F1))).slice(0, 10).map(slim);
R.topSaldoNeg = [...br].sort((a, b) => ((a.L2 - a.F2) - (a.L1 - a.F1)) - ((b.L2 - b.F2) - (b.L1 - b.F1))).slice(0, 5).map(slim);
R.topPart = [...g10].sort((a, b) => dpart(b) - dpart(a)).slice(0, 8).map(slim);
R.apertadas = [...br].filter(m => m.val2 >= 20000).sort((a, b) => Math.abs(a.m2) - Math.abs(b.m2)).slice(0, 8).map(slim);
// Concentração do ganho líquido: quantos municípios somam 50% do saldo positivo
const saldos = br.map(m => (m.L2 - m.F2) - (m.L1 - m.F1)).filter(x => x > 0).sort((a, b) => b - a), totPos = saldos.reduce((a, b) => a + b, 0);
let acc = 0, k = 0; while (acc < totPos / 2) acc += saldos[k++];
R.concentracao = { nMunComSaldoPos: saldos.length, nPara50: k, totPos };
// Fatia do saldo de Lula por grupo
R.saldoPorGrupo = { regioes: R.regioes.map(r => ({ k: r.k, saldo: r.saldo })), capitais: R.capitaisAgg.saldo, interior: R.interiorAgg.saldo, faixas: R.faixas.map(f => ({ k: f.nome, saldo: f.saldo })), viradas: R.viradasAgg.saldo };
// Dados mínimos para os mapas da apresentação: [ibge, Δ fatia, virada (0 não, 1 Flávio→Lula, 2 Lula→Flávio), margem 1º, margem 2º]
R.mapa = br.filter(m => m.ibge && m.ok).map(m => [m.ibge, +m.dsh.toFixed(2), m.virada === 'F>L' ? 1 : m.virada === 'L>F' ? 2 : 0, +m.m1.toFixed(1), +m.m2.toFixed(1)]);
await writeFile(path.join(RAIZ, 'dados', 'analise.json'), JSON.stringify(R));
console.log('ok', Object.keys(R).length, 'blocos');
