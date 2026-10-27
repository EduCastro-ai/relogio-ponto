// Gera dist/apresentacao-virada-2026.html: apresentação autônoma (sem servidor e sem internet) "Por que Lula virou no 2º turno".
// Pré-requisitos: node scripts/analise.mjs (dados/analise.json), dados/malha.js, d3 e Montserrat em dados/vendor/.
// Uso: node scripts/apresentacao.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...p) => readFile(path.join(RAIZ, ...p), 'utf8');
const esc = (js) => js.replace(/<\/script/gi, '<\/script');
let html = await ler('apresentacao', 'virada.html');
const logo = (await readFile(path.join(RAIZ, 'assets', 'portofino-logo-branco.png'))).toString('base64');
let fontes = '';
for (const w of [400, 600, 700]) {
  const b64 = (await readFile(path.join(RAIZ, 'dados', 'vendor', 'montserrat-5.1.0', `montserrat-latin-${w}-normal.woff2`))).toString('base64');
  fontes += `@font-face { font-family:'Montserrat'; font-weight:${w}; font-style:normal; font-display:swap; src:url('data:font/woff2;base64,${b64}') format('woff2'); }\n`;
}
const trocas = { FONTS: fontes, D3: esc(await ler('dados', 'vendor', 'd3-7.9.0', 'd3.min.js')), ANALISE: esc(await ler('dados', 'analise.json')), MALHA: esc(await ler('dados', 'malha.js')), LOGO: `data:image/png;base64,${logo}` };
for (const [k, v] of Object.entries(trocas)) {
  if (!html.includes(`%%${k}%%`)) throw new Error(`marcador %%${k}%% não encontrado`);
  html = html.replace(`%%${k}%%`, () => v);
}
if (/<script[^>]+src=/i.test(html) || /https?:\/\//.test(html.replace(/https?:\/\/(www\.)?(resultados\.tse\.jus\.br|w3\.org)[^"'\s<)]*/g, '').match(/<(script|link|img)[^>]+(src|href)="https?:/i)?.[0] ?? '')) throw new Error('há recurso externo no pacote');
const saida = path.join(RAIZ, 'dist', 'apresentacao-virada-2026.html');
await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, html);
console.log(`gerado: ${saida} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
