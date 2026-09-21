const { put, get, BlobPreconditionFailedError } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-suggestions.json';
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 80;
const MAX_STORED = 500;
const MAX_WRITE_ATTEMPTS = 5;

// Não engolir erro aqui: get() retorna null (sem lançar) quando o blob
// genuinamente não existe ainda. Uma falha real de leitura precisa subir como
// exceção — se o POST tratasse essa falha como "vazio", ele gravaria só a
// sugestão nova por cima, apagando todas as anteriores.
async function readCurrent() {
  // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
  // conteúdo antigo por até um mês) e lê direto da origem — sem isso, uma
  // sugestão gravada agora podia não aparecer nas leituras seguintes por um
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const current = await readCurrent();
      res.status(200).json(current.data || { suggestions: [] });
    } catch (e) {
      res.status(503).json({ ok: false, error: String(e && e.message || e) });
    }
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

      const newSuggestion = {
        id: makeId(),
        text: text,
        name: name || null,
        createdAt: new Date().toISOString(),
      };

      // Escrita condicional (ifMatch/ETag) com retry: se outra sugestão for
      // gravada entre a nossa leitura e a nossa escrita, o Blob rejeita com
      // BlobPreconditionFailedError e a gente relê o estado mais recente antes
      // de tentar de novo — sem isso, duas sugestões quase simultâneas podiam
      // se sobrescrever (a segunda apagava a primeira).
      let blob = null;
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const current = await readCurrent();
        const existing = Array.isArray(current.data && current.data.suggestions) ? current.data.suggestions.slice() : [];
        const trimmed = [newSuggestion].concat(existing).slice(0, MAX_STORED);

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
          blob = await put(PATHNAME, JSON.stringify({ suggestions: trimmed }), putOptions);
          break;
        } catch (writeErr) {
          const isConflict = writeErr instanceof BlobPreconditionFailedError;
          if (isConflict && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
          throw writeErr;
        }
      }

      res.status(200).json({ ok: true, url: blob.url });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
