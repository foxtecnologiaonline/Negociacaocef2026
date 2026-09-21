# Comparativo da Negociação Coletiva CAIXA 2026

Página colaborativa comparando o ACT vigente, as propostas da CAIXA (1ª, 2ª e 3ª/Final) e a pauta
de reivindicações dos empregados na Data-Base 2026.

## Como funciona

- `index.html` — página estática (sem build), busca e salva dados via `/api/data` e `/api/suggestions`
- `api/data.js` — função serverless (Node) que lê/grava o comparativo (JSON) no Vercel Blob Storage
- `api/suggestions.js` — função serverless que lê/grava as sugestões enviadas pelos visitantes
- `lib/body.js` — leitura do corpo da requisição compartilhada pelas duas funções acima
- `package.json` — dependência `@vercel/blob`

## Deploy no Vercel

1. Importe este repositório no [Vercel](https://vercel.com/new)
2. Em **Storage**, crie (ou conecte) um **Blob Store** a este projeto — isso injeta
   automaticamente a variável `BLOB_READ_WRITE_TOKEN`
3. Pronto — qualquer pessoa com o link pode visualizar e, ao clicar em **"Editar página"**,
   alterar os campos e salvar para todo mundo.

## Sugestões dos visitantes

Qualquer visitante pode clicar em **"Sugerir um ponto"** (logo abaixo do topo da página) e enviar
um texto livre (até 1000 caracteres) com um ponto importante que acha que falta no comparativo.
As sugestões ficam listadas na própria página, mais recentes primeiro, para revisão — nada é
incorporado automaticamente ao comparativo; quem administra a página decide o que entra, editando
manualmente em **"Editar página"**.

## Indicador de melhora/piora nas propostas

Cada proposta da Caixa (1ª, 2ª, 3ª/Final) exibe um selo antes do valor indicando se aquele ponto
melhorou, piorou ou ficou igual em relação ao ACT vigente (2024–2026), com o percentual quando
aplicável. O selo é editável do mesmo jeito que os demais campos, em **"Editar página"**. Só foram
preenchidos automaticamente os casos em que o próprio texto da proposta já afirma algo objetivo
(ex.: "Sem alteração" → Igual; percentuais diretamente comparáveis, como a contribuição da Caixa
subindo de 6,5% para 8%/9%). Os demais ficam marcados como "Impacto a avaliar" até alguém revisar
e preencher manualmente.
