// Server pengujian lokal: melayani public/ (dengan header keamanan dari _headers, termasuk CSP) dan meneruskan /api/* ke Worker asli + Firebase TIRUAN.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../src/index.js';
import { createFake } from '../fake-google.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(here, '../../../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function parseHeaders() {
  const out = {};
  for (const line of fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8').split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

export async function startServer({ port = 8790 } = {}) {
  const fake = await createFake();
  fake.install();
  const env = { ...fake.env };
  const secHeaders = parseHeaders();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (url.pathname.startsWith('/api/')) {
        const out = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
        const h = {}; out.headers.forEach((v, k) => (h[k] = v));
        res.writeHead(out.status, h);
        return res.end(Buffer.from(await out.arrayBuffer()));
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.resolve(PUBLIC, '.' + rel);
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file) === '_headers') { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', ...secHeaders });
      res.end(fs.readFileSync(file));
    } catch (e) { console.error('dev-server error', e); res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, fake, env, close: () => new Promise((r) => server.close(r)) };
}
