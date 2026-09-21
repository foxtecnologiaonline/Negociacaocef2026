# Comparativo da Negociação Coletiva CAIXA 2026

Página colaborativa comparando o ACT vigente, as propostas da CAIXA (1ª, 2ª e 3ª/Final) e a pauta
de reivindicações dos empregados na Data-Base 2026.

## Como funciona

- `index.html` — página estática (sem build), busca e salva dados via `/api/data`, `/api/suggestions`,
  `/api/changelog`, `/api/upload` e `/api/votes`
- `api/data.js` — função serverless (Node) que lê/grava o comparativo (JSON) no Vercel Blob Storage
- `api/suggestions.js` — função serverless que lê/grava as sugestões enviadas pelos visitantes
- `api/changelog.js` — função serverless que registra o histórico de alterações (o quê mudou, fonte
  informada, quem editou e quando)
- `api/upload.js` — função serverless que recebe um PDF/imagem anexado como fonte e grava no Blob
  Storage, devolvendo o link público do arquivo
- `api/votes.js` — função serverless que lê/grava a contagem de votos (Aceitável/Insuficiente) por
  tema, dados na 3ª Proposta / Final
- `lib/body.js` — leitura do corpo da requisição compartilhada pelas funções acima
- `package.json` — dependência `@vercel/blob`

## Deploy no Vercel

1. Importe este repositório no [Vercel](https://vercel.com/new)
2. Em **Storage**, crie (ou conecte) um **Blob Store** a este projeto — isso injeta
   automaticamente a variável `BLOB_READ_WRITE_TOKEN`
3. Pronto — qualquer pessoa com o link pode visualizar e, ao clicar em **"Editar página"**,
   alterar os campos e salvar para todo mundo.

## Fonte (opcional) e histórico de alterações

Quem edita qualquer campo já existente na tabela (valor ou selo de indicador) e clica em **"Salvar
alterações"** vê, antes de salvar, um resumo de tudo que mudou (tema, coluna, valor antigo → novo).
Cada alteração pode receber uma fonte — um link, ou um arquivo (PDF ou imagem, até 4MB) anexado ali
mesmo, que é enviado automaticamente e vira o link da fonte. A fonte não é obrigatória para salvar;
a página apenas incentiva o envio ("Envie a fonte para ampliarmos a biblioteca de informações").

Depois de confirmado, cada alteração vira uma entrada no histórico gravado via `/api/changelog`
(data/hora, tema, coluna, valor antigo → novo e a fonte, quando informada), antes de a tabela
principal ser efetivamente atualizada — dando rastreabilidade de quem mudou o quê e com base em
que fonte. **Esse histórico não é exibido na página pública** — fica só no Blob Storage,
consultável via `GET /api/changelog`, para quem administra a página revisar quando precisar.

## Sugestões dos visitantes

Qualquer visitante pode clicar em **"Sugerir um ponto"** (logo abaixo do topo da página) e enviar
um texto livre (até 1000 caracteres) com um ponto importante que acha que falta no comparativo.
As sugestões ficam listadas na própria página, mais recentes primeiro, para revisão — nada é
incorporado automaticamente ao comparativo; quem administra a página decide o que entra, editando
manualmente em **"Editar página"**.

## Analytics e tracking

A página injeta os scripts do **Vercel Web Analytics** e **Vercel Speed Insights**
(`/_vercel/insights/script.js` e `/_vercel/speed-insights/script.js`), que a própria
Vercel serve automaticamente — sem necessidade de build ou dependência de npm.

Para os dados começarem a aparecer, é preciso **ativar os dois recursos no projeto na
Vercel** (isso não tem endpoint de API — só dá pra ligar no painel):

1. Abra o projeto em vercel.com → aba **Analytics** → **Enable**
2. Abra a aba **Speed Insights** → **Enable**

Depois de ativado (pode levar alguns minutos para os primeiros dados aparecerem):

- **Analytics** (visitas, páginas, origem, dispositivo): aba **Analytics** do projeto
- **Speed Insights** (Core Web Vitals — LCP, CLS, INP etc.): aba **Speed Insights** do projeto

Ambos são gratuitos no plano Hobby dentro do limite de eventos mensal.

## Indicador de melhora/piora nas propostas

Cada proposta da Caixa (1ª, 2ª, 3ª/Final) exibe um selo antes do valor indicando se aquele ponto
melhorou, piorou ou ficou igual em relação ao ACT vigente (2024–2026), com o percentual quando
aplicável. O selo é editável do mesmo jeito que os demais campos, em **"Editar página"**. Só foram
preenchidos automaticamente os casos em que o próprio texto da proposta já afirma algo objetivo
(ex.: "Sem alteração" → Igual; percentuais diretamente comparáveis, como a contribuição da Caixa
subindo de 6,5% para 8%/9%). Os demais ficam marcados como "Impacto a avaliar" até alguém revisar
e preencher manualmente.

A 3ª Proposta / Final tem um segundo selo, na mesma lógica, comparando-a com a pauta de
**reivindicações** (não só com o ACT vigente). Esse segundo selo (campo `p3ir`) começa em branco
("Impacto a avaliar") em todos os temas — é uma leitura de conteúdo que só quem acompanha a
negociação deve preencher, em **"Editar página"**, para não presumir uma avaliação que não foi
revisada.

## Resumo visual da 3ª Proposta / Final

Logo abaixo do topo da página, uma seção mostra os dois selos da 3ª Proposta / Final (vs. Hoje e
vs. Reivindicação) de todos os temas em um só lugar, sem precisar rolar cada card — é a mesma
informação dos selos dentro dos cards, só que reunida para dar uma visão geral rápida de onde a
proposta final está ganhando ou ficando devendo.

## Votação por tema (Aceitável / Insuficiente)

Cada card tem uma enquete simples: qualquer visitante pode marcar se acha a 3ª Proposta / Final
**aceitável** ou **insuficiente** para aquele tema específico. O resultado (contagem e percentual)
aparece imediatamente no próprio card, numa barra de proporção, e é salvo em `/api/votes`
(Vercel Blob, arquivo `comparativo-votes.json`).

Cada visitante é identificado por um cookie `voter_id` httpOnly, gerado pelo próprio `/api/votes`
no primeiro acesso — o voto fica registrado no servidor por votante (`comparativo-votes.json` guarda
`{ voters: { <voter_id>: { <rowId>: "aceitavel" | "insuficiente" } } }` e a contagem exibida é
calculada a partir desse mapa). Isso permite trocar de opinião a qualquer momento (o voto anterior
do mesmo tema é substituído, não somado de novo) e impede duplicar voto só limpando o `localStorage`
ou chamando a API direto, como acontecia antes — falta só um voto por pessoa "de verdade" (várias
contas de e-mail/CPF), que exigiria login. Não há servidor de tempo real (WebSocket/SSE) neste
projeto estático: a página busca os votos ao carregar e depois a cada 20s, o que já é o suficiente
para os relatórios acompanharem a votação "ao vivo" sem precisar recarregar.
