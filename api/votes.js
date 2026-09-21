const { put, get, BlobPreconditionFailedError } = require('@vercel/blob');
const { readBody } = require('../lib/body');
const crypto = require('crypto');

const PATHNAME = 'comparativo-votes.json';
const CHOICES = ['aceitavel', 'insuficiente'];
const COOKIE_NAME = 'voter_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 anos
const MAX_WRITE_ATTEMPTS = 5;
const MAX_ROW_ID_LEN = 200;
// Só aceita cookies no formato exato gerado por crypto.randomUUID() — qualquer
// outro valor (forjado à mão, ou algo como "__proto__") é tratado como se não
// houvesse cookie, e um novo é emitido. Isso também fecha, de graça, o vetor
// de poluição de protótipo: um voterId que nunca chega a ser usado como chave
// não tem como disparar o setter especial de "__proto__".
const VOTER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Importante: NÃO engolir erro aqui. get() retorna null (sem lançar) quando o
// blob genuinamente não existe ainda — isso sim é "vazio" de verdade. Qualquer
// outra falha (rede, timeout, erro transitório da origem) precisa subir como
// exceção para quem chamou tratar: se um GET tratasse essa falha como "vazio",
// a página mostraria 0 votos mesmo com voto salvo (a contagem "piscava"); se um
// POST tratasse como "vazio", ele achava que não existia voto de ninguém ainda
// e gravava allowOverwrite sem ifMatch, apagando os votos de todo mundo.
async function readCurrent() {
  // useCache: false ignora o cache de CDN do Blob (que por padrão serve o
  // conteúdo antigo por hora/dias) e lê direto da origem — sem isso, um voto
  // seguinte podia ler uma versão desatualizada e, ao gravar de volta, apagar
  // o voto anterior (era a causa original dos votos "sumirem").
  const result = await get(PATHNAME, {
    access: 'public',
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || !result.stream) return { data: null, etag: null };
  const text = await new Response(result.stream).text();
  return { data: JSON.parse(text), etag: result.blob.etag };
}

function getVoterId(req) {
  const header = req.headers && req.headers.cookie;
  if (!header) return '';
  const match = String(header).match(/(?:^|;\s*)voter_id=([^;]+)/);
  if (!match) return '';
  const value = decodeURIComponent(match[1]);
  return VOTER_ID_RE.test(value) ? value : '';
}

function setVoterCookie(res, voterId) {
  const isSecureContext = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  res.setHeader('Set-Cookie',
    COOKIE_NAME + '=' + encodeURIComponent(voterId) +
    '; Path=/; Max-Age=' + COOKIE_MAX_AGE + '; HttpOnly; SameSite=Lax' + (isSecureContext ? '; Secure' : ''));
}

function tallyAll(voters) {
  // Object.create(null) em vez de {}: rowId e voterId vêm de fora (POST body e
  // cookie) e viram chave de objeto por bracket notation (obj[rowId] = ...).
  // Num objeto comum, a chave "__proto__" não é uma propriedade normal — é um
  // getter/setter herdado que troca o protótipo do objeto por baixo dos panos,
  // fazendo o voto "desaparecer" (nunca vira propriedade própria, então nem é
  // serializado no JSON.stringify) sem erro nenhum. Um objeto sem protótipo
  // não tem esse getter/setter especial, então "__proto__" vira só mais uma
  // string de chave, como qualquer outra.
  const votes = Object.create(null);
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
    try {
      const current = await readCurrent();
      const voters = (current.data && current.data.voters && typeof current.data.voters === 'object') ? current.data.voters : Object.create(null);
      res.status(200).json({ votes: tallyAll(voters), myVotes: voters[voterId] || {} });
    } catch (e) {
      // Erro real de leitura (não "ainda não existe voto"): responde com falha
      // em vez de fingir "0 votos", para o front-end manter o último estado
      // bom em vez de sobrescrever a tela com um resultado vazio incorreto.
      res.status(503).json({ ok: false, error: String(e && e.message || e) });
    }
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
      if (rowId.length > MAX_ROW_ID_LEN) {
        res.status(400).json({ ok: false, error: 'invalid_payload: "rowId" muito longo' });
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
        // Pequeno atraso com jitter antes de tentar de novo: sem isso, votos
        // concorrentes que colidiram tendem a colidir de novo imediatamente
        // (todos leem e escrevem no mesmo instante), esgotando as tentativas
        // à toa sob pico real de acessos em vez de se resolver no retry.
        if (attempt > 0) {
          await new Promise(function (resolve) { setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)); });
        }

        const current = await readCurrent();
        // voters vem de um JSON.parse() (ou de Object.create(null) no fallback)
        // exclusivo desta chamada — não é reaproveitado em outro lugar, então
        // dá para mutar direto em vez de clonar o mapa inteiro a cada
        // tentativa. Isso é seguro mesmo com prototype normal porque voterId
        // já passou pela validação de formato UUID (nunca é "__proto__"); só
        // "mine", indexado por rowId (livre, sem validação de formato), é que
        // precisa ser Object.create(null).
        const voters = (current.data && current.data.voters && typeof current.data.voters === 'object') ? current.data.voters : Object.create(null);
        const existingMine = voters[voterId];
        const mine = Object.assign(Object.create(null), (existingMine && typeof existingMine === 'object') ? existingMine : null);
        mine[rowId] = choice;
        voters[voterId] = mine;

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
          await put(PATHNAME, JSON.stringify({ voters: voters }), putOptions);
          outcome = { votes: tallyAll(voters), myVotes: mine };
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
