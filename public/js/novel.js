import * as api from './api.js';
import { esc, STATUS_LABEL, num, readMinutes, timeAgo } from './utils.js';
import { icon } from './icons.js';
import { coverHtml, hydrateCovers } from './cover.js';
import { loading, errorState, toast } from './ui.js';

export async function novelView({ container, params, user, isStale }) {
  container.innerHTML = loading();
  let d;
  try { d = await api.get(`/api/novels/${params.id}`); } catch (e) {
    container.innerHTML = errorState(e.status === 404 ? 'Novel ini tidak ditemukan atau belum terbit.' : e.message);
    container.querySelector('#retry')?.addEventListener('click', () => novelView({ container, params, user, isStale })); return;
  }
  if (isStale()) return;
  const { novel: n, chapters } = d; let shelf = d.shelf;
  const resume = shelf?.chapterId && chapters.find((c) => c.id === shelf.chapterId);
  const first = chapters[0];
  const readIdx = resume ? chapters.indexOf(resume) : -1;
  container.innerHTML = `<a class="btn btn-quiet btn-sm" href="#/" style="margin-left:-12px">${icon('chevL', 18)} Beranda</a>
    <div class="novel-head" style="margin-top:8px">${coverHtml(n)}<div>
      <h1>${esc(n.title)}</h1><div class="by">oleh ${esc(n.author || 'Zeii')}</div>
      <div class="stats"><span><b>${chapters.length}</b> bab</span><span><b>${num(n.wordCount)}</b> kata</span><span>±<b>${readMinutes(n.wordCount)}</b> menit baca</span></div>
      <div><span class="tag ${n.status === 'tamat' ? 'tag-tamat' : ''}">${esc(STATUS_LABEL[n.status] || '')}</span> ${n.published ? '' : '<span class="tag tag-draft">Draf, belum terbit</span>'} ${n.genres.map((g) => `<span class="tag tag-tamat">${esc(g)}</span>`).join(' ')}</div>
    </div></div>
    <div class="actions">${first ? `<a class="btn btn-primary" href="#/baca/${esc(n.id)}/${esc((resume || first).id)}">${resume ? `Lanjut Bab ${resume.no}` : 'Mulai membaca'}</a>` : '<span class="muted">Belum ada bab.</span>'}
      <button class="btn" id="fav" aria-pressed="${!!shelf?.fav}">${icon('heart')} <span>${shelf?.fav ? 'Favorit' : 'Tambah ke favorit'}</span></button>
      ${user.role === 'admin' ? `<a class="btn" href="#/kelola/${esc(n.id)}">${icon('pen')} Kelola</a>` : ''}</div>
    ${n.synopsis ? `<p class="synopsis">${esc(n.synopsis)}</p>` : ''}
    <h2 class="section-title">Daftar bab ${n.lastChapterAt ? `<span class="muted" style="font:14px var(--sans)">Terakhir diperbarui ${esc(timeAgo(n.lastChapterAt))}</span>` : ''}</h2>
    <ul class="chapters">${chapters.map((c, i) => `<li><a href="#/baca/${esc(n.id)}/${esc(c.id)}" class="${readIdx >= 0 && i < readIdx ? 'read' : ''}"><span class="no">${c.no}</span><span class="t">${esc(c.title)}${c.published ? '' : ' <span class="tag tag-draft">Draf</span>'}</span>${resume?.id === c.id ? '<span class="here">terakhir dibaca</span>' : `<span class="w">${num(c.words)} kata</span>`}</a></li>`).join('')}</ul>`;
  hydrateCovers(container, [n]);
  const fav = container.querySelector('#fav');
  fav.querySelector('.ic').style.fill = shelf?.fav ? 'currentColor' : 'none';
  fav.addEventListener('click', async () => {
    const next = !(shelf?.fav);
    fav.disabled = true;
    try {
      await api.put(`/api/shelf/${n.id}`, { fav: next });
      shelf = { ...(shelf || { chapterId: null, pos: 0 }), fav: next };
      fav.querySelector('span').textContent = next ? 'Favorit' : 'Tambah ke favorit';
      fav.querySelector('.ic').style.fill = next ? 'currentColor' : 'none';
      toast(next ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    } catch (e) { toast(e.message, 'error'); } finally { fav.disabled = false; }
  });
}
