// Pembaca: tampilan nyaman (huruf, ukuran, jarak, lebar, tema), progres otomatis, bab berikutnya.
import * as api from './api.js';
import { esc, debounce, safeGet, safeSet, hasNumber } from './utils.js';
import { icon } from './icons.js';
import { loading, errorState, openModal, toast } from './ui.js';

const DEFAULTS = () => ({ fs: 19, ff: 'serif', lh: 1.8, wd: 38, rt: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' });
const KEY = 'zeii.reader';
const getPrefs = () => ({ ...DEFAULTS(), ...(safeGet(KEY, {}) || {}) });

function renderText(text) {
  const parts = text.split(/\n\n+/);
  let prevBreak = true;
  return parts.map((p, i) => {
    if (/^(\*\s*){3,}$/.test(p.trim())) { prevBreak = true; return '<p class="brk" aria-hidden="true">***</p>'; }
    const cls = prevBreak ? (i === 0 ? 'first' : 'after-break') : '';
    prevBreak = false;
    return `<p class="${cls}">${esc(p).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

export async function readerView({ container, params, isStale }) {
  const { id: novelId, cid } = params;
  container.innerHTML = loading('Membuka bab');
  let d;
  try { d = await api.get(`/api/novels/${novelId}/chapters/${cid}`); } catch (e) {
    container.innerHTML = `<div style="padding:24px">${errorState(e.status === 404 ? 'Bab ini tidak ditemukan atau belum terbit.' : e.message)}<p style="text-align:center"><a href="#/novel/${esc(novelId)}">Kembali ke novel</a></p></div>`;
    container.querySelector('#retry')?.addEventListener('click', () => readerView({ container, params, isStale })); return;
  }
  if (isStale()) return;
  document.body.classList.add('reading');
  const { chapter: c, novel, prev, next } = d;
  let prefs = getPrefs();
  const applyPrefs = (el) => {
    el.dataset.rt = prefs.rt; el.dataset.ff = prefs.ff;
    el.style.setProperty('--fs', prefs.fs + 'px'); el.style.setProperty('--lh', prefs.lh); el.style.setProperty('--wd', prefs.wd + 'rem');
  };
  container.innerHTML = `<div class="reader" id="reader"><div class="rprog" id="rprog"></div>
    <div class="rbar rbar-top"><a class="btn btn-icon" href="#/novel/${esc(novelId)}" aria-label="Kembali ke novel">${icon('chevL')}</a>
      <div class="rtitle">${esc(novel.title)} · Bab ${c.no}</div>
      <button class="btn btn-icon" id="r-list" aria-label="Daftar bab">${icon('list')}</button><button class="btn btn-icon" id="r-set" aria-label="Pengaturan baca">${icon('type')}</button></div>
    <article class="rbody" id="rbody">${hasNumber(c.title) ? '' : `<span class="no">BAB ${c.no}</span>`}<h1>${esc(c.title)}</h1>${renderText(c.text)}
      <div class="endnav">${next ? `<a class="btn" href="#/baca/${esc(novelId)}/${esc(next.id)}">Bab berikutnya: ${esc(next.title)} ${icon('chevR', 18)}</a>` : '<p class="muted" style="text-align:center">Kamu sudah sampai bab terakhir yang terbit.</p>'}
        <a class="btn alt" href="#/novel/${esc(novelId)}">Kembali ke halaman novel</a></div></article>
    <div class="rbar rbar-bot"><a class="btn ${prev ? '' : 'disabled'}" ${prev ? `href="#/baca/${esc(novelId)}/${esc(prev.id)}"` : 'aria-disabled="true" style="opacity:.35;pointer-events:none"'}>${icon('chevL', 18)} Sebelumnya</a>
      <span class="rtitle" style="flex:none">${d.index} / ${d.total}</span>
      <a class="btn" ${next ? `href="#/baca/${esc(novelId)}/${esc(next.id)}"` : 'aria-disabled="true" style="opacity:.35;pointer-events:none"'}>Berikutnya ${icon('chevR', 18)}</a></div></div>`;
  const reader = container.querySelector('#reader');
  applyPrefs(reader);
  document.title = `${c.title} · ${novel.title} · Zeii Ebook`;

  // ----- progres -----
  const scrollable = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const frac = () => Math.min(1, Math.max(0, window.scrollY / scrollable()));
  let lastSaved = d.saved ? d.saved.pos : 0; let dirty = false; let alive = true;
  const send = (pos) => api.put(`/api/shelf/${novelId}`, { pos }).then(() => { lastSaved = pos; dirty = false; }).catch(() => {});
  const saveSoon = debounce(() => { if (alive && Math.abs(frac() - lastSaved) > 0.01) send(Math.round(frac() * 1000) / 1000); }, 7000);
  if (!d.saved) api.put(`/api/shelf/${novelId}`, { chapterId: c.id }).catch(() => {});
  const restore = () => { if (d.saved && d.saved.pos > 0.005 && d.saved.pos < 0.995) window.scrollTo(0, d.saved.pos * scrollable()); };
  restore();
  document.fonts?.ready.then(() => { if (alive && window.scrollY < 5) restore(); });

  const prog = container.querySelector('#rprog');
  let lastY = 0;
  const onScroll = () => {
    const f = frac(); prog.style.width = f * 100 + '%';
    const y = window.scrollY;
    if (y > lastY + 8 && y > 120) reader.classList.add('hide'); else if (y < lastY - 8) reader.classList.remove('hide');
    lastY = y; dirty = true; saveSoon();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  container.querySelector('#rbody').addEventListener('click', (e) => { if (!e.target.closest('a')) reader.classList.toggle('hide'); });
  const flush = () => { if (dirty && Math.abs(frac() - lastSaved) > 0.005) send(Math.round(frac() * 1000) / 1000); };
  const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onVis);

  // ----- daftar bab & pengaturan -----
  container.querySelector('#r-list').addEventListener('click', async () => {
    const m = openModal({ title: 'Daftar bab', sheet: true, html: loading() });
    try {
      const r = await api.get(`/api/novels/${novelId}`);
      m.body.innerHTML = `<ul class="chapters">${r.chapters.map((x) => `<li><a href="#/baca/${esc(novelId)}/${esc(x.id)}" data-x><span class="no">${x.no}</span><span class="t" ${x.id === c.id ? 'style="color:var(--accent);font-weight:700"' : ''}>${esc(x.title)}</span></a></li>`).join('')}</ul>`;
      m.body.querySelectorAll('[data-x]').forEach((a) => a.addEventListener('click', () => m.close()));
      m.body.querySelector('[style*=accent]')?.scrollIntoView({ block: 'center' });
    } catch (e) { m.body.innerHTML = `<p>${esc(e.message)}</p>`; }
  });
  container.querySelector('#r-set').addEventListener('click', () => {
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    const m = openModal({ title: 'Tampilan baca', sheet: true, html: `<div class="settings-grid">
      <div class="field" style="margin:0"><label>Tema</label>${seg('rt', [['light', 'Terang'], ['sepia', 'Sepia'], ['dark', 'Gelap']], prefs.rt)}</div>
      <div class="field" style="margin:0"><label for="s-fs">Ukuran huruf: <span id="s-fsv">${prefs.fs}</span></label><input class="range" id="s-fs" type="range" min="15" max="28" step="1" value="${prefs.fs}" /></div>
      <div class="field" style="margin:0"><label>Jenis huruf</label>${seg('ff', [['serif', 'Berkait'], ['sans', 'Polos']], prefs.ff)}</div>
      <div class="field" style="margin:0"><label>Jarak baris</label>${seg('lh', [[1.6, 'Rapat'], [1.8, 'Normal'], [2.05, 'Lega']], prefs.lh)}</div>
      <div class="field" style="margin:0"><label>Lebar teks</label>${seg('wd', [[30, 'Sempit'], [38, 'Sedang'], [48, 'Lebar']], prefs.wd)}</div></div>` });
    const set = (k, v) => { prefs = { ...prefs, [k]: v }; safeSet(KEY, prefs); applyPrefs(reader); };
    m.body.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const k = g.dataset.seg; set(k, k === 'ff' || k === 'rt' ? b.dataset.v : Number(b.dataset.v));
    }));
    m.body.querySelector('#s-fs').addEventListener('input', (e) => { m.body.querySelector('#s-fsv').textContent = e.target.value; set('fs', Number(e.target.value)); });
  });

  return () => {
    alive = false; saveSoon.cancel(); flush();
    window.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('reading'); document.title = 'Zeii Ebook';
  };
}
