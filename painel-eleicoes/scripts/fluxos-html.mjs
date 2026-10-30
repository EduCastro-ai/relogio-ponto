// Gera dist/fluxos-votos-2026.html: gráfico de fluxo (1º → 2º turno) autônomo, sem servidor, sem internet e sem bibliotecas externas.
// Pré-requisitos: dados/fluxos.json (python scripts/fluxos.py --boot 100), dados/analise.json (node scripts/analise.mjs),
// assets/portofino-logo-branco.png e Montserrat em dados/vendor/montserrat-5.1.0/.
// Uso: node scripts/fluxos-html.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...p) => readFile(path.join(RAIZ, ...p), 'utf8');
let html = await ler('apresentacao', 'fluxos.html');
const logo = (await readFile(path.join(RAIZ, 'assets', 'portofino-logo-branco.png'))).toString('base64');
let fontes = '';
for (const w of [400, 600, 700]) {
  const b64 = (await readFile(path.join(RAIZ, 'dados', 'vendor', 'montserrat-5.1.0', `montserrat-latin-${w}-normal.woff2`))).toString('base64');
  fontes += `@font-face { font-family:'Montserrat'; font-weight:${w}; font-style:normal; font-display:swap; src:url('data:font/woff2;base64,${b64}') format('woff2'); }\n`;
}
const fluxos = JSON.parse(await ler('dados', 'fluxos.json'));
if (!fluxos.recortes?.BR?.ic) throw new Error('dados/fluxos.json sem bootstrap: rode python scripts/fluxos.py --boot 100');
const analise = JSON.parse(await ler('dados', 'analise.json'));
const meta = analise.meta.atualizado;
// totais oficiais (soma das seções = totais do TSE) para as margens; o modelo de fluxo só entra nos fluxos
const pega = (o) => ({ L1: o.L1, F1: o.F1, O1: o.O1, L2: o.L2, F2: o.F2 });
// nome das capitais em minúsculas com iniciais maiúsculas (SÃO PAULO -> São Paulo)
const titulo = (s) => s.toLowerCase().replace(/(^|[\s-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase()).replace(/ (Da|De|Do|Das|Dos|E) /g, (x) => x.toLowerCase());
const oficial = {
  BR: pega(analise.brasil),
  UF: Object.fromEntries(analise.ufs.map((u) => [u.k.toUpperCase(), { ...pega(u), regiao: u.regiao }])),
  K: { ALL: pega(analise.capitaisAgg), INT: pega(analise.interiorAgg) },
  C: Object.fromEntries(analise.capitais.map((c) => [c.uf.toUpperCase(), { ...pega(c), nome: titulo(c.nome) }])),
};
const trocas = { FONTS: fontes, LOGO: `data:image/png;base64,${logo}`, FLUXOS: JSON.stringify(fluxos), META: JSON.stringify(meta), OFICIAL: JSON.stringify(oficial) };
for (const [k, v] of Object.entries(trocas)) {
  if (!html.includes(`%%${k}%%`)) throw new Error(`marcador %%${k}%% não encontrado`);
  html = html.replace(`%%${k}%%`, () => v);
}
if (/<script[^>]+src=/i.test(html)) throw new Error('há <script src=...> externo no pacote');
const saida = path.join(RAIZ, 'dist', 'fluxos-votos-2026.html');
await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, html);
console.log(`gerado: ${saida} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
