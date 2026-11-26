// Membaca file naskah (.docx, .txt, .pdf) di browser lalu memecahnya jadi bab. Tidak ada file yang diunggah ke server:
// hanya teks bab hasil pecahan yang dikirim setelah admin memeriksa pratinjau.
// Bagian murni (tanpa DOM) bisa diuji di Node: parseDocxXml, readZipEntry, splitChapters, splitLong.

export const MAX_CHARS = 120000;

// ---------- ZIP minimal (cukup untuk membuka .docx) ----------
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntry(buf, wanted) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('File ini bukan dokumen Word (.docx) yang utuh.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lnLen = dv.getUint16(local + 26, true), leLen = dv.getUint16(local + 28, true);
      const data = buf.subarray(local + 30 + lnLen + leLen, local + 30 + lnLen + leLen + csize);
      return method === 0 ? data : inflateRaw(data);
    }
    p += 46 + nameLen + extraLen + commLen;
  }
  return null;
}

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

/** document.xml -> [{ text, heading }] per paragraf. */
export function parseDocxXml(xml) {
  const out = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const style = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || '';
    let text = '';
    for (const t of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += t[0].startsWith('<w:tab') ? ' ' : t[0].startsWith('<w:br') ? '\n' : unxml(t[1]);
    out.push({ text: text.replace(/[ \t]+/g, ' ').trim(), heading: /^(heading|judul|title)/i.test(style) && !/^title$/i.test(style) });
  }
  return out;
}

export async function readDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Isi dokumen Word tidak ditemukan. Pastikan file berformat .docx (bukan .doc lama).');
  return parseDocxXml(new TextDecoder().decode(xml));
}

export async function readTxt(file) {
  return (await file.text()).replace(/\r\n?/g, '\n').split('\n').map((t) => ({ text: t.trim(), heading: false }));
}

// ---------- PDF (pustaka dimuat dari CDN saat dibutuhkan) ----------
export async function readPdf(file, loadScript) {
  await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paras = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str.trim() && !it.hasEOL) continue;
      const y = Math.round(it.transform[5]);
      const row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (row) row.text += it.str; else rows.push({ y, text: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    let prevY = null, cur = '';
    const gaps = rows.slice(1).map((r, k) => rows[k].y - r.y).sort((a, b) => a - b);
    const normal = gaps[Math.floor(gaps.length / 2)] || 14;
    for (const r of rows) {
      if (prevY !== null && prevY - r.y > normal * 1.6) { if (cur.trim()) paras.push({ text: cur.trim(), heading: false }); cur = ''; }
      cur += (cur && !cur.endsWith('-') ? ' ' : '') + r.text.trim();
      prevY = r.y;
    }
    if (cur.trim()) paras.push({ text: cur.trim(), heading: false });
  }
  return paras;
}

// ---------- Memecah jadi bab ----------
const HEADER_RE = /^(bab|chapter|chap\.?|part|bagian|episode|ep\.?|prolog|epilog|extra|special)\b[\s\S]{0,70}$/i;
const NUM_ONLY_RE = /^(bab|chapter|chap\.?|part|bagian|episode|ep\.?)\s*[\divxlc]+\s*[.:)-]?\s*$/i;
const BREAK_RE = /^(\*\s*){3,}$|^[-–—_=]{3,}$|^[#~•]{3,}$/;

function isHeader(p) {
  if (p.heading && p.text.length <= 120) return true;
  if (p.text.length > 80 || /[.!?]["”']?$/.test(p.text) && !/^(bab|chapter)\s*[\divxlc]+[.:]/i.test(p.text)) return false;
  return HEADER_RE.test(p.text);
}

/**
 * paragraphs: [{text, heading}] -> { chapters:[{title,text,words}], mode:'headers'|'none', notes:[...] }
 * Bila tidak ada penanda bab, seluruh teks jadi satu bab (admin bisa memilih pecah per jumlah kata).
 */
export function splitChapters(paragraphs) {
  const paras = paragraphs.map((p) => ({ ...p, text: p.text.replace(/\s+/g, (s) => (s.includes('\n') ? '\n' : ' ')).trim() })).filter((p) => p.text);
  const chapters = [];
  let cur = null; let preface = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (isHeader(p)) {
      let title = p.text.replace(/\n/g, ' ');
      const next = paras[i + 1];
      const after = paras[i + 2];
      if (NUM_ONLY_RE.test(title) && next && !isHeader(next) && next.text.length <= 70 && !/[.!?]$/.test(next.text) && after && !isHeader(after)) { title = `${title.replace(/[.:)-]\s*$/, '')}: ${next.text}`; i++; }
      cur = { title: title.slice(0, 120), lines: [] };
      chapters.push(cur);
    } else if (cur) cur.lines.push(p.text);
    else preface.push(p.text);
  }
  const fin = (c) => { const text = c.lines.map((l) => (BREAK_RE.test(l) ? '* * *' : l)).join('\n\n'); return { title: c.title, text, words: (text.match(/\S+/g) || []).length }; };
  if (!chapters.length) {
    const text = preface.join('\n\n');
    return { mode: 'none', chapters: text ? [{ title: 'Bab 1', text, words: (text.match(/\S+/g) || []).length }] : [], notes: ['Penanda bab (mis. "Bab 1" atau "Chapter 1") tidak ditemukan, jadi semuanya dijadikan satu bab.'] };
  }
  const out = chapters.map(fin).filter((c) => c.words > 0);
  const notes = [];
  if (preface.length) {
    const text = preface.join('\n\n'); const words = (text.match(/\S+/g) || []).length;
    if (words >= 1) { out.unshift({ title: 'Pembuka', text, words, skip: words < 80 }); notes.push('Ada teks sebelum bab pertama (misalnya halaman judul). Ditaruh sebagai "Pembuka"; hilangkan centangnya bila tidak perlu.'); }
  }
  const empty = chapters.length - chapters.map(fin).filter((c) => c.words > 0).length;
  if (empty) notes.push(`${empty} judul bab tanpa isi dilewati.`);
  return { mode: 'headers', chapters: out, notes };
}

/** Memecah satu teks panjang jadi beberapa bab ~perKata kata, di batas paragraf. */
export function splitByWords(text, perWords = 2500, baseTitle = 'Bab') {
  const paras = text.split(/\n\n+/); const out = []; let cur = []; let w = 0;
  for (const p of paras) {
    const n = (p.match(/\S+/g) || []).length;
    if (w >= perWords && cur.length) { out.push(cur); cur = []; w = 0; }
    cur.push(p); w += n;
  }
  if (cur.length) out.push(cur);
  return out.map((c, i) => { const t = c.join('\n\n'); return { title: `${baseTitle} ${i + 1}`, text: t, words: (t.match(/\S+/g) || []).length }; });
}

/** Bab yang melebihi batas server dipecah otomatis di batas paragraf. */
export function splitLong(chapter, max = MAX_CHARS - 2000) {
  if (chapter.text.length <= max) return [chapter];
  const parts = []; let cur = '';
  for (const p of chapter.text.split(/\n\n+/)) {
    if (cur && cur.length + p.length + 2 > max) { parts.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p.slice(0, max);
  }
  if (cur) parts.push(cur);
  return parts.map((t, i) => ({ ...chapter, title: i ? `${chapter.title} (${i + 1})` : chapter.title, text: t, words: (t.match(/\S+/g) || []).length }));
}

export async function readManuscript(file, loadScript) {
  const name = file.name.toLowerCase();
  if (file.size > 25 * 1024 * 1024) throw new Error('File terlalu besar (maksimal 25 MB).');
  if (name.endsWith('.docx')) return readDocx(file);
  if (name.endsWith('.txt') || name.endsWith('.md')) return readTxt(file);
  if (name.endsWith('.pdf')) return readPdf(file, loadScript);
  if (name.endsWith('.doc')) throw new Error('Format .doc lama belum didukung. Buka di Word lalu "Simpan sebagai" .docx.');
  throw new Error('Format file belum didukung. Pakai .docx, .pdf, atau .txt.');
}
