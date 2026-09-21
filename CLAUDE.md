# Instruções de trabalho

- Ao lidar com problemas (bugs, deploy, infraestrutura): ser assertivo. Ir direto
  para a ação/correção mais rápida e eficaz disponível, sem rodeios. Evitar
  ping-pong de diagnóstico quando dá pra resolver ou testar direto.
- Se algo exige uma ação manual do usuário (ex.: painel da Vercel), deixar isso
  bem claro e minimizado — só pedir quando for genuinamente a única opção, dizer
  exatamente o motivo (qual permissão falta), e dar o caminho mais curto possível.
- Preferir resolver via API/código sempre que houver uma opção, mesmo que dê mais
  trabalho para mim, em vez de terceirizar passos para o usuário.

## Design system — layout padrão do projeto

O visual atual de `index.html` (tema claro com identidade CAIXA) é o **padrão
oficial** do projeto. Qualquer alteração futura de conteúdo, funcionalidade ou
layout deve **preservar** este sistema visual em vez de reverter para versões
anteriores (ex.: o tema escuro azul-royal usado antes) ou introduzir uma paleta
nova sem pedido explícito do usuário.

**Paleta (`:root` em `index.html`):**
- Fundo: `--paper` (#F2F4F7, cinza muito claro) e `--paper-card` (#FFFFFF)
- Azul institucional: `--blue-700` (#003DA5) para header/nav/barra inferior,
  `--blue-800` (#00308F) para títulos e texto de destaque
- Laranja de marca `--orange` (#F39200): **só em elementos decorativos**
  (sublinhados, bordas, badges) — nunca como cor de texto ou fundo de botão com
  texto em cima, porque não atinge contraste AA (4.5:1). Para texto/botões,
  usar sempre `--orange-text` (#A85700) / `--orange-text-hover` (#8C4A00).
- Cores por coluna do comparativo: `--c-hoje`, `--c-p1`, `--c-p2`, `--c-p3`,
  `--c-reiv` (usadas na borda/fundo de cada campo e na legenda).

**Layout responsivo:**
- Largura do conteúdo controlada por `--content-max` (800px por padrão,
  1180px a partir de 960px de largura de tela via media query em `:root`).
- Abaixo de 960px: cada tema é um card com os 5 campos empilhados
  verticalmente (bom para leitura em uma coluna, mobile/tablet).
- A partir de 960px: os 5 campos de cada card viram colunas lado a lado
  (`.card dl { display:flex }` dentro do media query `min-width: 960px`),
  formando uma tabela de comparação real — não empilhar novamente nem remover
  esse breakpoint sem necessidade.
- Nav de grupos com scroll horizontal em telas estreitas tem uma dica visual
  (`.nav::after`, gradiente) indicando que há mais itens — manter ao mexer na
  nav.
- Barra inferior (`.bar__inner`) empilha texto de status acima dos botões
  abaixo de 480px para não ficar apertada — manter esse comportamento.

Antes de mudar cores, espaçamento ou breakpoints, verificar contraste (mínimo
AA, 4.5:1 para texto normal) e testar em pelo menos 3 larguras (mobile ~375px,
tablet ~768px, desktop ~1280px).
