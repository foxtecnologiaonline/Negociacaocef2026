# Comparativo da Negociação Coletiva CAIXA 2026

Página colaborativa comparando o ACT vigente, as propostas da CAIXA (1ª, 2ª e 3ª/Final) e a pauta
de reivindicações dos empregados na Data-Base 2026.

## Como funciona

- `index.html` — página estática (sem build), busca e salva dados via `/api/data`, `/api/suggestions`,
  `/api/changelog` e `/api/upload`
- `api/data.js` — função serverless (Node) que lê/grava o comparativo (JSON) no Vercel Blob Storage
- `api/suggestions.js` — função serverless que lê/grava as sugestões enviadas pelos visitantes
- `api/changelog.js` — função serverless que registra o histórico de alterações (o quê mudou, fonte
  informada, quem editou e quando)
- `api/upload.js` — função serverless que recebe um PDF/imagem anexado como fonte e grava no Blob
  Storage, devolvendo o link público do arquivo
- `lib/body.js` — leitura do corpo da requisição compartilhada pelas funções acima
- `package.json` — dependência `@vercel/blob`

## Deploy no Vercel

1. Importe este repositório no [Vercel](https://vercel.com/new)
2. Em **Storage**, crie (ou conecte) um **Blob Store** a este projeto — isso injeta
   automaticamente a variável `BLOB_READ_WRITE_TOKEN`
3. Pronto — qualquer pessoa com o link pode visualizar e, ao clicar em **"Editar página"**,
   alterar os campos e salvar para todo mundo.

## Exigência de fonte e histórico de alterações

Quem edita qualquer campo já existente na tabela (valor ou selo de indicador) e clica em **"Salvar
alterações"** vê, antes de salvar, um resumo de tudo que mudou (tema, coluna, valor antigo → novo).
Cada alteração exige uma fonte — um link, ou um arquivo (PDF ou imagem, até 4MB) anexado ali mesmo,
que é enviado automaticamente e vira o link da fonte. Sem fonte preenchida em todas as alterações do
lote, o botão de confirmar não salva nada. Um nome/setor de quem editou é opcional.

Depois de confirmado, cada alteração vira uma entrada no **histórico de alterações**, visível
publicamente na própria página (data/hora, quem editou, tema, coluna, valor antigo → novo e a fonte),
antes de a tabela principal ser efetivamente atualizada — dando rastreabilidade completa de quem
mudou o quê e com base em que fonte.

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
