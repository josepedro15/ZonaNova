-- =============================================================================
-- ZonaNova — campos operacionais que completam análise, gestão e privacidade
-- =============================================================================

alter table public.analises_conversa
    add column if not exists transcript_hash text,
    add column if not exists updated_at timestamptz not null default now();

create index if not exists ix_analises_hash
    on public.analises_conversa (conversa_id, data_ref, transcript_hash);

alter table public.relatorios_diarios
    add column if not exists updated_at timestamptz not null default now();

alter table public.relatorios_unidade
    add column if not exists conversoes_confirmadas integer not null default 0,
    add column if not exists oportunidades_perdidas integer not null default 0,
    add column if not exists taxa_resposta numeric(5, 2),
    add column if not exists updated_at timestamptz not null default now();

alter table public.relatorios_rede
    add column if not exists conversoes_confirmadas integer not null default 0,
    add column if not exists oportunidades_perdidas integer not null default 0,
    add column if not exists tempo_medio_resposta_s integer,
    add column if not exists taxa_resposta numeric(5, 2),
    add column if not exists updated_at timestamptz not null default now();

create table if not exists public.observacoes_gestor (
    id          uuid primary key default gen_random_uuid(),
    vendedor_id uuid not null references public.profiles(id) on delete cascade,
    gestor_id   uuid not null references public.profiles(id) on delete cascade,
    unidade_id  uuid not null references public.unidades(id) on delete restrict,
    texto       text not null check (char_length(texto) between 1 and 2000),
    created_at  timestamptz not null default now()
);

create index if not exists ix_observacoes_vendedor
    on public.observacoes_gestor (vendedor_id, created_at desc);

create table if not exists public.aceites_privacidade (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles(id) on delete cascade,
    versao      text not null,
    aceito_em   timestamptz not null default now(),
    ip_hash     text,
    unique (user_id, versao)
);

alter table public.observacoes_gestor enable row level security;
alter table public.aceites_privacidade enable row level security;

drop policy if exists p_observacoes_select on public.observacoes_gestor;
create policy p_observacoes_select on public.observacoes_gestor
    for select to authenticated
    using (
        vendedor_id = auth.uid()
        or unidade_id in (select public.zn_unidades_visiveis())
    );

drop policy if exists p_aceites_self on public.aceites_privacidade;
create policy p_aceites_self on public.aceites_privacidade
    for select to authenticated using (user_id = auth.uid());

revoke all on public.observacoes_gestor, public.aceites_privacidade from anon, authenticated;
grant select on public.observacoes_gestor to authenticated;
grant select on public.aceites_privacidade to authenticated;

-- Aceites são inseridos por server action com service role, para registrar a
-- versão e metadados de forma uniforme.
