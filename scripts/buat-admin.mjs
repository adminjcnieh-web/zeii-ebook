#!/usr/bin/env node
// Membuat akun ADMIN (penulis) pertama. Admin tidak bisa dibuat dari website, hanya lewat skrip ini.
// Dipakai lewat GitHub Actions ("Buat Admin") atau di komputer:
//   FIREBASE_SERVICE_ACCOUNT_FILE=./service-account.json ADMIN_USERNAME=zeii ADMIN_NAME="Zeii" ADMIN_PASSWORD='...' node scripts/buat-admin.mjs
// Bila username itu sudah ada sebagai admin, password-nya di-reset. Pembaca biasa tidak pernah dijadikan admin diam-diam.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Firestore, op } from '../backend/src/lib/firestore.js';
import { createAuthUser, updateAuthUser, lookupAuthUid } from '../backend/src/lib/google.js';
import * as v from '../backend/src/lib/validate.js';

export function envFromServiceAccount(json, extra = {}) {
  const sa = typeof json === 'string' ? JSON.parse(json) : json;
  return { FIREBASE_PROJECT_ID: sa.project_id, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa), EMAIL_DOMAIN: process.env.EMAIL_DOMAIN || 'zeii-ebook.local', ...extra };
}

export async function buatAdmin(env, { username, fullName, password }) {
  const uname = v.username(username);
  const name = v.str(fullName, { name: 'Nama', min: 2, max: 40 });
  v.password(password);
  const db = new Firestore(env);
  const owner = await db.get(`usernames/${uname}`);
  if (owner) {
    const u = await db.get(`users/${owner.uid}`);
    if (!u || u.role !== 'admin') throw new Error(`Username "${uname}" sudah dipakai pembaca biasa. Pilih username lain untuk admin.`);
    await updateAuthUser(env, owner.uid, { password, disableUser: false });
    await db.commit([op.update(`users/${owner.uid}`, { active: true, fullName: name })]);
    return { uid: owner.uid, username: uname, reset: true };
  }
  const now = new Date();
  const uid = await createAuthUser(env, { username: uname, password, displayName: name });
  await db.commit([
    op.create(`usernames/${uname}`, { uid, createdAt: now }),
    op.create(`users/${uid}`, { fullName: name, username: uname, usernameLower: uname, role: 'admin', active: true, joinedAt: now.toISOString().slice(0, 10), createdAt: now }),
  ]);
  return { uid, username: uname, reset: false };
}

async function main() {
  const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT || (keyFile && fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '');
  if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT belum diisi.'); process.exit(1); }
  try {
    const r = await buatAdmin(envFromServiceAccount(sa), { username: process.env.ADMIN_USERNAME, fullName: process.env.ADMIN_NAME || 'Admin', password: process.env.ADMIN_PASSWORD });
    console.log(r.reset ? `Password admin "${r.username}" di-reset.` : `Admin "${r.username}" dibuat.`);
  } catch (e) { console.error('Gagal: ' + (e.message || e)); process.exit(1); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
