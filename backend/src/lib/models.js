// Memilih field yang boleh dikirim ke browser.
export function userOut(u) {
  return { uid: u.id, fullName: u.fullName, username: u.username, role: u.role, active: !!u.active, joinedAt: u.joinedAt || '' };
}

export function novelOut(n) {
  return {
    id: n.id,
    title: n.title,
    author: n.author || '',
    synopsis: n.synopsis || '',
    genres: n.genres || [],
    status: n.status || 'berlanjut',
    published: !!n.published,
    chapterCount: n.chapterCount || 0,
    wordCount: n.wordCount || 0,
    coverVer: n.coverVer || null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    lastChapterAt: n.lastChapterAt || null,
  };
}

export function chapterOut(c) {
  return { id: c.id, novelId: c.novelId, no: c.no, title: c.title, words: c.words || 0, published: c.published !== false, createdAt: c.createdAt };
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function newId(len = 16) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const x of b) s += ALNUM[x % ALNUM.length];
  return s;
}
export const ID_RE = /^[A-Za-z0-9]{8,40}$/;
