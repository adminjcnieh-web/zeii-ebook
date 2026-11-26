// Utilitas HTTP: error terstruktur dan helper respons JSON.

export class HttpError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

export async function readJson(request, maxBytes = 20000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Data yang dikirim terlalu besar', 'too_large');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('bukan objek');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'Data yang dikirim bukan JSON yang valid', 'bad_json');
  }
}
