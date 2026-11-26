import * as api from './api.js';
import { esc } from './utils.js';
import { icon } from './icons.js';

/** Layar masuk / daftar. onDone(user) dipanggil setelah berhasil. */
export function renderAuth(root, { notice = '', onDone, mode = 'masuk' }) {
  const isReg = mode === 'daftar';
  root.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="brand"><span class="brand-mark"></span>Zeii Ebook</div>
    <h1>${isReg ? 'Buat akun' : 'Selamat datang'}</h1>
    <p class="sub">${isReg ? 'Daftar gratis untuk menyimpan rak buku dan progres bacamu.' : 'Masuk untuk membaca dan melanjutkan bacaanmu.'}</p>
    ${notice ? `<div class="form-error" role="alert">${icon('alert', 18)}<span>${esc(notice)}</span></div>` : ''}
    <form id="af" novalidate>
      <div id="af-err"></div>
      ${isReg ? `<div class="field"><label for="a-name">Nama</label><input class="input" id="a-name" maxlength="40" autocomplete="name" required /></div>` : ''}
      <div class="field"><label for="a-user">Username</label><input class="input" id="a-user" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" required />${isReg ? '<span class="hint">Huruf kecil, angka, titik atau garis bawah. Diawali huruf, 3-20 karakter.</span>' : ''}</div>
      <div class="field"><label for="a-pw">Password</label><div class="pw"><input class="input" id="a-pw" type="password" maxlength="100" autocomplete="${isReg ? 'new-password' : 'current-password'}" required /><button type="button" class="btn btn-quiet btn-icon" id="a-eye" aria-label="Tampilkan password">${icon('eye')}</button></div>${isReg ? '<span class="hint">Minimal 8 karakter, ada huruf dan angka.</span>' : ''}</div>
      <button class="btn btn-primary btn-block" id="a-go" type="submit">${isReg ? 'Daftar' : 'Masuk'}</button>
    </form>
    <div class="switch">${isReg ? 'Sudah punya akun?' : 'Belum punya akun?'} <button type="button" id="a-sw">${isReg ? 'Masuk' : 'Daftar'}</button></div>
  </div></div>`;
  const $ = (s) => root.querySelector(s);
  $('#a-eye').addEventListener('click', () => { const p = $('#a-pw'); p.type = p.type === 'password' ? 'text' : 'password'; });
  $('#a-sw').addEventListener('click', () => renderAuth(root, { onDone, mode: isReg ? 'masuk' : 'daftar' }));
  $('#af').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#a-go'); const err = $('#af-err');
    err.innerHTML = '';
    const username = $('#a-user').value.trim(); const password = $('#a-pw').value;
    if (!username || !password || (isReg && !$('#a-name').value.trim())) { err.innerHTML = `<div class="form-error" role="alert">${icon('alert', 18)}<span>Lengkapi semua kolom.</span></div>`; return; }
    btn.disabled = true; const old = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Tunggu sebentar';
    try {
      const user = isReg ? await api.register(username, $('#a-name').value.trim(), password) : await api.login(username, password);
      onDone(user);
    } catch (ex) {
      err.innerHTML = `<div class="form-error" role="alert">${icon('alert', 18)}<span>${esc(ex.message)}</span></div>`;
      btn.disabled = false; btn.textContent = old;
    }
  });
  $('#a-user').focus();
}
