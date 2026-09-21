const { put, list } = require('@vercel/blob');
const { readBody } = require('../lib/body');
const crypto = require('crypto');

const PATHNAME = 'comparativo-votes.json';
const CHOICES = ['aceitavel', 'insuficiente'];
const COOKIE_NAME = 'voter_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 anos

async function readCurrent() {
  try {
    // Não retorna cedo se BLOB_READ_WRITE_TOKEN estiver ausente: quando o Blob
    // Store é conectado ao projeto (em vez de configurado via token manual), a
    // autenticação é feita via OIDC e essa variável nunca existe — list()/put()
    // resolvem sozinhos nesse caso. Um curto-circuito aqui faria toda leitura
    // voltar vazia mesmo com dados gravados de verdade no Blob.
    const { blobs } = await list({ prefix: PATHNAME, token: process.env.BLOB_READ_WRITE_TOKEN, limit: 1 });
    if (!blobs || !blobs.length) return null;
    // cache: 'no-store' evita cache local, mas o Blob por padrão também serve
    // o conteúdo antigo por um bom tempo via CDN (cacheControlMaxAge default
    // é de dias) — por isso o put() abaixo grava com cacheControlMaxAge: 0,
    // senão um voto seguinte lê essa URL ainda desatualizada e sobrescreve o
    // voto anterior ao salvar (era a causa dos votos "sumirem").
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function getVoterId(req) {
  const header = req.headers && req.headers.cookie;
  if (!header) return '';
  const match = String(header).match(/(?:^|;\s*)voter_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function setVoterCookie(res, voterId) {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=' + encodeURIComponent(voterId) +
    '; Path=/; Max-Age=' + COOKIE_MAX_AGE + '; HttpOnly; SameSite=Lax' + (isProd ? '; Secure' : ''));
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
    const data = await readCurrent();
    const voters = (data && data.voters && typeof data.voters === 'object') ? data.voters : {};
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

      const current = (await readCurrent()) || { voters: {} };
      const voters = (current.voters && typeof current.voters === 'object') ? current.voters : {};
      const mine = (voters[voterId] && typeof voters[voterId] === 'object') ? Object.assign({}, voters[voterId]) : {};
      mine[rowId] = choice;
      voters[voterId] = mine;

      await put(PATHNAME, JSON.stringify({ voters: voters }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      res.status(200).json({ ok: true, votes: tallyAll(voters), myVotes: mine });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
