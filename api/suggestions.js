const { put, list } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-suggestions.json';
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 80;
const MAX_STORED = 500;

async function readCurrent() {
  try {
    // Não retorna cedo se BLOB_READ_WRITE_TOKEN estiver ausente: quando o Blob
    // Store é conectado ao projeto (em vez de configurado via token manual), a
    // autenticação é feita via OIDC e essa variável nunca existe — list()/put()
    // resolvem sozinhos nesse caso. Um curto-circuito aqui faria toda leitura
    // voltar vazia mesmo com dados gravados de verdade no Blob.
    const { blobs } = await list({ prefix: PATHNAME, token: process.env.BLOB_READ_WRITE_TOKEN, limit: 1 });
    if (!blobs || !blobs.length) return null;
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readCurrent();
    res.status(200).json(data || { suggestions: [] });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const text = body && typeof body.text === 'string' ? body.text.trim() : '';
      const name = body && typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';

      if (!text) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "text" é obrigatório' });
        return;
      }
      if (text.length > MAX_TEXT_LEN) {
        res.status(400).json({ ok: false, error: 'invalid_payload: texto muito longo (máx. ' + MAX_TEXT_LEN + ' caracteres)' });
        return;
      }

      const current = (await readCurrent()) || { suggestions: [] };
      const suggestions = Array.isArray(current.suggestions) ? current.suggestions.slice() : [];

      suggestions.unshift({
        id: makeId(),
        text: text,
        name: name || null,
        createdAt: new Date().toISOString(),
      });

      const trimmed = suggestions.slice(0, MAX_STORED);

      const blob = await put(PATHNAME, JSON.stringify({ suggestions: trimmed }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      res.status(200).json({ ok: true, url: blob.url });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
