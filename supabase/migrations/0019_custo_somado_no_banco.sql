-- =============================================================================
-- ZonaNova — custo acumulado somado no banco (terceira revisão, 22/09/2026)
--
-- O /admin somava o custo baixando as análises de mil em mil a cada
-- carregamento — centenas de idas ao banco quando o histórico crescer. Um
-- `sum` resolve numa só.
--
-- SECURITY INVOKER de propósito: a soma passa pela mesma RLS de
-- analises_conversa. Quem chama pela sessão soma só o que já podia ler; o
-- admin, que lê tudo, soma tudo.
-- =============================================================================

create or replace function public.zn_custo_total()
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(sum(custo_estimado), 0) from public.analises_conversa;
$$;

revoke all on function public.zn_custo_total() from public, anon;
grant execute on function public.zn_custo_total() to authenticated, service_role;
