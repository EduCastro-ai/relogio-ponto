// Servidor estático mínimo para abrir o painel em http://localhost:8765 (sem dependências). Uso: node scripts/servir.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT || 8765);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.geojson': 'application/json' };

createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arq = path.join(RAIZ, rel === '/' ? 'index.html' : rel);
  if (!arq.startsWith(RAIZ) || arq.includes(`${path.sep}scripts${path.sep}`)) { res.writeHead(403).end(); return; }
  let corpo;
  try { corpo = await readFile(arq); } catch { res.writeHead(404).end('não encontrado'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] ?? 'application/octet-stream' }).end(corpo);
}).listen(PORTA, () => console.log(`Painel em http://localhost:${PORTA}`));
