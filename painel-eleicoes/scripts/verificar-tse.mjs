// Verifica (só cabeçalho HTTP, sem baixar) se o TSE publicou nova versão dos arquivos por seção, o que indica o 2º turno.
// Uso: node scripts/verificar-tse.mjs            -> só verifica
//      node scripts/verificar-tse.mjs --baixar   -> baixa e extrai as versões novas (só rode depois de confirmar o download) e roda locais.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(RAIZ, 'dados', 'tse-csv');
const CDN = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
// pasta de extração = nome do zip sem extensão; entrada = CSV nacional dentro do zip
const ARQUIVOS = [
  { zip: 'votacao_secao_2026_BR.zip', url: `${CDN}/votacao_secao/votacao_secao_2026_BR.zip`, entradas: ['votacao_secao_2026_BR.csv', 'leiame.pdf'], resultado: true },
  { zip: 'detalhe_votacao_secao_2026.zip', url: `${CDN}/detalhe_votacao_secao/detalhe_votacao_secao_2026.zip`, entradas: ['detalhe_votacao_secao_2026_BR.csv', 'leiame.pdf'], resultado: true },
  { zip: 'eleitorado_local_votacao_2026.zip', url: `${CDN}/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip`, entradas: ['eleitorado_local_votacao_2026_BRASIL.csv', 'leiame.pdf'], resultado: false },
];
// versões baixadas em 26/10/2026 (Last-Modified do CDN)
const BASE = { 'votacao_secao_2026_BR.zip': 'Tue, 06 Oct 2026 19:22:49 GMT', 'detalhe_votacao_secao_2026.zip': 'Wed, 07 Oct 2026 20:54:59 GMT', 'eleitorado_local_votacao_2026.zip': 'Sun, 25 Oct 2026 18:32:19 GMT' };

const estArq = path.join(CSV, '.estado.json');
let estado; try { estado = JSON.parse(await readFile(estArq, 'utf8')); } catch { estado = { ...BASE }; await mkdir(CSV, { recursive: true }); await writeFile(estArq, JSON.stringify(estado, null, 2)); }

const novos = [];
for (const a of ARQUIVOS) {
  const r = await fetch(a.url, { method: 'HEAD' });
  const lm = r.headers.get('last-modified'), mb = (Number(r.headers.get('content-length')) / 1048576).toFixed(1);
  const mudou = lm && lm !== estado[a.zip];
  console.log(`${a.zip.padEnd(36)} ${mb.padStart(7)} MB  remoto: ${lm}  local: ${estado[a.zip]}  ${mudou ? '<< NOVA VERSÃO' : 'sem mudança'}`);
  if (mudou) novos.push({ ...a, lm });
}
const resultadoNovo = novos.some((n) => n.resultado);
console.log(resultadoNovo ? '\nO TSE atualizou arquivos de resultado por seção (provavelmente o 2º turno). Rode com --baixar após confirmar o download.' : '\nSem novidade nos arquivos de resultado por seção.');

if (process.argv.includes('--baixar') && novos.length) {
  for (const n of novos) {
    const dest = path.join(CSV, n.zip.replace(/\.zip$/, '')), zip = path.join(CSV, n.zip);
    await mkdir(dest, { recursive: true });
    console.log('baixando', n.zip);
    let p = spawnSync('curl.exe', ['-sS', '-L', '--fail', '-o', zip, n.url], { stdio: 'inherit' }); if (p.status) process.exit(p.status);
    p = spawnSync('tar', ['-xf', zip, '-C', dest, ...n.entradas], { stdio: 'inherit' }); if (p.status) process.exit(p.status);
    estado[n.zip] = n.lm; await writeFile(estArq, JSON.stringify(estado, null, 2));
  }
  const p = spawnSync('node', [path.join(RAIZ, 'scripts', 'locais.mjs')], { stdio: 'inherit' }); process.exit(p.status ?? 0);
}
