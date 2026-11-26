// Firebase TIRUAN untuk pengujian otomatis (tanpa internet).
// Meniru: OAuth token, JWKS, Identity Toolkit (login/buat akun), Firestore REST (get/list/runQuery/commit).
// Semantik penting yang ditiru: precondition exists:false/true, updateTime, atomisitas commit.
import { decodeFields, encodeFields, decode } from '../src/lib/firestore.js';
import { JWKS_URL, resetGoogleCaches } from '../src/lib/google.js';

const subtle = crypto.subtle;
const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

async function genKey() {
  return subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
}

export async function createFake() {
  const PROJECT = 'test-proj';
  const idKeys = await genKey();
  const saKeys = await genKey();
  const idJwk = { ...(await subtle.exportKey('jwk', idKeys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const pkcs8 = Buffer.from(await subtle.exportKey('pkcs8', saKeys.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

  const env = {
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_API_KEY: 'test-key',
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@test.iam.gserviceaccount.com', private_key: pem, private_key_id: 'sa1' }),
    QR_SECRET: 'q'.repeat(40),
    EMAIL_DOMAIN: 'zeii-ebook.local',
    TZ_OFFSET_MINUTES: '420',
  };

  const state = {
    docs: new Map(), // path -> { fields, updateTime }
    authUsers: new Map(), // uid -> { email, password, disabled, displayName }
    refresh: new Map(), // refreshToken -> uid
    counter: 0,
    stats: { reads: 0, writes: 0, rejectedAdminCalls: 0 },
    failNextCommitWith: null,
  };

  const j = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fsError = (httpStatus, status, message) => j(httpStatus, { error: { code: httpStatus, status, message } });
  const nextTime = () => new Date(Date.UTC(2020, 0, 1) + ++state.counter * 1000).toISOString();

  async function signIdToken(uid) {
    const iat = Math.floor(Date.now() / 1000);
    const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })));
    const payload = b64url(enc.encode(JSON.stringify({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, iat, exp: iat + 3600, auth_time: iat })));
    const sig = await subtle.sign('RSASSA-PKCS1-v1_5', idKeys.privateKey, enc.encode(`${header}.${payload}`));
    return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
  }

  async function sessionFor(uid) {
    const refreshToken = `rt_${uid}_${state.counter++}_xxxxxxxxxxxx`;
    state.refresh.set(refreshToken, uid);
    return { idToken: await signIdToken(uid), refreshToken, expiresIn: '3600' };
  }

  // ----- Firestore helpers -----
  const docOut = (path) => {
    const d = state.docs.get(path);
    return { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, fields: d.fields, createTime: d.updateTime, updateTime: d.updateTime };
  };
  const cmp = (a, b) => (a instanceof Date ? a.getTime() - b.getTime() : a < b ? -1 : a > b ? 1 : 0);

  function matches(fields, filter) {
    if (!filter) return true;
    if (filter.compositeFilter) return filter.compositeFilter.filters.every((f) => matches(fields, f));
    const f = filter.fieldFilter;
    const fv = fields[f.field.fieldPath];
    if (!fv) return false;
    const a = decode(fv);
    const b = decode(f.value);
    const c = cmp(a, b);
    if (f.op === 'EQUAL') return c === 0;
    if (f.op === 'GREATER_THAN_OR_EQUAL') return c >= 0;
    if (f.op === 'LESS_THAN_OR_EQUAL') return c <= 0;
    throw new Error('op tidak didukung fake: ' + f.op);
  }

  function firestore(method, url, body) {
    const rootPrefix = `/v1/projects/${PROJECT}/databases/(default)/documents`;
    const p = decodeURIComponent(url.pathname);
    if (!p.startsWith(rootPrefix)) return fsError(404, 'NOT_FOUND', 'bad project');
    const rest = p.slice(rootPrefix.length);

    if (rest === ':runQuery') {
      state.stats.reads++;
      const q = body.structuredQuery;
      const col = q.from[0].collectionId;
      let out = [...state.docs.keys()]
        .filter((k) => k.startsWith(col + '/') && k.split('/').length === 2)
        .filter((k) => matches(state.docs.get(k).fields, q.where));
      if (q.orderBy) {
        const { field, direction } = q.orderBy[0];
        out.sort((x, y) => {
          const a = decode(state.docs.get(x).fields[field.fieldPath] || { nullValue: null });
          const b = decode(state.docs.get(y).fields[field.fieldPath] || { nullValue: null });
          return (direction === 'DESCENDING' ? -1 : 1) * cmp(a, b);
        });
      }
      if (q.limit) out = out.slice(0, q.limit);
      return j(200, out.length ? out.map((k) => ({ document: docOut(k), readTime: nextTime() })) : [{ readTime: nextTime() }]);
    }

    if (rest === ':commit') {
      if (state.failNextCommitWith) {
        const f = state.failNextCommitWith;
        state.failNextCommitWith = null;
        return fsError(f.http, f.status, 'forced');
      }
      const writes = body.writes;
      // validasi dulu semua precondition (atomik)
      for (const w of writes) {
        const path = (w.update?.name || w.delete).split('/documents/')[1];
        const cur = state.docs.get(path);
        const pre = w.currentDocument;
        if (pre?.exists === false && cur) return fsError(409, 'ALREADY_EXISTS', `Document already exists: ${path}`);
        if (pre?.exists === true && !cur) return fsError(404, 'NOT_FOUND', `No document to update: ${path}`);
        if (pre?.updateTime && (!cur || cur.updateTime !== pre.updateTime)) return fsError(400, 'FAILED_PRECONDITION', 'updateTime mismatch');
      }
      for (const w of writes) {
        const path = (w.update?.name || w.delete).split('/documents/')[1];
        state.stats.writes++;
        if (w.delete) {
          state.docs.delete(path);
          continue;
        }
        const cur = state.docs.get(path);
        let fields;
        if (w.updateMask) {
          fields = { ...(cur?.fields || {}) };
          for (const fp of w.updateMask.fieldPaths) fields[fp] = w.update.fields[fp] ?? { nullValue: null };
        } else fields = w.update.fields;
        state.docs.set(path, { fields, updateTime: nextTime() });
      }
      return j(200, { writeResults: writes.map(() => ({})), commitTime: nextTime() });
    }

    if (method === 'GET') {
      state.stats.reads++;
      const segs = rest.replace(/^\//, '').split('/');
      if (segs.length % 2 === 1) {
        const docs = [...state.docs.keys()].filter((k) => k.startsWith(segs[0] + '/') && k.split('/').length === 2).map(docOut);
        return j(200, docs.length ? { documents: docs } : {});
      }
      const path = segs.join('/');
      if (!state.docs.has(path)) return fsError(404, 'NOT_FOUND', 'Document not found');
      return j(200, docOut(path));
    }
    return fsError(400, 'INVALID_ARGUMENT', 'unsupported');
  }

  // ----- Identity Toolkit -----
  async function identity(url, body, headers) {
    const p = url.pathname;
    if (p === '/v1/accounts:signInWithPassword') {
      if (url.searchParams.get('key') !== env.FIREBASE_API_KEY) return j(400, { error: { message: 'API_KEY_INVALID' } });
      const entry = [...state.authUsers.entries()].find(([, u]) => u.email === body.email);
      if (!entry || entry[1].password !== body.password) return j(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      if (entry[1].disabled) return j(400, { error: { message: 'USER_DISABLED' } });
      const s = await sessionFor(entry[0]);
      return j(200, { localId: entry[0], ...s });
    }
    // Admin API wajib bertoken service account
    if (headers.get('authorization') !== 'Bearer fake-access-token') {
      state.stats.rejectedAdminCalls++;
      return j(401, { error: { message: 'UNAUTHENTICATED' } });
    }
    const base = `/v1/projects/${PROJECT}/`;
    if (p === base + 'accounts') {
      if ([...state.authUsers.values()].some((u) => u.email === body.email)) return j(400, { error: { message: 'EMAIL_EXISTS' } });
      const uid = 'uid' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
      state.authUsers.set(uid, { email: body.email, password: body.password, disabled: false, displayName: body.displayName });
      return j(200, { localId: uid });
    }
    if (p === base + 'accounts:update') {
      const u = state.authUsers.get(body.localId);
      if (!u) return j(400, { error: { message: 'USER_NOT_FOUND' } });
      if (body.password !== undefined) u.password = body.password;
      if (body.disableUser !== undefined) u.disabled = body.disableUser;
      if (body.displayName !== undefined) u.displayName = body.displayName;
      return j(200, { localId: body.localId });
    }
    if (p === base + 'accounts:lookup') {
      const found = body.localId
        ? body.localId.filter((id) => state.authUsers.has(id)).map((id) => ({ localId: id }))
        : [...state.authUsers.entries()].filter(([, u]) => (body.email || []).includes(u.email)).map(([id]) => ({ localId: id }));
      return j(200, found.length ? { users: found } : {});
    }
    if (p === base + 'accounts:delete') {
      state.authUsers.delete(body.localId);
      return j(200, {});
    }
    return j(404, { error: { message: 'NOT_FOUND' } });
  }

  const realFetch = globalThis.fetch;
  async function fakeFetch(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.text();
    if (url.host === 'oauth2.googleapis.com') {
      if (text.split('assertion=')[1]?.split('.').length !== 3) return j(400, { error: 'invalid_grant' });
      return j(200, { access_token: 'fake-access-token', expires_in: 3600 });
    }
    if (request.url === JWKS_URL) return j(200, { keys: [idJwk] });
    if (url.host === 'securetoken.googleapis.com') {
      const rt = new URLSearchParams(text).get('refresh_token');
      const uid = state.refresh.get(rt);
      if (!uid) return j(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
      if (state.authUsers.get(uid)?.disabled) return j(400, { error: { message: 'USER_DISABLED' } });
      const s = await sessionFor(uid);
      return j(200, { id_token: s.idToken, refresh_token: s.refreshToken, expires_in: '3600', user_id: uid });
    }
    if (url.host === 'identitytoolkit.googleapis.com') return identity(url, text ? JSON.parse(text) : {}, request.headers);
    if (url.host === 'firestore.googleapis.com') {
      if (request.headers.get('authorization') !== 'Bearer fake-access-token') return fsError(401, 'UNAUTHENTICATED', 'no token');
      return firestore(request.method, url, text ? JSON.parse(text) : {});
    }
    throw new Error('Permintaan jaringan tak terduga di tes: ' + request.url);
  }

  return {
    env,
    state,
    install() {
      resetGoogleCaches();
      globalThis.fetch = fakeFetch;
    },
    uninstall() {
      globalThis.fetch = realFetch;
    },
    /** Isi akun langsung (Auth + Firestore), meniru hasil bootstrap/pembuatan admin. */
    seedUser({ uid, username, password = 'Passw0rd!', fullName, role = 'member', kelas = 'X-1', active = true, permissions = {}, countsAttendance }) {
      state.authUsers.set(uid, { email: `${username}@${env.EMAIL_DOMAIN}`, password, disabled: !active, displayName: fullName });
      const data = {
        fullName, username, usernameLower: username, kelas, jabatan: role === 'member' ? 'Anggota' : 'Pengurus', role, active,
        countsAttendance: countsAttendance ?? role !== 'admin',
        permissions: { editAttendance: false, announce: false, exportReports: false, ...permissions },
        joinedAt: '2026-07-01', createdAt: new Date(), updatedAt: new Date(),
      };
      state.docs.set(`users/${uid}`, { fields: encodeFields(data), updateTime: nextTime() });
      state.docs.set(`usernames/${username}`, { fields: encodeFields({ uid }), updateTime: nextTime() });
    },
    getDoc(path) {
      const d = state.docs.get(path);
      return d ? decodeFields(d.fields) : null;
    },
    putDoc(path, data) {
      state.docs.set(path, { fields: encodeFields(data), updateTime: nextTime() });
    },
    countDocs(prefix) {
      return [...state.docs.keys()].filter((k) => k.startsWith(prefix)).length;
    },
  };
}
