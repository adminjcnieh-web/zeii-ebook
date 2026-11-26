// Validasi input. Semua data dari browser dianggap tidak tepercaya.
import { HttpError } from './http.js';

const bad = (msg) => new HttpError(400, msg, 'validation');

export const ROLES = ['admin', 'reader'];

const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_MULTILINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function str(value, { name, min = 0, max = 200, multiline = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (min > 0) throw bad(`${name} wajib diisi`);
    return '';
  }
  if (typeof value !== 'string') throw bad(`${name} harus berupa teks`);
  const s = value.trim();
  if ((multiline ? CONTROL_MULTILINE : CONTROL).test(s)) throw bad(`${name} mengandung karakter yang tidak diizinkan`);
  if (s.length < min) throw bad(name + ' minimal ' + min + ' karakter');
  if (s.length > max) throw bad(name + ' maksimal ' + max + ' karakter');
  return s;
}

export function username(value) {
  const s = str(value, { name: 'Username', min: 3, max: 20 }).toLowerCase();
  if (!/^[a-z][a-z0-9._]{2,19}$/.test(s)) {
    throw bad('Username hanya boleh huruf kecil, angka, titik, atau garis bawah, dan harus diawali huruf');
  }
  return s;
}

export function password(value, name = 'Password') {
  if (typeof value !== 'string') throw bad(`${name} wajib diisi`);
  if (value.length < 8) throw bad(`${name} minimal 8 karakter`);
  if (value.length > 100) throw bad(`${name} maksimal 100 karakter`);
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) throw bad(`${name} harus mengandung huruf dan angka`);
  return value;
}

export function oneOf(value, list, name) {
  if (!list.includes(value)) throw bad(`${name} tidak valid`);
  return value;
}

export function bool(value, name) {
  if (typeof value !== 'boolean') throw bad(`${name} harus bernilai true atau false`);
  return value;
}

export function intRange(value, { name, min, max }) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} harus berupa angka bulat ${min}-${max}`);
  return n;
}

export function dateStr(value, name = 'Tanggal') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad(`${name} harus berformat YYYY-MM-DD`);
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw bad(`${name} tidak valid`);
  return value;
}

export function timeStr(value, name = 'Jam') {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw bad(`${name} harus berformat HH:MM`);
  return value;
}

export function isoDateTime(value, name = 'Waktu') {
  if (typeof value !== 'string') throw bad(`${name} wajib diisi`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad(`${name} tidak valid`);
  return d;
}

export function permissions(value) {
  const base = { editAttendance: false, announce: false, exportReports: false };
  if (value === undefined || value === null) return base;
  if (typeof value !== 'object' || Array.isArray(value)) throw bad('Izin tidak valid');
  for (const key of Object.keys(base)) {
    if (value[key] !== undefined) base[key] = bool(value[key], `Izin ${key}`);
  }
  return base;
}
