-- =============================================================================
-- ZonaNova — admin enxerga todo mundo; pendência do vendedor numa consulta só
-- (terceira revisão, 22/09/2026)
--
-- 1. `p_profiles_select` só devolvia o próprio perfil ou quem tem unidade
--    visível. Supervisor e admin não têm unidade, então o admin não via
--    nenhum dos dois em /admin/unidades — e não conseguia desativar um
--    supervisor que saiu da rede. Admin passa a ler todos os perfis.
--
-- 2. `zn_vendedor_tem_analise_aberta`: o worker perguntava "este vendedor
--    ainda tem análise do dia na fila?" listando TODAS as análises abertas da
--    rede e cruzando com conversas em lotes de 100 ids, a cada análise
--    concluída. Um join resolve em uma ida ao banco, sem paginação que pule
--    linha enquanto a fila muda. Só o service role executa.
-- =============================================================================

drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles
    for select to authenticated
    using (
        id = auth.uid()
        or unidade_id in (select public.zn_unidades_visiveis())
        or public.zn_role() = 'admin'
    );

create or replace function public.zn_vendedor_tem_analise_aberta(p_user uuid, p_data date)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
    select exists (
        select 1
        from public.fila_processamento f
        join public.conversas c on c.id = f.referencia_id
        where f.tipo = 'analise_conversa'
          and f.data_ref = p_data
          and f.status in ('pendente', 'processando')
          and c.user_id = p_user
    );
$$;

revoke all on function public.zn_vendedor_tem_analise_aberta(uuid, date) from public, anon, authenticated;
grant execute on function public.zn_vendedor_tem_analise_aberta(uuid, date) to service_role;
