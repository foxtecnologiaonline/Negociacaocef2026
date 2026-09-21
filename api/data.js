const { put, list } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-data.json';

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readCurrent();
    res.status(200).json(data || { rows: [] });
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const data = await readBody(req);

      if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "rows" deve ser um array' });
        return;
      }
      for (const row of data.rows) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) {
          res.status(400).json({ ok: false, error: 'invalid_payload: cada linha precisa de um "id"' });
          return;
        }
      }

      const blob = await put(PATHNAME, JSON.stringify(data), {
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
