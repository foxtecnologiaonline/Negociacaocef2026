const { put, get } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-data.json';

// Não engolir erro aqui: get() retorna null (sem lançar) quando o blob
// genuinamente não existe ainda, e isso sim é "vazio" de verdade. Uma falha
// real de leitura (rede, timeout) precisa subir como exceção — se um GET
// tratasse essa falha como "vazio", a página mostraria a tabela zerada (ou o
// SEED) mesmo com dados salvos de verdade no Blob.
async function readCurrent() {
  // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
  // conteúdo antigo por até um mês) e lê direto da origem — essencial aqui
  // porque finishSave() (no index.html) lê o estado atual antes de mesclar
  // e gravar uma edição concorrente; sem isso, ele podia enxergar uma versão
  // desatualizada. Não precisa de token/OIDC explícito: quando o Blob Store
  // está conectado ao projeto, get() resolve a autenticação sozinho.
  const result = await get(PATHNAME, {
    access: 'public',
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text());
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = await readCurrent();
      res.status(200).json(data || { rows: [] });
    } catch (e) {
      res.status(503).json({ ok: false, error: String(e && e.message || e) });
    }
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
