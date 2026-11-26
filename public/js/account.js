import * as api from './api.js';
import { esc } from './utils.js';
import { toast, confirmDialog } from './ui.js';
import { icon } from './icons.js';
import { safeSet } from './utils.js';

export async function accountView({ container, user, onLogout, onUser }) {
  const theme = document.documentElement.dataset.theme || 'auto';
  container.innerHTML = `<div class="page-head"><h1>Akun</h1></div>
    <div class="panel"><h2>Profil</h2><form id="pf"><div class="field"><label for="p-name">Nama</label><input class="input" id="p-name" maxlength="40" value="${esc(user.fullName)}" required /></div>
      <div class="field"><label>Username</label><div class="muted">${esc(user.username)} · ${user.role === 'admin' ? 'Admin (penulis)' : 'Pembaca'}</div></div><button class="btn btn-primary" type="submit">Simpan nama</button></form></div>
    <div class="panel"><h2>Tampilan aplikasi</h2><div class="seg" id="th">${[['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
      <p class="hint" style="margin-top:8px">Tema untuk membaca diatur terpisah di tombol Aa saat membaca.</p></div>
    <div class="panel"><h2>Ganti password</h2><form id="pw"><div id="pw-err"></div>
      <div class="field"><label for="w-old">Password sekarang</label><input class="input" id="w-old" type="password" autocomplete="current-password" required /></div>
      <div class="field"><label for="w-new">Password baru</label><input class="input" id="w-new" type="password" autocomplete="new-password" required /><span class="hint">Minimal 8 karakter, ada huruf dan angka.</span></div>
      <button class="btn" type="submit">Ganti password</button></form></div>
    <button class="btn btn-block" id="out">${icon('logout')} Keluar</button>`;
  const $ = (s) => container.querySelector(s);
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api.patch('/api/me', { fullName: $('#p-name').value }); api.updateUser(r.user); onUser(r.user); toast('Nama disimpan'); } catch (ex) { toast(ex.message, 'error'); }
  });
  $('#th').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('#th').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (b.dataset.v === 'auto') { delete document.documentElement.dataset.theme; try { localStorage.removeItem('zeii.theme'); } catch { /* abaikan */ } }
    else { document.documentElement.dataset.theme = b.dataset.v; safeSet('zeii.theme', b.dataset.v); }
  });
  $('#pw').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#pw-err').innerHTML = '';
    try {
      await api.post('/api/me/password', { currentPassword: $('#w-old').value, newPassword: $('#w-new').value });
      toast('Password diganti. Silakan masuk lagi.'); onLogout('Password sudah diganti. Silakan masuk dengan password baru.');
    } catch (ex) { $('#pw-err').innerHTML = `<div class="form-error" role="alert">${icon('alert', 18)}<span>${esc(ex.message)}</span></div>`; }
  });
  $('#out').addEventListener('click', async () => { if (await confirmDialog({ title: 'Keluar?', message: 'Kamu bisa masuk lagi kapan saja. Progres bacamu tetap tersimpan.', confirmLabel: 'Keluar' })) onLogout(); });
}
