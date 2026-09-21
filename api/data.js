const { put, get } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-data.json';

async function readCurrent() {
  try {
    // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
    // conteúdo antigo por até um mês) e lê direto da origem — essencial aqui
    // porque finishSave() (no index.html) lê o estado atual antes de mesclar
    // e gravar uma edição concorrente; sem isso, ele podia enxergar uma
    // versão desatualizada. Não precisa de token/OIDC explícito: quando o
    // Blob Store está conectado ao projeto, get() resolve a autenticação
    // sozinho a partir do pathname.
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
