-- =============================================================================
-- ZonaNova — módulo MEC: aderência ao padrão e descoberta de práticas
-- Depende de 0001_init.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O playbook, versionado
--    A doutrina mora no banco: o prompt da análise é montado a partir daqui.
-- -----------------------------------------------------------------------------

create table if not exists public.playbooks (
    id          uuid primary key default gen_random_uuid(),
    versao      text not null unique,          -- 'book1-v1', 'book1-v2'
    nome        text not null,                 -- 'MEC Book 1 — Do atendimento ao fechamento'
    vigente_de  date not null,
    vigente_ate date,                          -- null = versão corrente
    notas       text,
    created_at  timestamptz not null default now()
);

-- Só uma versão corrente por vez.
create unique index if not exists ux_playbooks_corrente
    on public.playbooks ((vigente_ate is null)) where vigente_ate is null;

create table if not exists public.playbook_etapas (
    id          uuid primary key default gen_random_uuid(),
    playbook_id uuid not null references public.playbooks(id) on delete cascade,
    chave       text not null
                check (chave in ('acolhida', 'sondagem', 'solucao_completa',
                                 'contorno_objecoes', 'estrategia_preco',
                                 'fechamento', 'acompanhamento')),
    ordem       smallint not null,
    nome        text not null,
    descricao   text not null,                 -- vai para o prompt
    criterios   jsonb not null default '[]'::jsonb,
    peso        numeric(4, 2) not null default 1.0,
    unique (playbook_id, chave)
);

-- Itens verificáveis dentro de uma etapa: as 7 informações da sondagem,
-- as 8 objeções, as frases proibidas, as técnicas de fechamento.
create table if not exists public.playbook_itens (
    id        uuid primary key default gen_random_uuid(),
    etapa_id  uuid not null references public.playbook_etapas(id) on delete cascade,
    chave     text not null,                   -- 'sondagem_a', 'objecao_preco_alto', ...
    tipo      text not null
              check (tipo in ('informacao', 'objecao', 'frase_proibida',
                              'tecnica', 'regra')),
    rotulo    text not null,
    detalhe   text,
    ordem     smallint not null default 0,
    unique (etapa_id, chave)
);

-- -----------------------------------------------------------------------------
-- 2. Aderência medida
-- -----------------------------------------------------------------------------

create table if not exists public.aderencia_conversa (
    id             uuid primary key default gen_random_uuid(),
    conversa_id    uuid not null references public.conversas(id) on delete cascade,
    user_id        uuid not null references public.profiles(id) on delete cascade,
    unidade_id     uuid not null references public.unidades(id) on delete restrict,
    data_ref       date not null,
    playbook_id    uuid not null references public.playbooks(id) on delete restrict,
    etapa          text not null,
    -- A regra que torna a medição honesta: aderência = aplicadas / APLICÁVEIS.
    aplicavel      boolean not null,
    aplicado       text check (aplicado in ('sim', 'parcial', 'nao', 'nao_verificavel')),
    justificativa  text,                        -- obrigatória quando aplicavel = false
    evidencias     jsonb not null default '[]'::jsonb,
    itens          jsonb not null default '{}'::jsonb,  -- quais dos 7, qual das 8, qual minhoca
    created_at     timestamptz not null default now(),
    unique (conversa_id, data_ref, etapa)
);

create index if not exists ix_aderencia_user  on public.aderencia_conversa (user_id, data_ref);
create index if not exists ix_aderencia_unid  on public.aderencia_conversa (unidade_id, data_ref);
create index if not exists ix_aderencia_etapa on public.aderencia_conversa (etapa, data_ref)
    where aplicavel;

-- O gestor discorda de uma marcação. Vira dado de calibração, não discussão perdida.
create table if not exists public.aderencia_contestacoes (
    id            uuid primary key default gen_random_uuid(),
    aderencia_id  uuid not null references public.aderencia_conversa(id) on delete cascade,
    contestado_por uuid not null references public.profiles(id) on delete cascade,
    motivo        text not null,
    veredito      text check (veredito in ('procedente', 'improcedente', 'pendente'))
                  default 'pendente',
    revisado_por  uuid references public.profiles(id) on delete set null,
    revisado_em   timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists ix_contestacoes_pendentes
    on public.aderencia_contestacoes (created_at) where veredito = 'pendente';

-- -----------------------------------------------------------------------------
-- 3. Descobertas — o que funciona e o MEC ainda não diz
-- -----------------------------------------------------------------------------

create table if not exists public.descobertas (
    id                uuid primary key default gen_random_uuid(),
    tipo              text not null
                      check (tipo in ('fora_do_script_deu_certo',
                                      'no_script_deu_errado',
                                      'objecao_fora_do_catalogo',
                                      'minhoca_inventada',
                                      'correlacao_etapa')),
    periodo_de        date not null,
    periodo_ate       date not null,
    unidade_id        uuid references public.unidades(id) on delete set null, -- null = rede
    playbook_id       uuid not null references public.playbooks(id) on delete restrict,
    hipotese          text not null,
    conversas_suporte integer not null default 0,
    conversao_com     numeric(5, 2),
    conversao_sem     numeric(5, 2),
    evidencias        jsonb not null default '[]'::jsonb,   -- 3 a 5 trechos reais
    status            text not null default 'nova'
                      check (status in ('nova', 'em_analise', 'aprovada', 'descartada')),
    avaliada_por      uuid references public.profiles(id) on delete set null,
    avaliada_em       timestamptz,
    nota_avaliacao    text,
    virou_versao      text references public.playbooks(versao) on delete set null,
    created_at        timestamptz not null default now()
);

create index if not exists ix_descobertas_status on public.descobertas (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Rollups de aderência
-- -----------------------------------------------------------------------------

create table if not exists public.aderencia_diaria (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references public.profiles(id) on delete cascade,
    unidade_id        uuid not null references public.unidades(id) on delete restrict,
    data_ref          date not null,
    playbook_id       uuid not null references public.playbooks(id) on delete restrict,
    aderencia_geral   numeric(5, 2),            -- aplicadas / aplicáveis, em %
    por_etapa         jsonb not null default '{}'::jsonb,
    sondagem_itens    smallint,                 -- média de quantas das 7 capturou
    frases_proibidas  smallint not null default 0,
    created_at        timestamptz not null default now(),
    unique (user_id, data_ref)
);

create index if not exists ix_aderencia_diaria_unid
    on public.aderencia_diaria (unidade_id, data_ref);

-- -----------------------------------------------------------------------------
-- 5. RLS — mesmo contrato do 0001: leitura por escopo, escrita pelo service role
-- -----------------------------------------------------------------------------

alter table public.playbooks              enable row level security;
alter table public.playbook_etapas        enable row level security;
alter table public.playbook_itens         enable row level security;
alter table public.aderencia_conversa     enable row level security;
alter table public.aderencia_contestacoes enable row level security;
alter table public.descobertas            enable row level security;
alter table public.aderencia_diaria       enable row level security;

-- O playbook é público para todo mundo logado: é o padrão que a empresa
-- determinou, e o vendedor precisa poder ler contra o que está sendo medido.
drop policy if exists p_playbooks_select on public.playbooks;
create policy p_playbooks_select on public.playbooks
    for select to authenticated using (true);

drop policy if exists p_playbook_etapas_select on public.playbook_etapas;
create policy p_playbook_etapas_select on public.playbook_etapas
    for select to authenticated using (true);

drop policy if exists p_playbook_itens_select on public.playbook_itens;
create policy p_playbook_itens_select on public.playbook_itens
    for select to authenticated using (true);

drop policy if exists p_aderencia_select on public.aderencia_conversa;
create policy p_aderencia_select on public.aderencia_conversa
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

drop policy if exists p_aderencia_diaria_select on public.aderencia_diaria;
create policy p_aderencia_diaria_select on public.aderencia_diaria
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

-- Contestar é ato de gestor/supervisor sobre gente do escopo dele.
drop policy if exists p_contestacoes_select on public.aderencia_contestacoes;
create policy p_contestacoes_select on public.aderencia_contestacoes
    for select to authenticated
    using (
        contestado_por = auth.uid()
        or public.zn_role() in ('gestor', 'supervisor', 'admin')
    );

drop policy if exists p_contestacoes_insert on public.aderencia_contestacoes;
create policy p_contestacoes_insert on public.aderencia_contestacoes
    for insert to authenticated
    with check (
        contestado_por = auth.uid()
        and public.zn_role() in ('gestor', 'supervisor', 'admin')
        and exists (
            select 1 from public.aderencia_conversa a
            where a.id = aderencia_id
              and a.unidade_id in (select public.zn_unidades_visiveis())
        )
    );

-- Descobertas alimentam a próxima versão do Book: só supervisor e admin.
drop policy if exists p_descobertas_select on public.descobertas;
create policy p_descobertas_select on public.descobertas
    for select to authenticated
    using (public.zn_role() in ('supervisor', 'admin'));

-- -----------------------------------------------------------------------------
-- 6. Privilégios (ver nota no 0001)
-- -----------------------------------------------------------------------------

grant select on
    public.playbooks,
    public.playbook_etapas,
    public.playbook_itens,
    public.aderencia_conversa,
    public.aderencia_diaria,
    public.aderencia_contestacoes,
    public.descobertas
to authenticated;

-- Gestor e supervisor registam contestação (a política confere papel e escopo).
grant insert on public.aderencia_contestacoes to authenticated;
