import * as api from './api.js';
import { esc, STATUS_LABEL, debounce, chapterLabel } from './utils.js';
import { icon } from './icons.js';
import { coverHtml, hydrateCovers } from './cover.js';
import { loading, errorState, emptyState } from './ui.js';

export const novelCard = (n) => `<a class="card" href="#/novel/${esc(n.id)}">${coverHtml(n)}<h3>${esc(n.title)}</h3>
  <div class="meta">${n.published ? '' : '<span class="tag tag-draft">Draf</span> '}${n.chapterCount} bab · ${esc(STATUS_LABEL[n.status] || '')}</div></a>`;

export async function homeView({ container, user, isStale }) {
  container.innerHTML = loading();
  let novels, shelf;
  try { [novels, shelf] = await Promise.all([api.get('/api/novels'), api.get('/api/shelf')]); } catch (e) {
    container.innerHTML = errorState(e.message); container.querySelector('#retry')?.addEventListener('click', () => homeView({ container, user, isStale })); return;
  }
  if (isStale()) return;
  const all = novels.novels; const items = shelf.items;
  const last = items.find((i) => i.chapterId);
  const genres = [...new Set(all.flatMap((n) => n.genres))].sort((a, b) => a.localeCompare(b, 'id'));
  let q = ''; let g = '';
  const hello = user.fullName.split(' ')[0];
  container.innerHTML = `<div class="page-head"><div><h1>Halo, ${esc(hello)}</h1><div class="muted">${all.length ? 'Mau baca apa hari ini?' : 'Belum ada novel yang terbit.'}</div></div></div>
    ${last ? `<a class="resume" href="#/baca/${esc(last.novelId)}/${esc(last.chapterId)}" data-resume>${coverHtml(last.novel)}<div><small>Lanjutkan membaca</small><h2>${esc(last.novel.title)}</h2>
      <div class="where">${esc(chapterLabel(last.chapterNo, last.chapterTitle))}</div>
      <div class="bar" aria-label="Posisi di bab ini"><i style="width:${Math.round(last.pos * 100)}%"></i></div><span class="go">Lanjut ${icon('chevR', 16)}</span></div></a>` : ''}
    ${all.length ? `<div class="tools"><div class="search">${icon('search')}<input class="input" id="q" type="search" placeholder="Cari judul atau penulis" aria-label="Cari novel" /></div>
      ${genres.length ? `<div class="chips" id="chips"><button class="chip" aria-pressed="true" data-g="">Semua</button>${genres.map((x) => `<button class="chip" aria-pressed="false" data-g="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}</div>
      <div class="grid" id="grid"></div>` : emptyState({ title: 'Perpustakaan masih kosong', text: user.role === 'admin' ? 'Tambahkan novel pertamamu di menu Kelola.' : 'Tunggu novel pertama terbit ya.', action: user.role === 'admin' ? '<a class="btn btn-primary" href="#/kelola">Buka Kelola</a>' : '' })}`;
  hydrateCovers(container, [...all, ...(last ? [last.novel] : [])]);
  const grid = container.querySelector('#grid');
  if (!grid) return;
  const draw = () => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((n) => (!g || n.genres.includes(g)) && (!needle || `${n.title} ${n.author}`.toLowerCase().includes(needle)));
    grid.innerHTML = list.length ? list.map(novelCard).join('') : `<div class="empty" style="grid-column:1/-1"><h3>Tidak ada yang cocok</h3><p>Coba kata kunci atau genre lain.</p></div>`;
    hydrateCovers(grid, list);
  };
  draw();
  container.querySelector('#q').addEventListener('input', debounce((e) => { q = e.target.value; draw(); }, 150));
  container.querySelector('#chips')?.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return; g = b.dataset.g;
    container.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); draw();
  });
}

export async function shelfView({ container, isStale }) {
  container.innerHTML = loading();
  let r;
  try { r = await api.get('/api/shelf'); } catch (e) { container.innerHTML = errorState(e.message); container.querySelector('#retry')?.addEventListener('click', () => shelfView({ container, isStale })); return; }
  if (isStale()) return;
  const items = r.items; let tab = 'baca';
  container.innerHTML = `<div class="page-head"><h1>Rak saya</h1></div><div class="chips" id="tabs"><button class="chip" data-t="baca" aria-pressed="true">Sedang dibaca</button><button class="chip" data-t="fav" aria-pressed="false">Favorit</button></div><div class="grid" id="grid"></div>`;
  const grid = container.querySelector('#grid');
  const draw = () => {
    const list = tab === 'fav' ? items.filter((i) => i.fav) : items.filter((i) => i.chapterId);
    grid.innerHTML = list.length ? list.map((i) => `<a class="card" href="#/${i.chapterId && tab === 'baca' ? `baca/${esc(i.novelId)}/${esc(i.chapterId)}` : `novel/${esc(i.novelId)}`}">${coverHtml(i.novel)}<h3>${esc(i.novel.title)}</h3>
      <div class="meta">${tab === 'baca' && i.chapterNo ? `Bab ${i.chapterNo} · ${Math.round(i.pos * 100)}%` : `${i.novel.chapterCount} bab`}</div></a>`).join('')
      : `<div class="empty" style="grid-column:1/-1"><h3>${tab === 'fav' ? 'Belum ada favorit' : 'Belum ada bacaan'}</h3><p>${tab === 'fav' ? 'Ketuk ikon hati di halaman novel untuk menyimpannya di sini.' : 'Novel yang kamu buka akan muncul di sini, lengkap dengan posisi terakhirmu.'}</p><a class="btn" href="#/">Cari novel</a></div>`;
    hydrateCovers(grid, list.map((i) => i.novel));
  };
  draw();
  container.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; tab = b.dataset.t; container.querySelectorAll('#tabs .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b))); draw(); });
}
