-- =============================================================================
-- ZonaNova — duas perdas silenciosas que a revisão de 22/09/2026 encontrou
--
-- 1. `fila_processamento.iniciado_em` — um item passa para `processando` e,
--    se a função cai ou estoura o tempo antes de gravar o desfecho, fica
--    assim para sempre. Pior: o encadeamento conta `processando` como
--    pendente, e o relatório do vendedor daquele dia nunca é enfileirado.
--    Com a hora do claim, o worker devolve à fila o que passou do prazo.
--
-- 2. `webhook_entrada` — o webhook respondia 200 e só depois gravava. Um erro
--    transitório do banco nesse intervalo perdia a mensagem, e a UAZAPI não
--    reentrega o que já recebeu 200. Agora o payload bruto é gravado antes da
--    resposta; o processamento apaga a linha quando termina, e o worker
--    reprocessa o que sobrou. A ingestão é idempotente (UNIQUE em
--    wa_message_id), então repetir não duplica nada.
-- =============================================================================

alter table public.fila_processamento
    add column if not exists iniciado_em timestamptz;

create index if not exists ix_fila_processando
    on public.fila_processamento (iniciado_em)
    where status = 'processando';

create table if not exists public.webhook_entrada (
    id           uuid primary key default gen_random_uuid(),
    conexao_id   uuid not null references public.conexoes_whatsapp(id) on delete cascade,
    payload      jsonb not null,
    recebido_em  timestamptz not null default now(),
    tentativas   smallint not null default 0,
    ultimo_erro  text
);

create index if not exists ix_webhook_entrada_recebido
    on public.webhook_entrada (recebido_em);

-- Conteúdo de mensagem em trânsito: só o service role toca. Sem política, a
-- RLS nega tudo a anon e authenticated; o revoke tira o privilégio que as
-- default privileges do Supabase concedem (ver 0003).
alter table public.webhook_entrada enable row level security;
revoke all on public.webhook_entrada from anon, authenticated;
