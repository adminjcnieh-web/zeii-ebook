import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { resetRateLimits } from '../src/lib/ratelimit.js';
import { buatAdmin } from '../../scripts/buat-admin.mjs';

let fake;
beforeEach(async () => { mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-26T03:00:00Z') }); fake = await createFake(); fake.install(); resetRateLimits(); });
afterEach(() => { fake.uninstall(); mock.timers.reset(); });
const login = async (username, password) => (await worker.fetch(new Request('https://z.test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }), fake.env));

test('buat admin: akun bisa masuk sebagai admin; diulang = reset password; tidak mengambil alih username pembaca', async () => {
  const r = await buatAdmin(fake.env, { username: 'zeii', fullName: 'Zeii', password: 'Rahasia123' });
  assert.equal(r.reset, false);
  const l = await login('zeii', 'Rahasia123'); assert.equal(l.status, 200); assert.equal((await l.json()).user.role, 'admin');
  const again = await buatAdmin(fake.env, { username: 'zeii', fullName: 'Zeii Baru', password: 'Baru12345' });
  assert.equal(again.reset, true);
  assert.equal((await login('zeii', 'Rahasia123')).status, 401);
  assert.equal((await login('zeii', 'Baru12345')).status, 200);
  fake.seedUser({ uid: 'uidRead0001', username: 'ani', fullName: 'Ani', role: 'reader' });
  await assert.rejects(() => buatAdmin(fake.env, { username: 'ani', fullName: 'Ani', password: 'Rahasia123' }), /pembaca biasa/);
  assert.equal(fake.getDoc('users/uidRead0001').role, 'reader');
  await assert.rejects(() => buatAdmin(fake.env, { username: 'x', fullName: 'A', password: 'pendek' }));
});
