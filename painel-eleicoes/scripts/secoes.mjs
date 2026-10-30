// Monta a base por SEÇÃO ELEITORAL com os dois turnos lado a lado (presidente), a partir dos CSVs de dados abertos do TSE.
// É a entrada da estimativa de fluxo de votos entre turnos (inferência ecológica): para cada seção, as duas "pontas" da matriz de transição.
// Entradas (dados/tse-csv/<pasta do zip>/): votacao_secao_2026_BR.csv e detalhe_votacao_secao_2026_BR.csv.
// Saída: dados/secoes.csv (uma linha por seção presente nos dois turnos) e dados/secoes-resumo.json (conferências).
// Colunas da saída: uf, mun (código TSE), zona, secao, A1, C1, L1, F1, O1, B1, A2, C2, L2, F2, B2
//   local = número do local de votação (usado como unidade de reamostragem no bootstrap das capitais)
//   A = aptos, C = comparecimento, L = Lula, F = Flávio, O = outros candidatos (só 1º turno), B = brancos + nulos.
// Uso: node scripts/secoes.mjs
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'dados');
const CSV = path.join(DADOS, 'tse-csv');

async function achar(padrao) {
  const out = [];
  for (const pasta of await readdir(CSV, { withFileTypes: true })) {
    if (!pasta.isDirectory() || pasta.name.startsWith('backup')) continue; // ignora o backup do 1º turno
    for (const f of await readdir(path.join(CSV, pasta.name))) if (padrao.test(f)) out.push(path.join(CSV, pasta.name, f));
  }
  return out;
}
// Parser de linha CSV do TSE: separador ";", campos opcionalmente entre aspas
function campos(linha) {
  const r = []; let i = 0; const n = linha.length;
  while (i <= n) {
    if (linha[i] === '"') {
      let s = ''; i++;
      while (i < n) { if (linha[i] === '"') { if (linha[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } s += linha[i++]; }
      r.push(s); i++;
    } else { let j = linha.indexOf(';', i); if (j < 0) j = n; r.push(linha.slice(i, j)); i = j + 1; }
  }
  return r;
}
async function* registros(arq) {
  const rl = createInterface({ input: createReadStream(arq, { encoding: 'latin1' }), crlfDelay: Infinity });
  let cab = null;
  for await (const l of rl) {
    if (!l) continue;
    if (!cab) { cab = campos(l); continue; }
    const v = campos(l), o = {};
    for (let i = 0; i < cab.length; i++) o[cab[i]] = v[i];
    yield o;
  }
}

const secs = new Map(); // `${turno}|${uf}|${mun}|${zona}|${secao}` -> { A, C, L, F, O, B }
const pegar = (r) => { const k = `${r.NR_TURNO}|${r.SG_UF}|${Number(r.CD_MUNICIPIO)}|${Number(r.NR_ZONA)}|${Number(r.NR_SECAO)}`; let a = secs.get(k); if (!a) secs.set(k, a = { A: 0, C: 0, L: 0, F: 0, O: 0, B: 0 }); return a; };

const arqVot = await achar(/^votacao_secao_2026_BR\.csv$/), arqDet = await achar(/^detalhe_votacao_secao_2026_BR\.csv$/);
if (!arqVot.length || !arqDet.length) throw new Error('CSVs por seção não encontrados em dados/tse-csv/*');
for (const arq of arqVot) {
  console.log('lendo', path.basename(arq));
  for await (const r of registros(arq)) {
    if (r.DS_CARGO !== 'Presidente') continue;
    const a = pegar(r), q = Number(r.QT_VOTOS); a.local ??= Number(r.NR_LOCAL_VOTACAO);
    if (r.NR_VOTAVEL === '13') a.L += q; else if (r.NR_VOTAVEL === '22') a.F += q;
    else if (/^VOTO (BRANCO|NULO)/.test(r.NM_VOTAVEL)) a.B += q; else a.O += q;
  }
}
for (const arq of arqDet) {
  console.log('lendo', path.basename(arq));
  for await (const r of registros(arq)) {
    if (r.DS_CARGO !== 'Presidente') continue;
    const a = pegar(r); a.A += Number(r.QT_APTOS); a.C += Number(r.QT_COMPARECIMENTO);
  }
}

// junta os dois turnos pela mesma seção
const chaves = new Map(); // `${uf}|${mun}|${zona}|${secao}` -> [t1, t2]
for (const [k, v] of secs) { const [t, ...resto] = k.split('|'); const kk = resto.join('|'); let p = chaves.get(kk); if (!p) chaves.set(kk, p = [null, null]); p[Number(t) - 1] = v; }
const soma = (arr) => arr.reduce((s, x) => s + x, 0);
let ambos = 0, so1 = 0, so2 = 0; const linhas = ['uf;mun;zona;secao;local;A1;C1;L1;F1;O1;B1;A2;C2;L2;F2;B2'];
const fora = { so1: { A: 0, C: 0, L: 0, F: 0 }, so2: { A: 0, C: 0, L: 0, F: 0 } }, dentro = { A1: 0, C1: 0, L1: 0, F1: 0, A2: 0, C2: 0, L2: 0, F2: 0 };
let incoerentes = 0;
for (const [k, [a, b]] of chaves) {
  if (a && b) {
    ambos++;
    // coerência: comparecimento = L + F + O + B em cada turno
    if (a.C !== a.L + a.F + a.O + a.B || b.C !== b.L + b.F + b.O + b.B) incoerentes++;
    linhas.push([k.replaceAll('|', ';'), a.local ?? b.local ?? 0, a.A, a.C, a.L, a.F, a.O, a.B, b.A, b.C, b.L, b.F, b.B].join(';'));
    dentro.A1 += a.A; dentro.C1 += a.C; dentro.L1 += a.L; dentro.F1 += a.F; dentro.A2 += b.A; dentro.C2 += b.C; dentro.L2 += b.L; dentro.F2 += b.F;
  } else if (a) { so1++; for (const c of ['A', 'C', 'L', 'F']) fora.so1[c] += a[c]; } else { so2++; for (const c of ['A', 'C', 'L', 'F']) fora.so2[c] += b[c]; }
}
await writeFile(path.join(DADOS, 'secoes.csv'), linhas.join('\n') + '\n');
const resumo = { geradoEm: new Date().toISOString(), secoesNosDoisTurnos: ambos, somenteNo1: so1, somenteNo2: so2, secoesComComparecimentoIncoerente: incoerentes, nasSecoesComuns: dentro, foraDasSecoesComuns: fora };
await writeFile(path.join(DADOS, 'secoes-resumo.json'), JSON.stringify(resumo, null, 2));
console.log(JSON.stringify(resumo, null, 2));
