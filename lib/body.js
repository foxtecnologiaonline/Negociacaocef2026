// O runtime Node da Vercel faz parsing automático do corpo da requisição e expõe
// `req.body` já pronto (string, Buffer ou objeto, dependendo do Content-Type) —
// quando isso acontece, o stream original já foi consumido, então ler `req`
// manualmente retornaria vazio. Por isso priorizamos req.body quando existir, e
// só fazemos leitura manual do stream como alternativa (útil fora do runtime da
// Vercel, por exemplo em testes locais).
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyStr = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(bodyStr);
}

module.exports = { readBody };
