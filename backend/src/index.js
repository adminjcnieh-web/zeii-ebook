// Zeii Ebook - API (Cloudflare Worker). File statis (folder public/) dilayani oleh Workers Static Assets.
import { HttpError, json, readJson } from './lib/http.js';
import { Firestore } from './lib/firestore.js';
import { authenticate } from './lib/guard.js';
import * as auth from './routes/auth.js';
import * as users from './routes/users.js';
import * as novels from './routes/novels.js';
import * as chapters from './routes/chapters.js';
import * as shelf from './routes/shelf.js';

// [method, pola, handler, publik?]
const ROUTES = [
  ['GET', '/api/health', async () => ({ ok: true }), true],
  ['POST', '/api/auth/register', auth.register, true],
  ['POST', '/api/auth/login', auth.login, true],
  ['POST', '/api/auth/refresh', auth.refresh, true],

  ['GET', '/api/me', auth.me],
  ['PATCH', '/api/me', auth.rename],
  ['POST', '/api/me/password', auth.changePassword],

  ['GET', '/api/novels', novels.list],
  ['POST', '/api/novels', novels.create],
  ['GET', '/api/novels/:id', novels.detail],
  ['PATCH', '/api/novels/:id', novels.update],
  ['DELETE', '/api/novels/:id', novels.remove],
  ['GET', '/api/novels/:id/cover', novels.getCover],
  ['PUT', '/api/novels/:id/cover', novels.putCover],
  ['DELETE', '/api/novels/:id/cover', novels.deleteCover],

  ['POST', '/api/novels/:id/chapters', chapters.addMany],
  ['DELETE', '/api/novels/:id/chapters', chapters.removeAll],
  ['GET', '/api/novels/:id/chapters/:cid', chapters.get],
  ['PATCH', '/api/novels/:id/chapters/:cid', chapters.update],
  ['DELETE', '/api/novels/:id/chapters/:cid', chapters.remove],

  ['GET', '/api/shelf', shelf.list],
  ['PUT', '/api/shelf/:novelId', shelf.put],
  ['DELETE', '/api/shelf/:novelId', shelf.remove],

  ['GET', '/api/users', users.list],
  ['POST', '/api/users/:uid/active', users.setActive],
  ['POST', '/api/users/:uid/password', users.resetPassword],
].map(([method, pattern, handler, isPublic]) => ({
  method,
  handler,
  isPublic: !!isPublic,
  regex: new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, '(?<$1>[^/]+)') + '/?$'),
}));

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', vary: 'origin' };
}

async function handleApi(request, env, url) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    let pathMatched = false;
    for (const route of ROUTES) {
      const m = route.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== request.method) continue;
      const ctx = { request, env, url, params: m.groups || {}, now: new Date(), fs: new Firestore(env), json: (max) => readJson(request, max), auth: null };
      if (!route.isPublic) ctx.auth = await authenticate(ctx);
      const result = await route.handler(ctx);
      if (result instanceof Response) {
        for (const [k, val] of Object.entries(cors)) result.headers.set(k, val);
        return result;
      }
      return json(result, 200, cors);
    }
    throw pathMatched ? new HttpError(405, 'Metode tidak diizinkan', 'method_not_allowed') : new HttpError(404, 'Endpoint tidak ditemukan', 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, cors);
    console.error('Kesalahan tak terduga:', e?.stack || e);
    return json({ error: { code: 'internal', message: 'Terjadi kesalahan di server. Coba lagi nanti.' } }, 500, cors);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') return handleApi(request, env, url);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

export { handleApi };
