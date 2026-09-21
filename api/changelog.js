const { put, get } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-changelog.json';
const MAX_STORED = 2000;
const MAX_FIELD_LEN = 4000;
const MAX_SOURCE_LEN = 500;
const MAX_EDITOR_LEN = 80;

async function readCurrent() {
  try {
    // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
    // conteúdo antigo por até um mês) e lê direto da origem — sem isso, uma
    // entrada gravada agora podia não aparecer nas leituras seguintes por um
    // bom tempo. Não precisa de token/OIDC explícito: quando o Blob Store
    // está conectado ao projeto, get() resolve a autenticação sozinho.
    const result = await get(PATHNAME, {
      access: 'public',
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text());
  } catch (e) {
    return null;
  }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function str(v, max) {
  var s = typeof v === 'string' ? v : '';
  return s.slice(0, max);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readCurrent();
    res.status(200).json(data || { changes: [] });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const incoming = body && Array.isArray(body.changes) ? body.changes : null;

      if (!incoming || !incoming.length) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "changes" deve ser um array não vazio' });
        return;
      }

      const entries = [];
      for (const c of incoming) {
        const source = c && typeof c.source === 'string' ? c.source.trim() : '';
        const rowId = c && typeof c.rowId === 'string' ? c.rowId : '';
        const col = c && typeof c.col === 'string' ? c.col : '';
        if (!rowId || !col) {
          res.status(400).json({ ok: false, error: 'invalid_payload: "rowId" e "col" são obrigatórios em cada alteração' });
          return;
        }
        entries.push({
          id: makeId(),
          at: new Date().toISOString(),
          rowId: rowId,
          tema: str(c.tema, 200),
          col: col,
          colLabel: str(c.colLabel, 200),
          oldValue: str(c.oldValue, MAX_FIELD_LEN),
          newValue: str(c.newValue, MAX_FIELD_LEN),
          source: str(source, MAX_SOURCE_LEN),
          editor: c.editor ? str(c.editor, MAX_EDITOR_LEN) : null,
        });
      }

      const current = (await readCurrent()) || { changes: [] };
      const existing = Array.isArray(current.changes) ? current.changes.slice() : [];
      const merged = entries.concat(existing).slice(0, MAX_STORED);

      const blob = await put(PATHNAME, JSON.stringify({ changes: merged }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      res.status(200).json({ ok: true, url: blob.url, count: entries.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
