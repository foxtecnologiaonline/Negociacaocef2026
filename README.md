# Comparativo da Negociação Coletiva CAIXA 2026

Página colaborativa comparando o ACT vigente, as propostas da CAIXA (1ª, 2ª e 3ª/Final) e a pauta
de reivindicações dos empregados na Data-Base 2026.

## Como funciona

- `index.html` — página estática (sem build), busca e salva dados via `/api/data`
- `api/data.js` — função serverless (Node) que lê/grava um JSON no Vercel Blob Storage
- `package.json` — dependência `@vercel/blob`

## Deploy no Vercel

1. Importe este repositório no [Vercel](https://vercel.com/new)
2. Em **Storage**, crie (ou conecte) um **Blob Store** a este projeto — isso injeta
   automaticamente a variável `BLOB_READ_WRITE_TOKEN`
3. Pronto — qualquer pessoa com o link pode visualizar e, ao clicar em **"Editar página"**,
   alterar os campos e salvar para todo mundo.
