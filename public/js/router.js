// Router berbasis hash (#/path). Cocok untuk hosting statis, tanpa konfigurasi server.
const routes = [];
let current = null;
let renderToken = 0;

/** pattern contoh: '/members/:uid'. render(ctx) boleh mengembalikan fungsi cleanup. */
export function route(pattern, handler, { roles } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ pattern, re, keys, handler, roles });
}

export function currentPath() {
  return (location.hash.replace(/^#/, '') || '/').split('?')[0];
}

export function query() {
  return new URLSearchParams((location.hash.split('?')[1] || ''));
}

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', '#' + path);
  else location.hash = '#' + path;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Menjalankan route sesuai hash. ctxBase berisi user, dsb. */
export async function dispatch(container, ctxBase) {
  const path = currentPath();
  const token = ++renderToken;
  if (current?.cleanup) {
    try { current.cleanup(); } catch (e) { console.error(e); }
  }
  current = null;

  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    if (r.roles && !r.roles.includes(ctxBase.user.role)) {
      container.innerHTML = '';
      navigate('/', { replace: true });
      return null;
    }
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    container.innerHTML = '';
    container.scrollTop = 0;
    window.scrollTo(0, 0);
    const isStale = () => token !== renderToken;
    const cleanup = await r.handler({ ...ctxBase, container, params, path, query: query(), isStale });
    if (isStale()) {
      if (typeof cleanup === 'function') cleanup();
      return path;
    }
    current = { cleanup };
    return path;
  }
  navigate('/', { replace: true });
  return null;
}

export function cleanupCurrent() {
  if (current?.cleanup) {
    try { current.cleanup(); } catch (e) { console.error(e); }
  }
  current = null;
  renderToken++;
}
