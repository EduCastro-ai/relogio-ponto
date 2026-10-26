// Coleta o resultado presidencial por município (1º e 2º turno 2026) na API pública do portal de resultados do TSE
// e a malha municipal do IBGE. Somente leitura. Uso: node scripts/coletar.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'dados');
const BASE = 'https://resultados.tse.jus.br/oficial';
const TURNOS = { 1: '6257', 2: '6258' };
const CONCORRENCIA = 6;

const decodificar = (jws) => {
  const p = jws.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
};

const num = (s) => Number(s ?? 0);

async function baixar(url, tentativas = 4) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
      if (r.status === 404) throw Object.assign(new Error(`404 ${url}`), { fatal: true });
    } catch (e) {
      if (e.fatal || i === tentativas) throw e;
    }
    await new Promise((res) => setTimeout(res, 500 * i));
  }
}

function extrair(m) {
  const cand = [];
  for (const agr of m.carg[0].agr) for (const par of agr.par) for (const c of par.cand) cand.push({ n: c.n, nm: c.nm, v: num(c.vap) });
  return {
    atualizado: `${m.dt} ${m.ht}`,
    aptos: num(m.e.te), comp: num(m.e.c), abst: num(m.e.a),
    secoes: num(m.s.ts), secoesTot: num(m.s.st),
    validos: num(m.v.vv), brancos: num(m.v.vb), nulos: num(m.v.vn),
    cand,
  };
}

async function emLotes(itens, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0, feitos = 0;
  await Promise.all(Array.from({ length: CONCORRENCIA }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
      if (++feitos % 500 === 0) console.log(`  ${feitos}/${itens.length}`);
    }
  }));
  return resultados;
}

await mkdir(DADOS, { recursive: true });

// 1) Lista de municípios (código TSE, código IBGE, nome, UF), igual nos dois turnos
const cfg = decodificar(await baixar(`${BASE}/ele2026/${TURNOS[2]}/config/mun-e00${TURNOS[2]}-cm.jws`));
const locais = [];
for (const uf of cfg.abr) for (const mu of uf.mu) locais.push({ uf: uf.cd, tse: mu.cd, ibge: mu.cdi || null, nome: mu.nm });
console.log(`${locais.length} localidades (UFs: ${cfg.abr.length}). Config gerada em ${cfg.dg} ${cfg.hg}`);

// 2) Resultado por município em cada turno
const saida = {};
for (const [turno, ele] of Object.entries(TURNOS)) {
  const arq = path.join(DADOS, `bruto-turno${turno}.json`);
  if (existsSync(arq)) { saida[turno] = JSON.parse(await readFile(arq, 'utf8')); console.log(`turno ${turno}: cache`); continue; }
  console.log(`turno ${turno}: baixando…`);
  const lista = await emLotes(locais, async (l) => {
    const url = `${BASE}/ele2026/${ele}/dados/${l.uf}/${l.uf}${l.tse}-c0001-e00${ele}-u.jws`;
    try { return { ...l, ...extrair(decodificar(await baixar(url))) }; }
    catch (e) { return { ...l, erro: e.message }; }
  });
  saida[turno] = lista;
  await writeFile(arq, JSON.stringify(lista));
  const erros = lista.filter((x) => x.erro);
  console.log(`turno ${turno}: ${lista.length - erros.length} ok, ${erros.length} com erro`);
}

// 3) Malha municipal do IBGE (qualidade mínima)
const geo = path.join(DADOS, 'malha-municipios.geojson');
if (!existsSync(geo)) {
  const url = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima';
  await writeFile(geo, await baixar(url));
  console.log('malha IBGE salva');
}
console.log('coleta concluída');
