-- =============================================================================
-- ZonaNova — schema inicial
-- Hierarquia vendedor → gestor (unidade) → supervisor (rede)
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Unidades e pessoas
-- -----------------------------------------------------------------------------

create table if not exists public.unidades (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null,
    cidade      text,
    uf          char(2),
    ativa       boolean not null default true,
    created_at  timestamptz not null default now()
);

create unique index if not exists ux_unidades_nome on public.unidades (lower(nome));

create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    nome         text not null,
    email        text not null,
    telefone     text,
    role         text not null default 'vendedor'
                 check (role in ('vendedor', 'gestor', 'supervisor', 'admin')),
    unidade_id   uuid references public.unidades(id) on delete restrict,
    status       text not null default 'pendente'
                 check (status in ('pendente', 'ativo', 'inativo')),
    aprovado_por uuid references auth.users(id) on delete set null,
    aprovado_em  timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    -- vendedor e gestor precisam de unidade; supervisor/admin não têm
    constraint ck_profiles_unidade check (
        (role = 'vendedor' and unidade_id is not null)
        or role <> 'vendedor'
    )
);

create index if not exists ix_profiles_unidade on public.profiles (unidade_id);
create index if not exists ix_profiles_status  on public.profiles (status) where status = 'pendente';

-- Gestor pode cobrir mais de uma unidade.
create table if not exists public.gestor_unidades (
    gestor_id  uuid not null references public.profiles(id) on delete cascade,
    unidade_id uuid not null references public.unidades(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (gestor_id, unidade_id)
);

create index if not exists ix_gestor_unidades_unidade on public.gestor_unidades (unidade_id);

-- Cria o profile automaticamente no signup (metadata vem do formulário).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, nome, email, telefone, unidade_id)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
        new.email,
        new.raw_user_meta_data->>'telefone',
        nullif(new.raw_user_meta_data->>'unidade_id', '')::uuid
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Funções de escopo (base de toda a RLS)
--    SECURITY DEFINER para não recursar na própria política de profiles.
-- -----------------------------------------------------------------------------

create or replace function public.zn_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

create or replace function public.zn_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select status = 'ativo' from public.profiles where id = auth.uid()), false);
$$;

-- Unidades que o utilizador autenticado pode ler.
create or replace function public.zn_unidades_visiveis()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_role    text;
    v_unidade uuid;
begin
    select role, unidade_id into v_role, v_unidade
    from public.profiles where id = auth.uid();

    if v_role in ('supervisor', 'admin') then
        return query select id from public.unidades;
    elsif v_role = 'gestor' then
        return query select unidade_id from public.gestor_unidades where gestor_id = auth.uid();
    elsif v_role = 'vendedor' and v_unidade is not null then
        return next v_unidade;
    end if;
    return;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Conexão de WhatsApp (UAZAPI) — service role apenas
-- -----------------------------------------------------------------------------

create table if not exists public.conexoes_whatsapp (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null unique references public.profiles(id) on delete cascade,
    unidade_id       uuid not null references public.unidades(id) on delete restrict,
    instance_name    text,
    -- token cifrado na aplicação (AES-256-GCM, chave em ZN_ENCRYPTION_KEY)
    instance_token   bytea,
    numero           text,
    status           text not null default 'desconectada'
                     check (status in ('desconectada', 'aguardando_qr', 'conectada', 'caida')),
    ultimo_evento_em timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists ix_conexoes_unidade on public.conexoes_whatsapp (unidade_id);
create index if not exists ix_conexoes_status  on public.conexoes_whatsapp (status);

-- View sem o token, para a UI.
create or replace view public.vw_conexoes_status
with (security_invoker = true) as
select id, user_id, unidade_id, numero, status, ultimo_evento_em, updated_at
from public.conexoes_whatsapp;

-- -----------------------------------------------------------------------------
-- 4. Conversas e mensagens
-- -----------------------------------------------------------------------------

create table if not exists public.conversas (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references public.profiles(id) on delete cascade,
    unidade_id         uuid not null references public.unidades(id) on delete restrict,
    cliente_telefone   text not null,
    cliente_nome       text,
    ultima_mensagem_em timestamptz,
    total_mensagens    integer not null default 0,
    arquivada          boolean not null default false,
    created_at         timestamptz not null default now(),
    unique (user_id, cliente_telefone)
);

create index if not exists ix_conversas_user    on public.conversas (user_id, ultima_mensagem_em desc);
create index if not exists ix_conversas_unidade on public.conversas (unidade_id, ultima_mensagem_em desc);

create table if not exists public.mensagens (
    id            uuid primary key default gen_random_uuid(),
    conversa_id   uuid not null references public.conversas(id) on delete cascade,
    wa_message_id text not null unique,          -- idempotência do webhook
    direcao       text not null check (direcao in ('entrada', 'saida')),
    tipo          text not null default 'texto'
                  check (tipo in ('texto', 'audio', 'imagem', 'documento', 'video', 'outro')),
    conteudo      text,
    transcricao   text,                          -- áudio transcrito (assíncrono)
    midia_url     text,
    automatica    boolean not null default false, -- template/bot de triagem
    enviada_em    timestamptz not null,
    created_at    timestamptz not null default now()
);

create index if not exists ix_mensagens_conversa on public.mensagens (conversa_id, enviada_em);
create index if not exists ix_mensagens_pendente_transcricao
    on public.mensagens (id) where tipo = 'audio' and transcricao is null;

create table if not exists public.contatos_bloqueados (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles(id) on delete cascade,
    telefone   text not null,
    motivo     text,
    created_at timestamptz not null default now(),
    unique (user_id, telefone)
);

-- -----------------------------------------------------------------------------
-- 5. Análises e relatórios
-- -----------------------------------------------------------------------------

create table if not exists public.analises_conversa (
    id                 uuid primary key default gen_random_uuid(),
    conversa_id        uuid not null references public.conversas(id) on delete cascade,
    user_id            uuid not null references public.profiles(id) on delete cascade,
    unidade_id         uuid not null references public.unidades(id) on delete restrict,
    data_ref           date not null,
    tipo_conversa      text check (tipo_conversa in ('negociacao', 'suporte', 'social')),
    status             text,
    sentiment          smallint check (sentiment between 0 and 100),
    score_atendimento  smallint check (score_atendimento between 0 and 100),
    score_oportunidade smallint check (score_oportunidade between 0 and 100),
    score_risco        smallint check (score_risco between 0 and 100),
    estagio_funil      text,
    potencial_venda    text,
    urgencia           smallint check (urgencia between 1 and 5),
    payload            jsonb not null,          -- resumo, evidências, objeções, script...
    modelo             text,
    tokens_entrada     integer,
    tokens_saida       integer,
    custo_estimado     numeric(10, 6),
    created_at         timestamptz not null default now(),
    unique (conversa_id, data_ref)
);

create index if not exists ix_analises_user_data on public.analises_conversa (user_id, data_ref);
create index if not exists ix_analises_unid_data on public.analises_conversa (unidade_id, data_ref);

create table if not exists public.relatorios_diarios (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references public.profiles(id) on delete cascade,
    unidade_id             uuid not null references public.unidades(id) on delete restrict,
    data_ref               date not null,
    score_geral            numeric(5, 2),
    leads_atendidos        integer not null default 0,
    conversoes_confirmadas integer not null default 0,
    oportunidades_perdidas integer not null default 0,
    tempo_medio_resposta_s integer,
    taxa_resposta          numeric(5, 2),
    pontos_positivos       text[] not null default '{}',
    pontos_negativos       text[] not null default '{}',
    payload                jsonb not null default '{}'::jsonb,  -- coaching, insights
    created_at             timestamptz not null default now(),
    unique (user_id, data_ref)
);

create index if not exists ix_rel_diarios_unid_data on public.relatorios_diarios (unidade_id, data_ref);

create table if not exists public.relatorios_unidade (
    id                     uuid primary key default gen_random_uuid(),
    unidade_id             uuid not null references public.unidades(id) on delete cascade,
    data_ref               date not null,
    score_geral            numeric(5, 2),
    vendedores_ativos      integer not null default 0,
    leads_atendidos        integer not null default 0,
    conversoes_confirmadas integer not null default 0,
    oportunidades_perdidas integer not null default 0,
    tempo_medio_resposta_s integer,
    resumo_ia              text,
    payload                jsonb not null default '{}'::jsonb,
    created_at             timestamptz not null default now(),
    unique (unidade_id, data_ref)
);

create table if not exists public.relatorios_rede (
    id                     uuid primary key default gen_random_uuid(),
    data_ref               date not null unique,
    score_geral            numeric(5, 2),
    unidades_ativas        integer not null default 0,
    vendedores_ativos      integer not null default 0,
    leads_atendidos        integer not null default 0,
    conversoes_confirmadas integer not null default 0,
    resumo_ia              text,
    payload                jsonb not null default '{}'::jsonb,
    created_at             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. Operação
-- -----------------------------------------------------------------------------

create table if not exists public.fila_processamento (
    id            uuid primary key default gen_random_uuid(),
    tipo          text not null check (tipo in (
                      'analise_conversa', 'relatorio_vendedor',
                      'rollup_unidade', 'rollup_rede', 'transcricao')),
    referencia_id uuid not null,
    data_ref      date not null,
    status        text not null default 'pendente'
                  check (status in ('pendente', 'processando', 'concluido', 'falhou', 'ignorado')),
    tentativas    smallint not null default 0,
    ultimo_erro   text,
    created_at    timestamptz not null default now(),
    processado_em timestamptz,
    unique (tipo, referencia_id, data_ref)
);

create index if not exists ix_fila_pendente
    on public.fila_processamento (created_at) where status = 'pendente';

create table if not exists public.eventos_admin (
    id         uuid primary key default gen_random_uuid(),
    actor_id   uuid references public.profiles(id) on delete set null,
    acao       text not null,
    alvo_id    uuid,
    detalhes   jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists ix_eventos_admin_data on public.eventos_admin (created_at desc);

-- -----------------------------------------------------------------------------
-- 7. RLS
--    Regra geral: leitura por escopo de unidade; escrita de dado operacional
--    só pelo service role (que ignora RLS).
-- -----------------------------------------------------------------------------

alter table public.unidades            enable row level security;
alter table public.profiles            enable row level security;
alter table public.gestor_unidades     enable row level security;
alter table public.conexoes_whatsapp   enable row level security;
alter table public.conversas           enable row level security;
alter table public.mensagens           enable row level security;
alter table public.contatos_bloqueados enable row level security;
alter table public.analises_conversa   enable row level security;
alter table public.relatorios_diarios  enable row level security;
alter table public.relatorios_unidade  enable row level security;
alter table public.relatorios_rede     enable row level security;
alter table public.fila_processamento  enable row level security;
alter table public.eventos_admin       enable row level security;

-- Unidades: lista visível a qualquer autenticado (a tela de cadastro precisa).
drop policy if exists p_unidades_select on public.unidades;
create policy p_unidades_select on public.unidades
    for select to authenticated using (true);

drop policy if exists p_unidades_write on public.unidades;
create policy p_unidades_write on public.unidades
    for all to authenticated
    using (public.zn_role() in ('supervisor', 'admin'))
    with check (public.zn_role() in ('supervisor', 'admin'));

-- Profiles: o próprio, ou quem está numa unidade visível.
drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles
    for select to authenticated
    using (
        id = auth.uid()
        or unidade_id in (select public.zn_unidades_visiveis())
        or public.zn_role() in ('supervisor', 'admin')
    );

drop policy if exists p_profiles_update_self on public.profiles;
create policy p_profiles_update_self on public.profiles
    for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Aprovação / mudança de papel passa por server action com service role,
-- que grava em eventos_admin. Não há política de UPDATE para gestor aqui
-- de propósito: senão um gestor poderia se promover a supervisor.

drop policy if exists p_gestor_unidades_select on public.gestor_unidades;
create policy p_gestor_unidades_select on public.gestor_unidades
    for select to authenticated
    using (gestor_id = auth.uid() or public.zn_role() in ('supervisor', 'admin'));

-- Conexões: sem política de SELECT na tabela (token). A UI usa a view.
drop policy if exists p_conexoes_select on public.conexoes_whatsapp;
create policy p_conexoes_select on public.conexoes_whatsapp
    for select to authenticated
    using (false);

-- Conversas / mensagens / análises: leitura por escopo.
drop policy if exists p_conversas_select on public.conversas;
create policy p_conversas_select on public.conversas
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

drop policy if exists p_mensagens_select on public.mensagens;
create policy p_mensagens_select on public.mensagens
    for select to authenticated
    using (exists (
        select 1 from public.conversas c
        where c.id = mensagens.conversa_id
          and public.zn_ativo()
          and (c.user_id = auth.uid() or c.unidade_id in (select public.zn_unidades_visiveis()))
    ));

drop policy if exists p_bloqueados_all on public.contatos_bloqueados;
create policy p_bloqueados_all on public.contatos_bloqueados
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists p_analises_select on public.analises_conversa;
create policy p_analises_select on public.analises_conversa
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

drop policy if exists p_rel_diarios_select on public.relatorios_diarios;
create policy p_rel_diarios_select on public.relatorios_diarios
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

drop policy if exists p_rel_unidade_select on public.relatorios_unidade;
create policy p_rel_unidade_select on public.relatorios_unidade
    for select to authenticated
    using (public.zn_ativo() and unidade_id in (select public.zn_unidades_visiveis()));

-- Relatório da rede: só supervisor e admin.
drop policy if exists p_rel_rede_select on public.relatorios_rede;
create policy p_rel_rede_select on public.relatorios_rede
    for select to authenticated
    using (public.zn_role() in ('supervisor', 'admin'));

-- Fila e log: só admin lê pela UI; o worker usa service role.
drop policy if exists p_fila_select on public.fila_processamento;
create policy p_fila_select on public.fila_processamento
    for select to authenticated using (public.zn_role() = 'admin');

drop policy if exists p_eventos_select on public.eventos_admin;
create policy p_eventos_select on public.eventos_admin
    for select to authenticated
    using (public.zn_role() in ('supervisor', 'admin'));
