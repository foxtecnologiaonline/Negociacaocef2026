const { put, list } = require('@vercel/blob');

const PATHNAME = 'comparativo-data.json';

async function readCurrent() {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    const { blobs } = await list({ prefix: PATHNAME, token, limit: 1 });
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
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      const data = JSON.parse(bodyStr);

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
