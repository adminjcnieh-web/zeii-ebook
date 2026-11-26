// Halaman penulis (admin): daftar novel, kelola satu novel (info, sampul, bab, impor), daftar pembaca.
import * as api from './api.js';
import { esc, STATUS_LABEL, num, loadScript, timeAgo } from './utils.js';
import { icon } from './icons.js';
import { coverHtml, hydrateCovers, resizeCover } from './cover.js';
import { openModal, confirmDialog, toast, loading, errorState, emptyState, busy } from './ui.js';
import { readManuscript, splitChapters, splitByWords, splitLong } from './import.js';

const GENRES = ['Romansa', 'Fantasi', 'Drama', 'Misteri', 'Horor', 'Komedi', 'Petualangan', 'Slice of Life', 'Fiksi Ilmiah', 'Sejarah'];

function novelForm(n = {}) {
  return `<div class="field"><label for="n-title">Judul</label><input class="input" id="n-title" maxlength="100" value="${esc(n.title || '')}" required /></div>
    <div class="field"><label for="n-author">Nama penulis</label><input class="input" id="n-author" maxlength="60" value="${esc(n.author || '')}" /></div>
    <div class="field"><label for="n-syn">Sinopsis</label><textarea class="textarea" id="n-syn" maxlength="2000">${esc(n.synopsis || '')}</textarea></div>
    <div class="field"><label for="n-genre">Genre</label><input class="input" id="n-genre" list="genres" value="${esc((n.genres || []).join(', '))}" placeholder="Pisahkan dengan koma, maksimal 5" /><datalist id="genres">${GENRES.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div>
    <div class="two"><div class="field"><label for="n-status">Status</label><select class="select" id="n-status">${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${(n.status || 'berlanjut') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>Terbit</label><label class="check"><input type="checkbox" id="n-pub" ${n.published ? 'checked' : ''} /> Tampilkan ke pembaca</label></div></div>`;
}
const readNovelForm = (root) => ({
  title: root.querySelector('#n-title').value, author: root.querySelector('#n-author').value, synopsis: root.querySelector('#n-syn').value,
  genres: root.querySelector('#n-genre').value.split(',').map((s) => s.trim()).filter(Boolean), status: root.querySelector('#n-status').value, published: root.querySelector('#n-pub').checked,
});

export async function manageList({ container, user, isStale }) {
  container.innerHTML = loading();
  let r;
  try { r = await api.get('/api/novels'); } catch (e) { container.innerHTML = errorState(e.message); container.querySelector('#retry')?.addEventListener('click', () => manageList({ container, user, isStale })); return; }
  if (isStale()) return;
  container.innerHTML = `<div class="page-head"><h1>Kelola novel</h1><div style="display:flex;gap:8px"><a class="btn" href="#/pembaca">${icon('users')} Pembaca</a><button class="btn btn-primary" id="new">${icon('plus')} Novel baru</button></div></div>
    <div class="panel">${r.novels.length ? r.novels.map((n) => `<a class="row" href="#/kelola/${esc(n.id)}" style="text-decoration:none;color:inherit"><div class="thumb">${coverHtml(n)}</div><div class="grow"><b>${esc(n.title)}</b><div class="small">${n.chapterCount} bab · ${num(n.wordCount)} kata · ${esc(STATUS_LABEL[n.status])}</div></div>${n.published ? '<span class="tag">Terbit</span>' : '<span class="tag tag-draft">Draf</span>'}${icon('chevR')}</a>`).join('') : emptyState({ title: 'Belum ada novel', text: 'Mulai dengan menekan "Novel baru".' })}</div>`;
  hydrateCovers(container, r.novels);
  container.querySelector('#new').addEventListener('click', () => {
    openModal({ title: 'Novel baru', html: `<div id="nf">${novelForm({ author: user.fullName })}</div><p class="hint">Setelah dibuat, kamu bisa mengunggah sampul dan naskah.</p>`, footer: [{ label: 'Batal' }, { label: 'Buat novel', kind: 'primary', close: false, onClick: async (m) => {
      const res = await api.post('/api/novels', readNovelForm(m.body)); m.close(); location.hash = `#/kelola/${res.novel.id}`;
    } }] });
  });
}

export async function manageNovel({ container, params, user, isStale }) {
  container.innerHTML = loading();
  const load = () => api.get(`/api/novels/${params.id}`);
  let d;
  try { d = await load(); } catch (e) { container.innerHTML = errorState(e.message); container.querySelector('#retry')?.addEventListener('click', () => manageNovel({ container, params, user, isStale })); return; }
  if (isStale()) return;
  const draw = () => {
    const { novel: n, chapters } = d;
    container.innerHTML = `<a class="btn btn-quiet btn-sm" href="#/kelola" style="margin-left:-12px">${icon('chevL', 18)} Semua novel</a>
      <div class="page-head" style="margin-top:6px"><h1>${esc(n.title)}</h1><div style="display:flex;gap:8px"><a class="btn" href="#/novel/${esc(n.id)}">${icon('eye')} Lihat</a><button class="btn btn-danger btn-sm" id="del">${icon('trash', 18)} Hapus novel</button></div></div>
      <div class="panel"><h2>Info novel</h2><div id="nf">${novelForm(n)}</div><button class="btn btn-primary" id="save">Simpan perubahan</button></div>
      <div class="panel"><h2>Sampul</h2><div class="row" style="border:0"><div class="thumb" style="width:80px">${coverHtml(n)}</div><div class="grow"><p class="small" style="margin:0 0 10px">Gambar apa saja, otomatis dipotong 2:3 dan dikecilkan. Tanpa sampul, dibuat otomatis dari judul.</p>
        <input type="file" id="cv" accept="image/*" hidden /><button class="btn btn-sm" id="cv-go">${icon('upload', 18)} Pilih gambar</button> ${n.coverVer ? '<button class="btn btn-sm btn-quiet" id="cv-del">Hapus sampul</button>' : ''}</div></div></div>
      <div class="panel"><h2>Bab (${chapters.length})</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn btn-primary" id="imp">${icon('upload')} Impor dari Word / PDF / TXT</button><button class="btn" id="addm">${icon('plus')} Tulis bab manual</button>${chapters.length ? '<button class="btn btn-quiet" id="clr">Hapus semua bab</button>' : ''}</div>
        ${chapters.length ? chapters.map((c) => `<div class="row"><span class="small" style="min-width:2em">${c.no}</span><div class="grow"><b>${esc(c.title)}</b><div class="small">${num(c.words)} kata${c.published ? '' : ' · Draf'}</div></div>
          <button class="btn btn-quiet btn-icon btn-sm" data-pub="${esc(c.id)}" aria-label="${c.published ? 'Jadikan draf' : 'Terbitkan'}" title="${c.published ? 'Sembunyikan dari pembaca' : 'Terbitkan'}">${icon(c.published ? 'eye' : 'eyeOff', 18)}</button>
          <button class="btn btn-quiet btn-icon btn-sm" data-edit="${esc(c.id)}" aria-label="Ubah bab">${icon('edit', 18)}</button>
          <button class="btn btn-quiet btn-icon btn-sm" data-rm="${esc(c.id)}" aria-label="Hapus bab">${icon('trash', 18)}</button></div>`).join('') : '<p class="muted">Belum ada bab. Impor naskahmu atau tulis manual.</p>'}</div>`;
    hydrateCovers(container, [n]);
    const $ = (s) => container.querySelector(s);
    const refresh = async () => { d = await load(); draw(); };
    $('#save').addEventListener('click', (e) => busy(e.currentTarget, 'Menyimpan', async () => {
      try { await api.patch(`/api/novels/${n.id}`, readNovelForm($('#nf'))); toast('Tersimpan'); await refresh(); } catch (ex) { toast(ex.message, 'error'); }
    }));
    $('#del').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Hapus novel ini?', message: `"${n.title}" beserta semua bab, sampul, dan progres pembaca akan dihapus permanen.`, confirmLabel: 'Hapus permanen', danger: true }))) return;
      try { await api.del(`/api/novels/${n.id}`); toast('Novel dihapus'); location.hash = '#/kelola'; } catch (ex) { toast(ex.message, 'error'); }
    });
    $('#cv-go').addEventListener('click', () => $('#cv').click());
    $('#cv').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { await api.put(`/api/novels/${n.id}/cover`, { image: await resizeCover(f) }); toast('Sampul diperbarui'); await refresh(); } catch (ex) { toast(ex.message, 'error'); }
    });
    $('#cv-del')?.addEventListener('click', async () => { try { await api.del(`/api/novels/${n.id}/cover`); await refresh(); } catch (ex) { toast(ex.message, 'error'); } });
    $('#imp').addEventListener('click', () => importFlow(n, refresh));
    $('#addm').addEventListener('click', () => chapterEditor(n, null, refresh));
    $('#clr')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Hapus semua bab?', message: 'Semua bab novel ini dihapus. Berguna bila ingin mengimpor ulang naskah yang sudah diperbaiki.', confirmLabel: 'Hapus semua', danger: true }))) return;
      try { await api.del(`/api/novels/${n.id}/chapters`); await refresh(); } catch (ex) { toast(ex.message, 'error'); }
    });
    container.querySelectorAll('[data-pub]').forEach((b) => b.addEventListener('click', async () => {
      const c = chapters.find((x) => x.id === b.dataset.pub);
      try { await api.patch(`/api/novels/${n.id}/chapters/${c.id}`, { published: !c.published }); await refresh(); } catch (ex) { toast(ex.message, 'error'); }
    }));
    container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => chapterEditor(n, chapters.find((x) => x.id === b.dataset.edit), refresh)));
    container.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      const c = chapters.find((x) => x.id === b.dataset.rm);
      if (!(await confirmDialog({ title: 'Hapus bab ini?', message: `"${c.title}" akan dihapus permanen.`, confirmLabel: 'Hapus', danger: true }))) return;
      try { await api.del(`/api/novels/${n.id}/chapters/${c.id}`); await refresh(); } catch (ex) { toast(ex.message, 'error'); }
    }));
  };
  draw();
}

async function chapterEditor(n, c, done) {
  let text = '';
  if (c) { try { text = (await api.get(`/api/novels/${n.id}/chapters/${c.id}`)).chapter.text; } catch (e) { toast(e.message, 'error'); return; } }
  openModal({ title: c ? 'Ubah bab' : 'Bab baru', wide: true, html: `<div class="field"><label for="c-t">Judul bab</label><input class="input" id="c-t" maxlength="120" value="${esc(c?.title || '')}" /></div>
    <div class="field"><label for="c-x">Isi bab</label><textarea class="textarea" id="c-x" style="min-height:42vh;font-family:var(--serif)">${esc(text)}</textarea><span class="hint">Pisahkan paragraf dengan satu baris kosong. Tulis *** di barisnya sendiri untuk pemisah adegan.</span></div>`,
    footer: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', close: false, onClick: async (m) => {
      const body = { title: m.body.querySelector('#c-t').value, text: m.body.querySelector('#c-x').value };
      if (c) await api.patch(`/api/novels/${n.id}/chapters/${c.id}`, body); else await api.post(`/api/novels/${n.id}/chapters`, { chapters: [body], published: true });
      m.close(); toast('Bab disimpan'); done();
    } }] });
}

// ---------- impor naskah ----------
function importFlow(n, done) {
  const m = openModal({ title: 'Impor naskah', wide: true, html: `<p class="muted">Pilih file naskah. Bab dikenali dari judul seperti "Bab 1" atau "Chapter 2". Kamu bisa memeriksa dan merapikan hasilnya sebelum disimpan. File aslinya tidak diunggah, hanya teks bab.</p>
    <input type="file" id="f" accept=".docx,.pdf,.txt,.md" hidden /><div class="dropzone" id="dz">${icon('file', 30)}<b>Ketuk untuk memilih file</b><span class="small">.docx (disarankan), .pdf, atau .txt, maksimal 25 MB</span></div><div id="st"></div>` });
  const $ = (s) => m.body.querySelector(s);
  const pick = () => $('#f').click();
  $('#dz').addEventListener('click', pick);
  $('#dz').addEventListener('dragover', (e) => { e.preventDefault(); $('#dz').classList.add('over'); });
  $('#dz').addEventListener('dragleave', () => $('#dz').classList.remove('over'));
  $('#dz').addEventListener('drop', (e) => { e.preventDefault(); $('#dz').classList.remove('over'); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
  $('#f').addEventListener('change', (e) => e.target.files[0] && handle(e.target.files[0]));

  async function handle(file) {
    $('#dz').style.display = 'none';
    $('#st').innerHTML = loading(`Membaca ${esc(file.name)}`);
    let paras, res;
    try { paras = await readManuscript(file, loadScript); res = splitChapters(paras); } catch (e) { $('#st').innerHTML = `<div class="form-error" role="alert">${icon('alert', 18)}<span>${esc(e.message)}</span></div><button class="btn" id="again">Pilih file lain</button>`; $('#again').addEventListener('click', () => { $('#dz').style.display = ''; $('#st').innerHTML = ''; }); return; }
    if (!res.chapters.length) { $('#st').innerHTML = `<div class="form-error" role="alert">${icon('alert', 18)}<span>Tidak ada teks yang bisa dibaca di file ini. PDF hasil scan (gambar) belum bisa dibaca.</span></div>`; return; }
    preview(res, paras);
  }

  function preview(res, paras) {
    let chapters = res.chapters.map((c) => ({ ...c, on: !c.skip }));
    const draw = () => {
      const on = chapters.filter((c) => c.on);
      $('#st').innerHTML = `${res.notes.map((t) => `<div class="note">${esc(t)}</div>`).join('')}
        <div class="stack"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b>${on.length} bab akan ditambahkan · ${num(on.reduce((s, c) => s + c.words, 0))} kata</b>
          <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" id="one">Jadikan satu bab</button><button class="btn btn-sm" id="byw">Pecah per 2.500 kata</button></span></div>
        <div class="prev-list">${chapters.map((c, i) => `<div class="prev-row"><input type="checkbox" data-on="${i}" ${c.on ? 'checked' : ''} aria-label="Sertakan bab ${i + 1}" style="width:20px;height:20px;accent-color:var(--accent)" /><input class="input" data-t="${i}" value="${esc(c.title)}" maxlength="120" aria-label="Judul bab ${i + 1}" /><span class="small">${num(c.words)} kata</span></div>`).join('')}</div>
        <label class="check"><input type="checkbox" id="pub" checked /> Langsung terbitkan bab ini ke pembaca</label>
        <div id="pg" style="display:none"><div class="progress"><i id="pgi"></i></div><p class="small" id="pgt"></p></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="cancel">Batal</button><button class="btn btn-primary" id="go" ${on.length ? '' : 'disabled'}>Tambahkan ${on.length} bab</button></div></div>`;
      $('#st').querySelectorAll('[data-on]').forEach((el) => el.addEventListener('change', () => { chapters[el.dataset.on].on = el.checked; draw(); }));
      $('#st').querySelectorAll('[data-t]').forEach((el) => el.addEventListener('input', () => { chapters[el.dataset.t].title = el.value; }));
      $('#one').addEventListener('click', () => { const text = chapters.filter((c) => c.on).map((c) => c.text).join('\n\n'); chapters = [{ title: 'Bab 1', text, words: (text.match(/\S+/g) || []).length, on: true }]; draw(); });
      $('#byw').addEventListener('click', () => { chapters = splitByWords(chapters.filter((c) => c.on).map((c) => c.text).join('\n\n'), 2500).map((c) => ({ ...c, on: true })); draw(); });
      $('#cancel').addEventListener('click', () => m.close());
      $('#go').addEventListener('click', upload);
    };
    async function upload() {
      const pub = $('#pub').checked;
      const list = chapters.filter((c) => c.on).flatMap((c) => splitLong({ ...c, title: c.title.trim() || 'Tanpa judul' }));
      $('#go').disabled = true; $('#cancel').disabled = true; $('#pg').style.display = '';
      const batches = []; let cur = []; let size = 0;
      for (const c of list) { if (cur.length >= 30 || (size + c.text.length > 600000 && cur.length)) { batches.push(cur); cur = []; size = 0; } cur.push(c); size += c.text.length; }
      if (cur.length) batches.push(cur);
      let sent = 0;
      try {
        for (const b of batches) {
          await api.post(`/api/novels/${n.id}/chapters`, { chapters: b.map((c) => ({ title: c.title, text: c.text })), published: pub });
          sent += b.length; $('#pgi').style.width = (sent / list.length) * 100 + '%'; $('#pgt').textContent = `${sent} dari ${list.length} bab terkirim`;
        }
        m.close(); toast(`${list.length} bab ditambahkan`); done();
      } catch (e) {
        $('#pgt').textContent = ''; m.error(`${e.message} ${sent ? `(${sent} bab sudah tersimpan; cek daftar bab sebelum mencoba lagi agar tidak ganda)` : ''}`);
        if (sent) done();
        $('#cancel').disabled = false;
      }
    }
    draw();
  }
}

export async function readersView({ container, isStale }) {
  container.innerHTML = loading();
  let r;
  try { r = await api.get('/api/users'); } catch (e) { container.innerHTML = errorState(e.message); return; }
  if (isStale()) return;
  const readers = r.users;
  container.innerHTML = `<a class="btn btn-quiet btn-sm" href="#/kelola" style="margin-left:-12px">${icon('chevL', 18)} Kelola</a><div class="page-head" style="margin-top:6px"><h1>Pembaca (${readers.filter((u) => u.role !== 'admin').length})</h1></div>
    <div class="panel">${readers.map((u) => `<div class="row"><div class="grow"><b>${esc(u.fullName)}</b><div class="small">@${esc(u.username)} · bergabung ${esc(u.joinedAt)} ${u.role === 'admin' ? '· Admin' : ''}${u.active ? '' : ' · Nonaktif'}</div></div>
      ${u.role === 'admin' ? '' : `<button class="btn btn-sm" data-pw="${esc(u.uid)}">Reset password</button><button class="btn btn-sm ${u.active ? '' : 'btn-primary'}" data-act="${esc(u.uid)}">${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>`}</div>`).join('')}</div>`;
  const again = () => readersView({ container, isStale });
  container.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const u = readers.find((x) => x.uid === b.dataset.act);
    if (u.active && !(await confirmDialog({ title: 'Nonaktifkan akun?', message: `${u.fullName} tidak akan bisa masuk sampai diaktifkan lagi.`, confirmLabel: 'Nonaktifkan', danger: true }))) return;
    try { await api.post(`/api/users/${u.uid}/active`, { active: !u.active }); again(); } catch (e) { toast(e.message, 'error'); }
  }));
  container.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
    const u = readers.find((x) => x.uid === b.dataset.pw);
    openModal({ title: `Reset password ${u.fullName}`, html: '<div class="field"><label for="np">Password baru</label><input class="input" id="np" type="text" autocomplete="off" /><span class="hint">Minimal 8 karakter, ada huruf dan angka. Sampaikan ke yang bersangkutan.</span></div>', footer: [{ label: 'Batal' }, { label: 'Reset', kind: 'primary', close: false, onClick: async (m) => { await api.post(`/api/users/${u.uid}/password`, { newPassword: m.body.querySelector('#np').value }); m.close(); toast('Password direset'); } }] });
  }));
}
