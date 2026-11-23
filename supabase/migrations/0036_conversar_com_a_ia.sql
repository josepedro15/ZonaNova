-- =============================================================================
-- ZonaNova — Conversar com a IA, fase 1: monitoramentos (23/11/2026)
--
-- O Silas (ou o gestor, para a unidade dele) pede no chat "monitora se estão
-- mandando as ações de Natal" e a IA cria um monitoramento: o que conta, as
-- palavras que acham a mensagem, o período. O cron /api/cron/monitoramentos lê
-- as mensagens que os vendedores mandaram no período, separa as que têm as
-- palavras e pergunta à IA se cada uma conta. O resultado fica em
-- `monitoramento_marcas`, e o card do painel soma por vendedor.
--
-- Não passa pela análise da conversa: ela só roda no dia em que o cliente
-- responde, e a ação de campanha quase sempre fica sem resposta.
-- =============================================================================

create table if not exists public.monitoramentos (
    id            uuid primary key default gen_random_uuid(),
    titulo        text not null check (char_length(titulo) between 3 and 80),
    criterio      text not null check (char_length(criterio) between 10 and 800),
    -- Acham as mensagens candidatas, sem acento nem caixa (lib/monitoramento.ts).
    palavras      text[] not null check (cardinality(palavras) between 1 and 25),
    -- Sem unidade = a rede toda (só supervisor e admin criam assim).
    unidade_id    uuid references public.unidades(id) on delete cascade,
    inicio        date not null,
    fim           date not null,
    criado_por    uuid not null references public.profiles(id) on delete restrict,
    created_at    timestamptz not null default now(),
    encerrado_em  timestamptz,
    -- Até onde o cron já leu as mensagens.
    conferido_ate timestamptz,
    check (fim >= inicio and fim - inicio <= 92)
);

create index if not exists ix_monitoramentos_abertos on public.monitoramentos (fim) where encerrado_em is null;

create table if not exists public.monitoramento_marcas (
    id               bigint generated always as identity primary key,
    monitoramento_id uuid not null references public.monitoramentos(id) on delete cascade,
    -- O expurgo mensal apaga mensagens antigas; a marca fica, com o trecho.
    mensagem_id      uuid references public.mensagens(id) on delete set null,
    conversa_id      uuid not null references public.conversas(id) on delete cascade,
    user_id          uuid not null references public.profiles(id) on delete cascade,
    unidade_id       uuid not null references public.unidades(id) on delete cascade,
    enviada_em       timestamptz not null,
    -- false também fica: a mensagem já foi julgada e não volta para a IA.
    conta            boolean not null,
    trecho           text not null,
    created_at       timestamptz not null default now(),
    unique (monitoramento_id, mensagem_id)
);

create index if not exists ix_marcas_conversa on public.monitoramento_marcas (monitoramento_id, conversa_id) where conta;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.monitoramentos enable row level security;
alter table public.monitoramento_marcas enable row level security;

-- Vê o monitoramento quem vê a unidade dele; o da rede, todo mundo ativo
-- (o vendedor vê o card com os próprios clientes).
drop policy if exists p_monitoramentos_select on public.monitoramentos;
create policy p_monitoramentos_select on public.monitoramentos
    for select to authenticated
    using (
        public.zn_ativo()
        and (
            unidade_id is null
            or unidade_id in (select public.zn_unidades_visiveis())
            or unidade_id = public.zn_minha_unidade()
        )
    );

-- Supervisor e admin criam para a rede ou para qualquer unidade; o gestor só
-- para a unidade dele. Vendedor não cria.
drop policy if exists p_monitoramentos_insert on public.monitoramentos;
create policy p_monitoramentos_insert on public.monitoramentos
    for insert to authenticated
    with check (
        criado_por = auth.uid()
        and encerrado_em is null
        and conferido_ate is null
        and (
            public.zn_role() in ('supervisor', 'admin')
            or (public.zn_role() = 'gestor' and unidade_id is not null and unidade_id in (select public.zn_unidades_visiveis()))
        )
    );

-- Encerrar: quem criou, ou supervisor e admin. Só a coluna encerrado_em.
drop policy if exists p_monitoramentos_update on public.monitoramentos;
create policy p_monitoramentos_update on public.monitoramentos
    for update to authenticated
    using (public.zn_ativo() and (criado_por = auth.uid() or public.zn_role() in ('supervisor', 'admin')))
    with check (public.zn_ativo() and (criado_por = auth.uid() or public.zn_role() in ('supervisor', 'admin')));

-- A marca segue a conversa: o vendedor vê as dele, o gestor as da unidade.
drop policy if exists p_marcas_select on public.monitoramento_marcas;
create policy p_marcas_select on public.monitoramento_marcas
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

revoke all on public.monitoramentos, public.monitoramento_marcas from anon, authenticated;
grant select, insert on public.monitoramentos to authenticated;
grant update (encerrado_em) on public.monitoramentos to authenticated;
grant select on public.monitoramento_marcas to authenticated;

-- -----------------------------------------------------------------------------
-- A base do card: negociações em aberto pela última análise de cada conversa,
-- desde a data pedida. SECURITY INVOKER: a RLS de quem chama decide o que
-- entra, igual a uma consulta direta da tela.
-- -----------------------------------------------------------------------------
create or replace function public.zn_negociacoes_abertas(p_desde date, p_unidade uuid default null)
returns table (
    conversa_id        uuid,
    user_id            uuid,
    unidade_id         uuid,
    cliente_nome       text,
    cliente_telefone   text,
    ultima_mensagem_em timestamptz,
    data_ref           date,
    status             text,
    potencial_venda    text
)
language sql
stable
security invoker
set search_path = public
as $$
    select u.conversa_id, u.user_id, u.unidade_id, u.cliente_nome, u.cliente_telefone,
           u.ultima_mensagem_em, u.data_ref, u.status, u.potencial_venda
    from (
        select distinct on (a.conversa_id)
               a.conversa_id, c.user_id, c.unidade_id, c.cliente_nome, c.cliente_telefone,
               c.ultima_mensagem_em, a.data_ref, a.tipo_conversa, a.status, a.potencial_venda
        from public.analises_conversa a
        join public.conversas c on c.id = a.conversa_id
        where a.data_ref >= p_desde
          and c.bloqueada = false
          and c.dispensada_em is null
          and (p_unidade is null or c.unidade_id = p_unidade)
        order by a.conversa_id, a.data_ref desc
    ) u
    where u.tipo_conversa = 'negociacao'
      and u.status in ('em_andamento', 'lead_frio', 'sem_resposta');
$$;

revoke all on function public.zn_negociacoes_abertas(date, uuid) from public, anon;
grant execute on function public.zn_negociacoes_abertas(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Custo: o chat e a conferência do monitoramento entram na conta da 0034.
-- -----------------------------------------------------------------------------
alter table public.custos_ia drop constraint if exists custos_ia_etapa_check;
alter table public.custos_ia add constraint custos_ia_etapa_check
    check (etapa in ('analise', 'relatorio', 'transcricao', 'midia', 'descobertas', 'conversa_ia', 'monitoramento'));

-- -----------------------------------------------------------------------------
-- Agendamento: a cada 15 minutos (doc 4 §4.4).
-- -----------------------------------------------------------------------------
select cron.unschedule('zn-monitoramentos') where exists (select 1 from cron.job where jobname = 'zn-monitoramentos');
select cron.schedule('zn-monitoramentos', '*/15 * * * *', $$ select public.disparar_rota_cron('/api/cron/monitoramentos') $$);
