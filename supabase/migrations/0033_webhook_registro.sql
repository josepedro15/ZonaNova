-- =============================================================================
-- ZonaNova — rastro do que o webhook recebe (15/10/2026)
--
-- O PDF do Rafael ao Xexéu (08/10) não apareceu, e não havia como provar se o
-- webhook o recebeu e descartou ou se ele nunca chegou: `webhook_entrada` é
-- apagada depois de processada, e descarte (grupo, sem telefone), contato fora
-- da análise e vendedor inativo saíam sem deixar nada.
--
-- Cada mensagem que passa pela ingestão vira uma linha aqui com o destino dela
-- (lib/uazapi/registro.ts). Sem o conteúdo: texto, mídia e transcrição só
-- vivem em `mensagens`. O chat é o JID que a conversa já guarda.
--
-- Fica 30 dias: é para conferir caso reportado, não histórico.
-- =============================================================================

create table if not exists public.webhook_registro (
    id            bigint generated always as identity primary key,
    conexao_id    uuid not null references public.conexoes_whatsapp(id) on delete cascade,
    recebido_em   timestamptz not null default now(),
    evento        text,
    wa_message_id text,
    tipo_bruto    text,
    from_me       boolean not null default false,
    chat          text,
    enviada_em    timestamptz not null,
    destino       text not null check (destino in ('gravada', 'descartada', 'fora_da_analise', 'dono_inativo', 'erro')),
    motivo        text
);

create index if not exists ix_webhook_registro_conexao_enviada on public.webhook_registro (conexao_id, enviada_em);
create index if not exists ix_webhook_registro_mensagem on public.webhook_registro (wa_message_id);
create index if not exists ix_webhook_registro_recebido on public.webhook_registro (recebido_em);

-- Só o service role toca, como a webhook_entrada (0014).
alter table public.webhook_registro enable row level security;
revoke all on public.webhook_registro from anon, authenticated;

select cron.schedule('zn-expurgo-webhook-registro', '15 6 * * *',
    $$ delete from public.webhook_registro where recebido_em < now() - interval '30 days' $$);
