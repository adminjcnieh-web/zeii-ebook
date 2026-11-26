import * as api from './api.js';
import { route, dispatch, currentPath, navigate, cleanupCurrent } from './router.js';
import { icon } from './icons.js';
import { esc } from './utils.js';
import { renderAuth } from './auth.js';
import { homeView, shelfView } from './home.js';
import { novelView } from './novel.js';
import { readerView } from './reader.js';
import { accountView } from './account.js';
import { manageList, manageNovel, readersView } from './admin.js';

const root = document.getElementById('app');
let user = api.getSession()?.user || null;

function navItems(u) {
  const items = [['/', 'home', 'Beranda'], ['/rak', 'shelf', 'Rak'], ['/akun', 'user', 'Akun']];
  if (u.role === 'admin') items.splice(2, 0, ['/kelola', 'pen', 'Kelola']);
  return items;
}
const active = (href, path) => (href === '/' ? path === '/' : path.startsWith(href) || (href === '/kelola' && path === '/pembaca')) ? ' aria-current="page"' : '';

function shell(u) {
  const items = navItems(u);
  return `<header class="topbar"><div class="topbar-in"><a class="brand" href="#/"><span class="brand-mark"></span>Zeii Ebook</a>
    <nav class="topnav" id="topnav">${items.map(([h, , l]) => `<a href="#${h}" data-h="${h}">${l}</a>`).join('')}</nav></div></header>
    <main id="view" tabindex="-1"></main>
    <nav class="bottomnav" id="botnav" aria-label="Menu utama">${items.map(([h, i, l]) => `<a href="#${h}" data-h="${h}">${icon(i, 22)}<span>${l}</span></a>`).join('')}</nav>`;
}
function markNav(path) {
  document.querySelectorAll('[data-h]').forEach((a) => {
    const h = a.dataset.h;
    const on = h === '/' ? path === '/' || path.startsWith('/novel') : path.startsWith(h) || (h === '/kelola' && path === '/pembaca');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function mount() {
  root.innerHTML = shell(user);
  const view = document.getElementById('view');
  const run = async () => { const p = currentPath(); await dispatch(view, { user, onLogout: logout, onUser: (u) => { user = u; } }); markNav(p); };
  window.__zeiiRun = run;
  window.addEventListener('hashchange', run);
  mount.unmount = () => window.removeEventListener('hashchange', run);
  run();
}

function logout(message) {
  mount.unmount?.(); cleanupCurrent(); document.body.classList.remove('reading');
  api.logout(); user = null; showAuth(message || '');
}

function showAuth(notice = '') {
  history.replaceState(null, '', location.pathname);
  renderAuth(root, { notice, onDone: (u) => { user = u; navigate('/', { replace: true }); mount(); } });
}

route('/', homeView);
route('/rak', shelfView);
route('/novel/:id', novelView);
route('/baca/:id/:cid', readerView);
route('/akun', accountView);
route('/kelola', manageList, { roles: ['admin'] });
route('/kelola/:id', manageNovel, { roles: ['admin'] });
route('/pembaca', readersView, { roles: ['admin'] });

window.addEventListener('zeii:logout', (e) => { if (api.getSession() || user) logout(e.detail?.reason); });

async function start() {
  if (!api.getSession()) { showAuth(); return; }
  try { const r = await api.get('/api/me'); user = r.user; api.updateUser(user); } catch (e) { if (!api.getSession()) return; }
  if (user) mount(); else showAuth();
}
start();
