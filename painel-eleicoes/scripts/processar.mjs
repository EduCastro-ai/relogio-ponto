// Cruza os dois turnos por município, calcula swing/viradas/decomposição e gera os arquivos que o painel carrega.
// Uso: node scripts/processar.mjs (depois de coletar.mjs)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'dados');
const ler = async (f) => JSON.parse(await readFile(path.join(DADOS, f), 'utf8'));

const REGIAO = {
  ac: 'Norte', ap: 'Norte', am: 'Norte', pa: 'Norte', ro: 'Norte', rr: 'Norte', to: 'Norte',
  al: 'Nordeste', ba: 'Nordeste', ce: 'Nordeste', ma: 'Nordeste', pb: 'Nordeste', pe: 'Nordeste', pi: 'Nordeste', rn: 'Nordeste', se: 'Nordeste',
  df: 'Centro-Oeste', go: 'Centro-Oeste', mt: 'Centro-Oeste', ms: 'Centro-Oeste',
  es: 'Sudeste', mg: 'Sudeste', rj: 'Sudeste', sp: 'Sudeste',
  pr: 'Sul', rs: 'Sul', sc: 'Sul',
  zz: 'Exterior',
};

const LULA = '13', FLAVIO = '22';
const [t1, t2] = [await ler('bruto-turno1.json'), await ler('bruto-turno2.json')];
const votos = (m, n) => m.cand.find((c) => c.n === n)?.v ?? 0;

const por2 = new Map(t2.map((m) => [`${m.uf}${m.tse}`, m]));
const linhas = [];
for (const a of t1) {
  const b = por2.get(`${a.uf}${a.tse}`);
  if (!b) { console.warn('sem 2º turno:', a.uf, a.tse, a.nome); continue; }
  const L1 = votos(a, LULA), F1 = votos(a, FLAVIO), L2 = votos(b, LULA), F2 = votos(b, FLAVIO);
  // brancos + nulos = comparecimento − válidos (no 1º turno, 5.246 votos nulos do portal não aparecem no campo "nulos" por município)
  const bn1 = a.comp - a.validos, bn2 = b.comp - b.validos;
  const outros1 = a.validos - L1 - F1;
  const m1 = a.validos ? ((L1 - F1) / a.validos) * 100 : 0;
  const m2 = b.validos ? ((L2 - F2) / b.validos) * 100 : 0;
  const v1 = L1 === F1 ? '=' : L1 > F1 ? 'L' : 'F';
  const v2 = L2 === F2 ? '=' : L2 > F2 ? 'L' : 'F';
  linhas.push({
    uf: a.uf, regiao: REGIAO[a.uf], tse: a.tse, ibge: a.ibge, nome: a.nome,
    aptos: a.aptos, comp1: a.comp, comp2: b.comp, abst1: a.abst, abst2: b.abst,
    val1: a.validos, val2: b.validos, bn1, bn2,
    L1, F1, O1: outros1, L2, F2,
    m1, m2, swing: m2 - m1, v1, v2, virada: v1 !== v2 && v1 !== '=' && v2 !== '=' ? v1 + '>' + v2 : '',
    // decomposição do crescimento de votos válidos: outros candidatos do 1º turno + comparecimento a mais + brancos/nulos que votaram
    dec: { outros: outros1, comp: b.comp - a.comp, bn: bn1 - bn2 },
    secoes: b.secoes, secoesTot2: b.secoesTot, secoesTot1: a.secoesTot,
  });
}

// ---- Conferência com os totais oficiais do portal (Brasil) ----
const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
const conf = {
  L1: soma('L1'), F1: soma('F1'), L2: soma('L2'), F2: soma('F2'),
  val1: soma('val1'), val2: soma('val2'), comp1: soma('comp1'), comp2: soma('comp2'), aptos: soma('aptos'),
  bn1: soma('bn1'), bn2: soma('bn2'),
};
// bn = brancos + nulos oficiais: 1º turno 2.300.798 + 3.674.249; 2º turno 1.430.496 + 2.723.305
const oficial = { L1: 53879538, F1: 56104503, L2: 64256232, F2: 59826041, val1: 119300788, val2: 124082273, comp1: 125275835, comp2: 128236074, aptos: 158745502, bn1: 5975047, bn2: 4153801 };
let ok = true;
for (const k of Object.keys(oficial)) {
  const dif = conf[k] - oficial[k];
  if (dif !== 0) ok = false;
  console.log(`${k.padEnd(6)} soma municípios=${conf[k]}  oficial=${oficial[k]}  dif=${dif}`);
}
console.log(ok ? 'CONFERÊNCIA OK: soma dos municípios = totais oficiais' : 'ATENÇÃO: há divergência');

// ---- Agregados por UF e região ----
const agrupar = (chave) => {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chave(l);
    const g = mapa.get(k) ?? { k, n: 0, aptos: 0, comp1: 0, comp2: 0, val1: 0, val2: 0, bn1: 0, bn2: 0, L1: 0, F1: 0, O1: 0, L2: 0, F2: 0, viradas: 0 };
    g.n++;
    for (const c of ['aptos', 'comp1', 'comp2', 'val1', 'val2', 'bn1', 'bn2', 'L1', 'F1', 'O1', 'L2', 'F2']) g[c] += l[c];
    if (l.virada) g.viradas++;
    mapa.set(k, g);
  }
  return [...mapa.values()].map((g) => ({ ...g, m1: ((g.L1 - g.F1) / g.val1) * 100, m2: ((g.L2 - g.F2) / g.val2) * 100, swing: ((g.L2 - g.F2) / g.val2 - (g.L1 - g.F1) / g.val1) * 100 }));
};
const ufs = agrupar((l) => l.uf).map((g) => ({ ...g, regiao: REGIAO[g.k] }));
const regioes = agrupar((l) => l.regiao);

// ---- Malha: mantém só o código IBGE; confere o casamento com o TSE ----
const geo = await ler('malha-municipios.geojson');
const codigosMalha = new Set(geo.features.map((f) => f.properties.codarea));
const comIbge = linhas.filter((l) => l.ibge);
const semGeo = comIbge.filter((l) => !codigosMalha.has(l.ibge));
const codigosTse = new Set(comIbge.map((l) => l.ibge));
const semDados = [...codigosMalha].filter((c) => !codigosTse.has(c));
console.log(`malha: ${codigosMalha.size} polígonos; TSE com IBGE: ${comIbge.length}; TSE sem polígono: ${semGeo.length}; polígono sem TSE: ${semDados.length}`);
if (semGeo.length) console.log('  ex. sem polígono:', semGeo.slice(0, 5).map((l) => `${l.nome}/${l.uf}(${l.ibge})`).join(', '));
if (semDados.length) console.log('  ex. polígono sem dados:', semDados.slice(0, 5).join(', '));

const atualizado = { t1: t1[0].atualizado, t2: t2[0].atualizado };
const painel = { meta: { geradoEm: new Date().toISOString(), fonte: 'TSE – portal de resultados (API pública), eleições gerais 2026, presidente', atualizado, oficial, conferenciaOk: ok }, ufs, regioes, municipios: linhas };
await writeFile(path.join(DADOS, 'painel.js'), 'window.PAINEL=' + JSON.stringify(painel) + ';');
await writeFile(path.join(DADOS, 'malha.js'), 'window.MALHA=' + JSON.stringify({ type: 'FeatureCollection', features: geo.features.map((f) => ({ type: 'Feature', properties: { c: f.properties.codarea }, geometry: f.geometry })) }) + ';');

const viradas = linhas.filter((l) => l.virada);
console.log(`viradas: ${viradas.length} (F>L: ${viradas.filter((l) => l.virada === 'F>L').length}; L>F: ${viradas.filter((l) => l.virada === 'L>F').length})`);
