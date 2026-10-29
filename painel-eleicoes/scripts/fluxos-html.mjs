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
if (!fluxos.bootstrap) throw new Error('dados/fluxos.json sem bootstrap: rode python scripts/fluxos.py --boot 100');
const meta = JSON.parse(await ler('dados', 'analise.json')).meta.atualizado;
const trocas = { FONTS: fontes, LOGO: `data:image/png;base64,${logo}`, FLUXOS: JSON.stringify(fluxos), META: JSON.stringify(meta) };
for (const [k, v] of Object.entries(trocas)) {
  if (!html.includes(`%%${k}%%`)) throw new Error(`marcador %%${k}%% não encontrado`);
  html = html.replace(`%%${k}%%`, () => v);
}
if (/<script[^>]+src=/i.test(html)) throw new Error('há <script src=...> externo no pacote');
const saida = path.join(RAIZ, 'dist', 'fluxos-votos-2026.html');
await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, html);
console.log(`gerado: ${saida} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
