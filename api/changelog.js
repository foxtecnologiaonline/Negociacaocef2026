const { put, get, BlobPreconditionFailedError } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-changelog.json';
const MAX_STORED = 2000;
const MAX_FIELD_LEN = 4000;
const MAX_SOURCE_LEN = 500;
const MAX_EDITOR_LEN = 80;
const MAX_WRITE_ATTEMPTS = 5;

// Não engolir erro aqui: get() retorna null (sem lançar) quando o blob
// genuinamente não existe ainda. Uma falha real de leitura precisa subir como
// exceção — se o POST tratasse essa falha como "vazio", ele gravaria só a
// entrada nova por cima, apagando todo o histórico anterior.
async function readCurrent() {
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
  if (!result || !result.stream) return { data: null, etag: null };
  const text = await new Response(result.stream).text();
  return { data: JSON.parse(text), etag: result.blob.etag };
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
    try {
      const current = await readCurrent();
      res.status(200).json(current.data || { changes: [] });
    } catch (e) {
      res.status(503).json({ ok: false, error: String(e && e.message || e) });
    }
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

      // Escrita condicional (ifMatch/ETag) com retry: se outra edição gravar
      // uma entrada no histórico entre a nossa leitura e a nossa escrita, o
      // Blob rejeita com BlobPreconditionFailedError e a gente relê o estado
      // mais recente antes de tentar de novo — sem isso, dois lotes de edição
      // quase simultâneos podiam se sobrescrever (o segundo apagava o
      // histórico que o primeiro tinha acabado de gravar).
      let blob = null;
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const current = await readCurrent();
        const existing = Array.isArray(current.data && current.data.changes) ? current.data.changes.slice() : [];
        const merged = entries.concat(existing).slice(0, MAX_STORED);

        const putOptions = {
          access: 'public',
          addRandomSuffix: false,
          contentType: 'application/json',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        };
        if (current.etag) {
          putOptions.ifMatch = current.etag;
        } else {
          putOptions.allowOverwrite = true;
        }

        try {
          blob = await put(PATHNAME, JSON.stringify({ changes: merged }), putOptions);
          break;
        } catch (writeErr) {
          const isConflict = writeErr instanceof BlobPreconditionFailedError;
          if (isConflict && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
          throw writeErr;
        }
      }

      res.status(200).json({ ok: true, url: blob.url, count: entries.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
