import { icon } from './icons.js';
import { esc } from './utils.js';

export function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 18)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6500 : 3200);
}

let openCount = 0;
/** Modal / lembar bawah. footer: [{label, kind, onClick(api) , close}] */
export function openModal({ title, html = '', footer = [], wide = false, sheet = false, onClose }) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const prev = document.activeElement;
  overlay.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''} ${sheet ? 'modal-sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn btn-quiet btn-icon" data-close aria-label="Tutup">${icon('x')}</button></div>
    <div class="modal-body">${html}</div>${footer.length ? '<div class="modal-foot"></div>' : ''}</div>`;
  root.appendChild(overlay);
  openCount++; document.body.style.overflow = 'hidden';
  const body = overlay.querySelector('.modal-body');
  let closed = false;
  const close = (r) => {
    if (closed) return; closed = true;
    overlay.remove(); openCount--; if (openCount <= 0) document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    try { prev?.focus?.(); } catch { /* abaikan */ }
    onClose?.(r);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', () => close());
  const api = {
    el: overlay, body, close,
    error(msg) {
      let box = body.querySelector('.form-error');
      if (!box) { box = document.createElement('div'); box.className = 'form-error'; box.setAttribute('role', 'alert'); body.prepend(box); }
      box.innerHTML = `${icon('alert', 18)}<span>${esc(msg)}</span>`; body.scrollTop = 0;
    },
    clearError() { body.querySelector('.form-error')?.remove(); },
  };
  const foot = overlay.querySelector('.modal-foot');
  for (const f of footer) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `btn ${f.kind ? 'btn-' + f.kind : ''}`; b.textContent = f.label;
    b.addEventListener('click', async () => {
      if (f.onClick) {
        b.disabled = true;
        try { const r = await f.onClick(api); if (r === false) { b.disabled = false; return; } } catch (e) { api.error(e.message || 'Terjadi kesalahan'); b.disabled = false; return; }
        b.disabled = false;
      }
      if (f.close !== false) close(f.value);
    });
    foot.appendChild(b);
  }
  setTimeout(() => (body.querySelector('input:not([type=hidden]), select, textarea') || overlay.querySelector('.btn-primary') || overlay.querySelector('[data-close]'))?.focus(), 30);
  return api;
}

export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', danger = false }) {
  return new Promise((resolve) => {
    let ok = false;
    openModal({ title, html: `<p>${esc(message)}</p>`, footer: [{ label: 'Batal' }, { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { ok = true; } }], onClose: () => resolve(ok) });
  });
}

export const loading = (t = 'Memuat') => `<div class="loading" role="status"><span class="spinner"></span>${esc(t)}</div>`;
export const emptyState = ({ title, text = '', action = '' }) => `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const errorState = (msg) => `<div class="empty"><h3>Belum bisa dimuat</h3><p>${esc(msg)}</p><button class="btn" id="retry">Coba lagi</button></div>`;

export async function busy(btn, label, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}
