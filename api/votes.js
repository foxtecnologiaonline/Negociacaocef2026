const { put, get, BlobPreconditionFailedError } = require('@vercel/blob');
const { readBody } = require('../lib/body');
const crypto = require('crypto');

const PATHNAME = 'comparativo-votes.json';
const CHOICES = ['aceitavel', 'insuficiente'];
const COOKIE_NAME = 'voter_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 anos
const MAX_WRITE_ATTEMPTS = 5;

async function readCurrent() {
  try {
    // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
    // conteúdo antigo por hora/dias) e lê direto da origem — sem isso, um
    // voto seguinte podia ler uma versão desatualizada e, ao gravar de volta,
    // apagar o voto anterior (era a causa dos votos "sumirem").
    const result = await get(PATHNAME, {
      access: 'public',
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || !result.stream) return { data: null, etag: null };
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text), etag: result.blob.etag };
  } catch (e) {
    return { data: null, etag: null };
  }
}

function getVoterId(req) {
  const header = req.headers && req.headers.cookie;
  if (!header) return '';
  const match = String(header).match(/(?:^|;\s*)voter_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function setVoterCookie(res, voterId) {
  const isSecureContext = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=' + encodeURIComponent(voterId) +
    '; Path=/; Max-Age=' + COOKIE_MAX_AGE + '; HttpOnly; SameSite=Lax' + (isSecureContext ? '; Secure' : ''));
}

function tallyAll(voters) {
  const votes = {};
  for (const vid in voters) {
    const rowChoices = voters[vid];
    if (!rowChoices || typeof rowChoices !== 'object') continue;
    for (const rowId in rowChoices) {
      const choice = rowChoices[rowId];
      if (CHOICES.indexOf(choice) === -1) continue;
      if (!votes[rowId]) votes[rowId] = { aceitavel: 0, insuficiente: 0 };
      votes[rowId][choice] += 1;
    }
  }
  return votes;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // Identifica o visitante por um cookie httpOnly gerado no servidor — ao
  // contrário do localStorage (que o próprio navegador do visitante controla
  // e qualquer chamada direta à API pode ignorar), isso garante 1 voto por
  // visitante por tema mesmo trocando de aba ou chamando a API manualmente.
  let voterId = getVoterId(req);
  if (!voterId) {
    voterId = crypto.randomUUID();
    setVoterCookie(res, voterId);
  }

  if (req.method === 'GET') {
    const current = await readCurrent();
    const voters = (current.data && current.data.voters && typeof current.data.voters === 'object') ? current.data.voters : {};
    res.status(200).json({ votes: tallyAll(voters), myVotes: voters[voterId] || {} });
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const rowId = body && typeof body.rowId === 'string' ? body.rowId : '';
      const choice = body && typeof body.choice === 'string' ? body.choice : '';

      if (!rowId) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "rowId" é obrigatório' });
        return;
      }
      if (CHOICES.indexOf(choice) === -1) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "choice" deve ser "aceitavel" ou "insuficiente"' });
        return;
      }

      // Escrita condicional (ifMatch/ETag) com retry: se outro voto concorrente
      // gravar entre a nossa leitura e a nossa escrita, o Blob rejeita com
      // BlobPreconditionFailedError e a gente relê o estado mais recente antes
      // de tentar de novo — sem isso, dois votos quase simultâneos podiam se
      // sobrescrever (o segundo apagava o primeiro).
      let outcome = null;
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const current = await readCurrent();
        const voters = (current.data && current.data.voters && typeof current.data.voters === 'object') ? current.data.voters : {};
        const mine = (voters[voterId] && typeof voters[voterId] === 'object') ? Object.assign({}, voters[voterId]) : {};
        mine[rowId] = choice;
        const nextVoters = Object.assign({}, voters);
        nextVoters[voterId] = mine;

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
          await put(PATHNAME, JSON.stringify({ voters: nextVoters }), putOptions);
          outcome = { votes: tallyAll(nextVoters), myVotes: mine };
          break;
        } catch (writeErr) {
          const isConflict = writeErr instanceof BlobPreconditionFailedError;
          if (isConflict && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
          throw writeErr;
        }
      }

      res.status(200).json({ ok: true, votes: outcome.votes, myVotes: outcome.myVotes });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
