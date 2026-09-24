-- =============================================================================
-- MEC estruturado (spec docs/superpowers/specs/2026-09-24-mec-estruturado-design.md §5).
-- Uma linha por sinal observado numa negociação: as 7 informações da sondagem,
-- perguntas abertas/fechadas, frases proibidas, objeção pelo catálogo, preço e
-- fechamento. Fonte das agregações do MEC.
-- =============================================================================

create table if not exists public.mec_observacoes (
    id           uuid primary key default gen_random_uuid(),
    conversa_id  uuid not null references public.conversas(id) on delete cascade,
    user_id      uuid not null references public.profiles(id) on delete cascade,
    unidade_id   uuid not null references public.unidades(id) on delete restrict,
    data_ref     date not null,
    playbook_id  uuid not null references public.playbooks(id) on delete restrict,
    etapa        text not null,
    sinal        text not null check (sinal in (
                     'sondagem_item', 'pergunta_aberta', 'pergunta_fechada', 'complementar', 'prazo', 'condicao',
                     'frase_proibida', 'objecao', 'desconto', 'gerencia', 'orcamento_concorrente',
                     'fechamento', 'final_positivo')),
    item_chave   text,
    valor        boolean,
    detalhe      jsonb not null default '{}'::jsonb,
    trecho       text,
    created_at   timestamptz not null default now()
);

create index if not exists ix_mec_obs_conversa on public.mec_observacoes (conversa_id, data_ref);
create index if not exists ix_mec_obs_user     on public.mec_observacoes (user_id, data_ref);
create index if not exists ix_mec_obs_unidade  on public.mec_observacoes (unidade_id, data_ref);
create index if not exists ix_mec_obs_sinal    on public.mec_observacoes (sinal, item_chave, data_ref);

-- Mesmo escopo de aderencia_conversa: o próprio vendedor e quem vê a unidade.
alter table public.mec_observacoes enable row level security;
drop policy if exists p_mec_observacoes_select on public.mec_observacoes;
create policy p_mec_observacoes_select on public.mec_observacoes
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

-- Tabela nova nasce com ALL para anon/authenticated no Supabase (ver 0003):
-- só leitura, e só pela RLS. Quem escreve é o worker (service role).
revoke all on public.mec_observacoes from anon, authenticated;
grant select on public.mec_observacoes to authenticated;

-- Média de informações capturadas por conversa: 3,4 não cabe em smallint.
alter table public.aderencia_diaria alter column sondagem_itens type numeric(3,1);
alter table public.aderencia_diaria add column if not exists detalhe jsonb not null default '{}'::jsonb;
