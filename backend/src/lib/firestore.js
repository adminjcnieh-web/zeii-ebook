// Klien Cloud Firestore memakai REST API + service account.
// Tanpa dependensi sehingga berjalan di Cloudflare Workers.
import { getAccessToken } from './google.js';

export class FirestoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code; // contoh: ALREADY_EXISTS, NOT_FOUND, FAILED_PRECONDITION, ABORTED
  }
}

// ---------- Encode / decode tipe data Firestore ----------

export function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  switch (typeof value) {
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case 'string':
      return { stringValue: value };
    case 'object':
      if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
      return { mapValue: { fields: encodeFields(value) } };
    default:
      throw new Error('Tipe data tidak didukung Firestore');
  }
}

export function encodeFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) fields[k] = encode(v);
  return fields;
}

export function decode(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

export function fromDoc(doc) {
  const id = doc.name.split('/').pop();
  return { id, ...decodeFields(doc.fields || {}), _updateTime: doc.updateTime };
}

const fieldPath = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`');

// ---------- Pembuat operasi tulis (dipakai bersama commit) ----------

export const op = {
  /** Buat dokumen baru; gagal (ALREADY_EXISTS) jika sudah ada. */
  create: (path, data) => ({ kind: 'create', path, data }),
  /** Ganti seluruh dokumen (buat jika belum ada). */
  set: (path, data) => ({ kind: 'set', path, data }),
  /** Ubah sebagian field; gagal jika dokumen tidak ada. Opsional updateTime sebagai penjaga konflik. */
  update: (path, data, updateTime) => ({ kind: 'update', path, data, updateTime }),
  delete: (path) => ({ kind: 'delete', path }),
};

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const OPS = { '==': 'EQUAL', '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL' };

export class Firestore {
  constructor(env) {
    this.env = env;
    this.projectId = env.FIREBASE_PROJECT_ID;
    this.dbPath = `projects/${this.projectId}/databases/(default)`;
    this.root = `https://firestore.googleapis.com/v1/${this.dbPath}/documents`;
  }

  async #request(method, url, body, attempt = 0) {
    const token = await getAccessToken(this.env);
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      return this.#request(method, url, body, attempt + 1);
    }
    let info = {};
    try {
      info = (await res.json()).error || {};
    } catch {
      /* abaikan */
    }
    throw new FirestoreError(res.status, info.status || 'UNKNOWN', info.message || `Firestore error ${res.status}`);
  }

  /** Ambil satu dokumen; null jika tidak ada. */
  async get(path) {
    try {
      return fromDoc(await this.#request('GET', `${this.root}/${path}`));
    } catch (e) {
      if (e instanceof FirestoreError && e.status === 404) return null;
      throw e;
    }
  }

  /** Ambil semua dokumen sebuah koleksi (dengan paginasi otomatis). */
  async list(collection) {
    const out = [];
    let pageToken = '';
    do {
      const url = `${this.root}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await this.#request('GET', url);
      for (const d of res.documents || []) out.push(fromDoc(d));
      pageToken = res.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  /**
   * Query sederhana pada satu koleksi.
   * where: [[field, '==' | '>=' | '<=', value], ...]
   * Catatan: sengaja tanpa kombinasi yang butuh composite index.
   */
  async query(collection, { where = [], orderBy, limit } = {}) {
    const structuredQuery = { from: [{ collectionId: collection }] };
    const filters = where.map(([field, opName, value]) => ({
      fieldFilter: { field: { fieldPath: field }, op: OPS[opName], value: encode(value) },
    }));
    if (filters.length === 1) structuredQuery.where = filters[0];
    else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
    if (orderBy) structuredQuery.orderBy = [{ field: { fieldPath: orderBy[0] }, direction: orderBy[1] === 'DESC' ? 'DESCENDING' : 'ASCENDING' }];
    if (limit) structuredQuery.limit = limit;
    const res = await this.#request('POST', `${this.root}:runQuery`, { structuredQuery });
    return res.filter((r) => r.document).map((r) => fromDoc(r.document));
  }

  #toWrite(w) {
    const name = `${this.dbPath}/documents/${w.path}`;
    if (w.kind === 'delete') return { delete: name };
    const write = { update: { name, fields: encodeFields(w.data) } };
    if (w.kind === 'create') write.currentDocument = { exists: false };
    if (w.kind === 'update') {
      write.updateMask = { fieldPaths: Object.keys(w.data).filter((k) => w.data[k] !== undefined).map(fieldPath) };
      write.currentDocument = w.updateTime ? { updateTime: w.updateTime } : { exists: true };
    }
    return write;
  }

  /** Terapkan beberapa operasi tulis secara atomik (semua berhasil atau semua gagal). */
  async commit(writes) {
    if (writes.length === 0) return;
    if (writes.length > 450) throw new Error('Terlalu banyak operasi dalam satu commit');
    await this.#request('POST', `${this.root}:commit`, {
      writes: writes.map((w) => this.#toWrite(w)),
    });
  }
}
