-- =============================================================================
-- ZonaNova — custo de toda chamada de IA (27/10/2026)
--
-- Só a análise guardava custo, e em `analises_conversa`, que a reanálise
-- sobrescreve: o mês de outubro na OpenAI deu US$ 25 e o banco mostrava uns
-- US$ 3. O relatório do vendedor é refeito a cada análise nova do dia e só a
-- última versão ficava; transcrição, mídia e descobertas não ficavam em lugar
-- nenhum.
--
-- Uma linha por chamada paga (lib/custo-ia.ts), gravada pelo worker e pelo
-- cron de descobertas. Cache (áudio ou mídia com o mesmo hash) não é chamada
-- e não entra. Sem conteúdo: só o modelo, os tokens e o custo.
-- =============================================================================

create table if not exists public.custos_ia (
    id          bigint generated always as identity primary key,
    criado_em   timestamptz not null default now(),
    etapa       text not null check (etapa in ('analise', 'relatorio', 'transcricao', 'midia', 'descobertas')),
    modelo      text not null,
    entrada     integer not null default 0,
    saida       integer not null default 0,
    -- Áudio cobrado por minuto (whisper-1) informa a duração em vez de tokens.
    segundos    numeric(10, 2),
    custo       numeric(12, 6) not null default 0,
    -- Conversa, mensagem ou vendedor, conforme a etapa; descobertas fica sem.
    referencia  text,
    data_ref    date
);

create index if not exists ix_custos_ia_criado on public.custos_ia (criado_em);
create index if not exists ix_custos_ia_etapa_criado on public.custos_ia (etapa, criado_em);

-- Só o service role toca, como a webhook_registro (0033).
alter table public.custos_ia enable row level security;
revoke all on public.custos_ia from anon, authenticated;
