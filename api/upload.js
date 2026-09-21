const { put } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — margem segura sob o limite de body do runtime
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

function safeFilename(name) {
  var base = String(name || 'arquivo').split(/[\\/]/).pop();
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return base || 'arquivo';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const contentType = body && typeof body.contentType === 'string' ? body.contentType : '';
    const dataBase64 = body && typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
    const filename = safeFilename(body && body.filename);

    if (!ALLOWED_TYPES.includes(contentType)) {
      res.status(400).json({ ok: false, error: 'invalid_payload: tipo de arquivo não permitido (use PDF, PNG, JPEG, WEBP ou GIF)' });
      return;
    }
    if (!dataBase64) {
      res.status(400).json({ ok: false, error: 'invalid_payload: "dataBase64" é obrigatório' });
      return;
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0) {
      res.status(400).json({ ok: false, error: 'invalid_payload: arquivo vazio' });
      return;
    }
    if (buffer.length > MAX_BYTES) {
      res.status(400).json({ ok: false, error: 'invalid_payload: arquivo maior que 4MB — use um link em vez disso' });
      return;
    }

    const pathname = 'fontes/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '-' + filename;

    const blob = await put(pathname, buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
