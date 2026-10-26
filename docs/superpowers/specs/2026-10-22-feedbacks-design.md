# Página Feedbacks — design

Pedido do Silas (22/10/2026, grupo NEXO & ZONA NOVA): uma página de análise de
conversas sobre **feedbacks** dos clientes — positivos e negativos — para ver as
queixas usuais (frete, entrega) e os elogios (logística, atendimento). Vendedor
vê a própria lista, gestor a da unidade, supervisor e admin a rede. Período 7,
30, 90 dias e geral. Sobrepor a página de Objeções (frete) não é problema.

## 1. O dado: `feedbacks` na análise de cada conversa

- Campo novo no resultado da análise (`lib/analise.ts`), o último do schema
  para não influir nas decisões anteriores:
  `feedbacks: { polaridade: 'positivo' | 'negativo'; assunto; trecho }[]`.
- `assunto` é fechado: `entrega_frete`, `atendimento`, `produto`, `preco`,
  `pagamento`, `outros`. Fora do contrato vira `outros`; lista fora do
  contrato vira `[]` — nunca derruba a análise.
- `trecho` é a fala literal do cliente (linha `C:`).
- Regra nova no prompt (`REGRA_FEEDBACKS`, `lib/pedido-analise.ts`), no fim
  das instruções para não mexer no começo calibrado e em cache: só avaliação
  explícita do cliente sobre a experiência (entrega, atendimento, produto,
  preço, pagamento). Agradecimento de cortesia, pedido, dúvida e objeção de
  compra não são feedback. Fala do vendedor nunca.
- Conferência no código (`ajustarResultado`): sai o feedback cujo trecho não
  está numa fala do cliente (mesma ideia da objeção copiada do vendedor).
- Sem migração: vai no `payload jsonb`.

## 2. Histórico: `scripts/extrair-feedbacks.ts`

- Para cada análise sem a chave `feedbacks`: remonta o transcript do dia pelas
  mensagens gravadas (`montarTranscript`), pede ao Haiku só os feedbacks
  (prompt curto, schema só com `feedbacks`) e grava `payload.feedbacks` sem
  tocar em nota, MEC ou status.
- Padrão é simulação: conta e estima custo. Grava só com `--gravar`. Pula o
  que já tem `feedbacks`, então pode rodar de novo. Quem roda em produção é o
  usuário.

## 3. A página `/feedbacks`

- `lib/feedbacks.ts` faz o levantamento sem I/O; `app/(app)/feedbacks/page.tsx`
  busca; `visao.tsx` desenha; `app/dev/feedbacks` é a vitrine com exemplo.
- Recorte: conversa com cliente de quem é vendedor — qualquer tipo
  (negociação, suporte, social), sem natureza suspeita (`naturezaSuspeita`),
  sem bloqueada e sem dispensada. Unidade de conta: conversa + dia.
- Conteúdo: KPIs (conversas analisadas, com elogio, com reclamação); por
  assunto, positivos e negativos lado a lado; listas de reclamações e de
  elogios, mais recentes primeiro, com trecho, vendedor, data e link para a
  conversa; tabela por vendedor.
- Permissões: vendedor só as próprias conversas (filtro explícito por
  `user_id`: a RLS deixa ele ler a unidade), sem tabela por vendedor e sem
  escolha de loja; gestor as lojas que gerencia; supervisor e admin a rede ou
  uma loja.
- Menu: "Feedbacks" nos quatro papéis. No vendedor entra antes do Perfil, que
  já está no topo da tela no celular.

## 4. Testes

- Unidade: levantamento (contagem, recorte, ordem), schema tolerante e
  conferência do trecho, regra no prompt.
- Script em simulação.
- Página no browser pela vitrine `app/dev/feedbacks`.
