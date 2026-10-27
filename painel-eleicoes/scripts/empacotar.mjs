// Gera um HTML autônomo (sem servidor, sem internet): embute d3, os dados por município e a malha do IBGE no index.html.
// Pré-requisitos: dados/painel.js e dados/malha.js (processar.mjs) e dados/vendor/d3-7.9.0/d3.min.js.
// A camada opcional de locais de votação (?locais=1, 11 MB) não entra no pacote.
// Uso: node scripts/empacotar.mjs  ->  dist/painel-eleicoes-2026.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...p) => readFile(path.join(RAIZ, ...p), 'utf8');
// evita que "</script" dentro dos dados/bibliotecas feche o bloco inline
const inline = (js) => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;

let html = await ler('index.html');
const logo = (await readFile(path.join(RAIZ, 'assets', 'portofino-logo-branco.png'))).toString('base64');
// Montserrat 400/600/700 (latin, @fontsource/montserrat 5.1.0, licença OFL) embutida em base64
const fontes = {};
for (const w of [400, 600, 700]) { const n = `montserrat-latin-${w}-normal.woff2`; fontes[n] = (await readFile(path.join(RAIZ, 'dados', 'vendor', 'montserrat-5.1.0', n))).toString('base64'); }
const trocas = [
  [/src="assets\/portofino-logo-branco\.png"/, `src="data:image/png;base64,${logo}"`], // logo embutido
  [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/d3\/7\.9\.0\/d3\.min\.js"><\/script>/, inline(await ler('dados', 'vendor', 'd3-7.9.0', 'd3.min.js'))],
  [/<script src="dados\/painel\.js"><\/script>/, inline(await ler('dados', 'painel.js'))],
  [/<script src="dados\/malha\.js"><\/script>/, inline(await ler('dados', 'malha.js'))],
  [/<script>if \(location\.search\.includes\('locais'\)\)[^\n]*<\/script>\n?/, ''], // carregador da camada de locais (precisa de servidor)
];
for (const [padrao, novo] of trocas) {
  if (!padrao.test(html)) throw new Error(`trecho não encontrado no index.html: ${padrao}`);
  html = html.replace(padrao, () => novo); // função: evita interpretar "$" no texto inserido
}
html = html.replace(/url\('dados\/vendor\/montserrat-5\.1\.0\/([^']+)'\)/g, (_, n) => `url('data:font/woff2;base64,${fontes[n]}')`);
if (html.includes('dados/vendor/')) throw new Error('ainda há referência a dados/vendor no pacote');
if (/<script[^>]+src=/i.test(html)) throw new Error('ainda há <script src=...> externo no pacote');
if (/<img[^>]+src="(?!data:)/i.test(html)) throw new Error('ainda há <img src=...> externo no pacote');

const saida = path.join(RAIZ, 'dist', 'painel-eleicoes-2026.html');
await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, html);
console.log(`gerado: ${saida} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB)`);
