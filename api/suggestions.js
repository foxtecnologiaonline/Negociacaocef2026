const { put, get } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-suggestions.json';
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 80;
const MAX_STORED = 500;

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
  if (!result || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = await readCurrent();
      res.status(200).json(data || { suggestions: [] });
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
