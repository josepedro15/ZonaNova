-- =============================================================================
-- ZonaNova — Conversar com a IA só para quem está liberado (23/11/2026)
--
-- Pedido do José Pedro: por enquanto só ele e o Silas usam o chat e criam ou
-- param monitoramento. A lista mora no banco, não no código: liberar alguém
-- é um insert em `ia_acesso`, sem deploy. O card do monitoramento continua
-- visível para a equipe (é o resultado), pela RLS da 0036.
-- =============================================================================

create table if not exists public.ia_acesso (
    user_id    uuid primary key references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now()
);

-- Só o service role mexe na lista.
alter table public.ia_acesso enable row level security;
revoke all on public.ia_acesso from anon, authenticated;

-- Quem chama está liberado (e ativo)?
create or replace function public.zn_ia_liberado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.zn_ativo() and exists (select 1 from public.ia_acesso where user_id = auth.uid());
$$;

revoke all on function public.zn_ia_liberado() from public, anon;
grant execute on function public.zn_ia_liberado() to authenticated;

-- Criar e parar monitoramento: só liberado, além do papel e do escopo da 0036.
drop policy if exists p_monitoramentos_insert on public.monitoramentos;
create policy p_monitoramentos_insert on public.monitoramentos
    for insert to authenticated
    with check (
        criado_por = auth.uid()
        and encerrado_em is null
        and conferido_ate is null
        and public.zn_ia_liberado()
        and (
            public.zn_role() in ('supervisor', 'admin')
            or (public.zn_role() = 'gestor' and unidade_id is not null and unidade_id in (select public.zn_unidades_visiveis()))
        )
    );

drop policy if exists p_monitoramentos_update on public.monitoramentos;
create policy p_monitoramentos_update on public.monitoramentos
    for update to authenticated
    using (public.zn_ia_liberado() and (criado_por = auth.uid() or public.zn_role() in ('supervisor', 'admin')))
    with check (public.zn_ia_liberado() and (criado_por = auth.uid() or public.zn_role() in ('supervisor', 'admin')));

-- Os liberados de hoje (José Pedro, admin, e Silas, supervisor) entram por
-- insert à parte, com os ids de produção: a migration não carrega dado de gente.
