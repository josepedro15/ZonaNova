-- =============================================================================
-- ZonaNova — "Resolvido" para o pós-venda (pedido do piloto Redemac, 14/10/2026)
--
-- Atraso de entrega, troca ou reclamação resolvida não tinha marca própria, e
-- os vendedores usavam "Fechado presencialmente" para tirar o suporte da fila:
-- 14 das 70 marcas presenciais de 06 a 14/10 caíram em suporte, e cada uma
-- contava uma venda que já tinha contado no dia em que fechou.
--
-- "Resolvido" é a marca do suporte: a análise do dia em `resolvida_ref` passa
-- a valer como encerrada (lib/presencial.ts `comResolvida`), e a conversa sai
-- do "Esperando você" até o cliente escrever de novo — mesma regra da venda
-- presencial, pelo instante da marca contra a última fala dele.
--
-- Escrita só pelo service role, na server action que confere quem pode
-- (o vendedor dono, o gestor da unidade, supervisor e admin).
-- =============================================================================

alter table public.conversas
    add column if not exists resolvida_em  timestamptz,
    add column if not exists resolvida_por uuid references public.profiles(id) on delete set null,
    add column if not exists resolvida_ref date;
