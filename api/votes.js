const { put, list } = require('@vercel/blob');
const { readBody } = require('../lib/body');

const PATHNAME = 'comparativo-votes.json';
const CHOICES = ['aceitavel', 'insuficiente'];

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

function emptyTally() {
  return { aceitavel: 0, insuficiente: 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readCurrent();
    res.status(200).json(data || { votes: {} });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const rowId = body && typeof body.rowId === 'string' ? body.rowId : '';
      const choice = body && typeof body.choice === 'string' ? body.choice : '';
      const previousChoice = body && typeof body.previousChoice === 'string' ? body.previousChoice : '';

      if (!rowId) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "rowId" é obrigatório' });
        return;
      }
      if (CHOICES.indexOf(choice) === -1) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "choice" deve ser "aceitavel" ou "insuficiente"' });
        return;
      }
      if (previousChoice && CHOICES.indexOf(previousChoice) === -1) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "previousChoice" inválido' });
        return;
      }

      const current = (await readCurrent()) || { votes: {} };
      const votes = current.votes && typeof current.votes === 'object' ? current.votes : {};

      if (previousChoice !== choice) {
        const tally = votes[rowId] && typeof votes[rowId] === 'object' ? votes[rowId] : emptyTally();
        if (previousChoice && tally[previousChoice] > 0) tally[previousChoice] -= 1;
        tally[choice] = (tally[choice] || 0) + 1;
        votes[rowId] = tally;

        await put(PATHNAME, JSON.stringify({ votes: votes }), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
      }

      res.status(200).json({ ok: true, votes: votes });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
