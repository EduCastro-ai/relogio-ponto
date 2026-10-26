// Agrega a votação presidencial por LOCAL DE VOTAÇÃO e por BAIRRO a partir dos CSVs de dados abertos do TSE.
// Lê quantos turnos existirem nos arquivos (hoje só o 1º tem resultado por seção). Rode de novo quando o TSE publicar o 2º.
// Entradas (em dados/tse-csv/<pasta do zip>/): votacao_secao_2026_BR.csv, detalhe_votacao_secao_2026_BR.csv, eleitorado_local_votacao_2026_BRASIL.csv
// Saída: dados/locais.js (window.LOCAIS). Uso: node scripts/locais.mjs
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'dados');
const CSV = path.join(DADOS, 'tse-csv');

async function achar(padrao) {
  const out = [];
  for (const pasta of await readdir(CSV, { withFileTypes: true })) {
    if (!pasta.isDirectory()) continue;
    for (const f of await readdir(path.join(CSV, pasta.name))) if (padrao.test(f)) out.push(path.join(CSV, pasta.name, f));
  }
  return out;
}

// Parser de linha CSV do TSE: separador ";", campos opcionalmente entre aspas, "" escapa aspas.
function campos(linha) {
  const r = []; let i = 0; const n = linha.length;
  while (i <= n) {
    if (linha[i] === '"') {
      let s = ''; i++;
      while (i < n) { if (linha[i] === '"') { if (linha[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } s += linha[i++]; }
      r.push(s); i++; // pula ';'
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

// números normalizados: o cadastro de locais usa código de município com zeros à esquerda ("02550"), o resultado não
const chave = (o) => `${o.SG_UF}|${Number(o.CD_MUNICIPIO)}|${Number(o.NR_ZONA)}|${Number(o.NR_LOCAL_VOTACAO)}`;
const novo = () => ({ aptos: 0, comp: 0, L: 0, F: 0, O: 0, brancos: 0, nulos: 0, secoes: new Set() });
const locais = new Map(); // chave -> { turnos: {1: acumulador, 2: ...} }
const pegar = (k, t) => { let l = locais.get(k); if (!l) locais.set(k, l = {}); return (l[t] ??= novo()); };
const turnos = new Set();

// 1) resultado por seção (presidente)
const arqVot = await achar(/^votacao_secao_2026_BR\.csv$/);
if (!arqVot.length) throw new Error('votacao_secao_2026_BR.csv não encontrado em dados/tse-csv/*');
for (const arq of arqVot) {
  console.log('lendo', path.basename(arq));
  for await (const r of registros(arq)) {
    if (r.DS_CARGO !== 'Presidente') continue;
    const t = Number(r.NR_TURNO); turnos.add(t);
    const a = pegar(chave(r), t), q = Number(r.QT_VOTOS);
    a.secoes.add(r.NR_SECAO);
    if (r.NR_VOTAVEL === '13') a.L += q; else if (r.NR_VOTAVEL === '22') a.F += q;
    else if (/^VOTO BRANCO/.test(r.NM_VOTAVEL)) a.brancos += q; else if (/^VOTO NULO/.test(r.NM_VOTAVEL)) a.nulos += q; else a.O += q;
  }
}

// 2) aptos e comparecimento por seção
for (const arq of await achar(/^detalhe_votacao_secao_2026_BR\.csv$/)) {
  console.log('lendo', path.basename(arq));
  for await (const r of registros(arq)) {
    if (r.DS_CARGO !== 'Presidente') continue;
    const t = Number(r.NR_TURNO); if (!turnos.has(t)) continue;
    const a = pegar(chave(r), t);
    a.aptos += Number(r.QT_APTOS); a.comp += Number(r.QT_COMPARECIMENTO);
  }
}

// 3) cadastro dos locais: nome, bairro, coordenadas
const cad = new Map(); const bairros = [], idxBairro = new Map();
for (const arq of await achar(/^eleitorado_local_votacao_2026_BRASIL\.csv$/)) {
  console.log('lendo', path.basename(arq));
  for await (const r of registros(arq)) {
    if (r.DS_TIPO_SECAO_AGREGADA !== 'Principal') continue;
    // o resultado por seção pode usar o número ORIGINAL do local (antes de remanejamentos): cadastra as duas chaves
    const k = chave(r), ko = chave({ ...r, NR_LOCAL_VOTACAO: r.NR_LOCAL_VOTACAO_ORIGINAL });
    const lat = Number(r.NR_LATITUDE.replace(',', '.')), lon = Number(r.NR_LONGITUDE.replace(',', '.'));
    const ok = Number.isFinite(lat) && Number.isFinite(lon) && lat !== -1 && lon !== -1 && lat !== 0 && lon !== 0 && lat > -34 && lat < 6 && lon > -75 && lon < -28;
    const b = `${r.SG_UF}|${r.CD_MUNICIPIO}|${(r.NM_BAIRRO || 'SEM BAIRRO').trim()}`;
    if (!idxBairro.has(b)) { idxBairro.set(b, bairros.length); bairros.push(b); }
    const reg = { nome: r.NM_LOCAL_VOTACAO, mun: r.NM_MUNICIPIO, lat: ok ? Math.round(lat * 1e5) / 1e5 : null, lon: ok ? Math.round(lon * 1e5) / 1e5 : null, b: idxBairro.get(b) };
    if (!cad.has(k)) cad.set(k, reg);
    if (r.NR_LOCAL_VOTACAO_ORIGINAL && !cad.has(ko)) cad.set(ko, { ...reg, nome: r.NM_LOCAL_VOTACAO_ORIGINAL || reg.nome });
  }
}

// 4) monta a saída
const ordemTurnos = [...turnos].sort();
const linhas = []; let semCad = 0, semCoord = 0;
for (const [k, l] of locais) {
  const c = cad.get(k); if (!c) semCad++; else if (c.lat == null) semCoord++;
  const [uf, mun, zona, nr] = k.split('|');
  const t = ordemTurnos.map((n) => { const a = l[n]; return a ? [a.aptos, a.comp, a.L, a.F, a.O, a.brancos + a.nulos] : null; });
  linhas.push([uf, Number(mun), Number(zona), Number(nr), c?.lat ?? null, c?.lon ?? null, c?.nome ?? '(local sem cadastro)', c?.b ?? -1, ...t]);
}
console.log(`turnos com resultado por seção: ${ordemTurnos.join(', ')} | locais: ${linhas.length} | sem cadastro: ${semCad} | sem coordenada válida: ${semCoord}`);

// 5) conferência com o resultado municipal (API do portal) por turno
let ok = true;
for (const [i, n] of ordemTurnos.entries()) {
  let api; try { api = JSON.parse(await readFile(path.join(DADOS, `bruto-turno${n}.json`), 'utf8')); } catch { console.log(`turno ${n}: sem bruto-turno${n}.json para conferir (rode coletar.mjs)`); continue; }
  const porMun = new Map(); for (const l of linhas) { const t = l[8 + i]; if (!t) continue; const k = `${l[0]}|${l[1]}`; const m = porMun.get(k) ?? [0, 0, 0, 0, 0]; m[0] += t[1]; m[1] += t[2]; m[2] += t[3]; m[3] += t[4]; m[4] += t[0]; porMun.set(k, m); }
  let dif = 0, difMun = []; const tot = [0, 0, 0, 0];
  for (const m of api) {
    const x = porMun.get(`${m.uf.toUpperCase()}|${Number(m.tse)}`) ?? [0, 0, 0, 0, 0];
    const L = m.cand.find((c) => c.n === '13')?.v ?? 0, F = m.cand.find((c) => c.n === '22')?.v ?? 0;
    if (x[1] !== L || x[2] !== F || x[0] !== m.comp) { dif++; if (difMun.length < 5) difMun.push(`${m.nome}/${m.uf}: Lula ${x[1]} vs ${L}; Flávio ${x[2]} vs ${F}; comp ${x[0]} vs ${m.comp}`); }
    tot[0] += x[1]; tot[1] += x[2]; tot[2] += x[0]; tot[3] += x[4];
  }
  console.log(`turno ${n}: soma dos locais Lula=${tot[0]} Flávio=${tot[1]} comparecimento=${tot[2]} aptos=${tot[3]} | municípios divergentes da API: ${dif}/${api.length}`);
  difMun.forEach((s) => console.log('   ', s)); if (dif) ok = false;
}

const saida = { geradoEm: new Date().toISOString(), turnos: ordemTurnos, colunasTurno: ['aptos', 'comp', 'L', 'F', 'O', 'bn'], bairros, fonte: 'TSE dados abertos: votação por seção, detalhe da votação por seção, eleitorado por local de votação (2026)', conferenciaOk: ok, linhas };
await writeFile(path.join(DADOS, 'locais.js'), 'window.LOCAIS=' + JSON.stringify(saida) + ';');
console.log(ok ? 'CONFERÊNCIA OK' : 'ATENÇÃO: divergências na conferência');
