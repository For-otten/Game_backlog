import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const sourceFiles = [
  'index.html',
  'css/styles.css',
  'js/api.js',
  'js/ui.js',
  'js/app.js',
  'public/og.png'
];
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/server', { recursive: true });

const assets = {};
for (const file of sourceFiles) {
  const route = `/${file.replaceAll('\\', '/')}`;
  assets[route] = {
    type: types[extname(file)] || 'application/octet-stream',
    body: readFileSync(file).toString('base64')
  };
}
assets['/'] = assets['/index.html'];

const worker = `const ASSETS = ${JSON.stringify(assets)};

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const asset = ASSETS[url.pathname] || (url.pathname.endsWith('/') ? ASSETS['/'] : null);
    if (!asset) return new Response('Not found', { status: 404 });
    return new Response(decode(asset.body), {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control': url.pathname === '/' || url.pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=86400'
      }
    });
  }
};
`;

writeFileSync('dist/server/index.js', worker);
if (readFileSafe('.openai/hosting.json')) {
  mkdirSync('dist/.openai', { recursive: true });
  cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
}

function readFileSafe(path) {
  try { return readFileSync(path); } catch { return null; }
}

console.log(`Build concluído: ${sourceFiles.length} assets.`);
