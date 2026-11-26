# Membuat naskah .docx kecil (tanpa pustaka) dan gambar PNG untuk pengujian. Pemakaian: python3 make-fixtures.py <folder>
import sys, zipfile, zlib, struct, os
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
def esc(s): return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def p(t, style=None):
    pr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
    return f'<w:p>{pr}<w:r><w:t xml:space="preserve">{esc(t)}</w:t></w:r></w:p>'
body = [p('LANGIT SENJA', 'Title'), p('Oleh Zeii')]
for n, title in [(1, 'Awal Mula'), (2, 'Pertemuan di Stasiun'), (3, 'Hujan Pertama'), (4, 'Pulang')]:
    body.append(p(f'Bab {n}: {title}', 'Heading1'))
    for i in range(40):
        body.append(p(f'Paragraf {i+1} dari bab {n}. Senja menggantung rendah di atas kota kecil itu, dan angin membawa wangi hujan yang belum turun. Dia berjalan pelan menyusuri trotoar, menghitung langkah demi langkah. & tanda "kutip" juga <aman>.'))
        if i == 20: body.append(p('***'))
doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ''.join(body) + '</w:body></w:document>'
with zipfile.ZipFile(os.path.join(out, 'naskah.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', doc)
def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
w, h = 200, 300
raw = b''.join(b'\x00' + bytes([(x * 255 // w), (y * 255 // h), 120] * 1) * 1 if False else b'\x00' + b''.join(bytes([x * 255 // w, y * 255 // h, 140]) for x in range(w)) for y in range(h))
open(os.path.join(out, 'sampul.png'), 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
open(os.path.join(out, 'cerita.txt'), 'w').write('Prolog\n\nIni prolog yang cukup panjang untuk dibaca sebentar.\n\nBab 1\n\nIsi bab satu dari file teks.\n\nBab 2\n\nIsi bab dua dari file teks.\n')
