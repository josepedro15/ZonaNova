-- =============================================================================
-- ZonaNova — o `revoke ... from anon, authenticated` das funções era no-op
--
-- A 0003 e a 0005 escreveram `revoke all on function … from anon,
-- authenticated`. Não fez nada. No Postgres, função criada já nasce com
-- EXECUTE para **PUBLIC**, e PUBLIC não é anon nem authenticated — é todo
-- mundo, incluindo os dois. Revogar dos papéis nominais deixa o privilégio
-- herdado intacto.
--
-- Medido no projeto real depois da 0005: as 8 funções de `public` com
-- `proacl` começando em `=X/postgres` — essa entrada vazia à esquerda do `=`
-- é o PUBLIC. `has_function_privilege('anon', …, 'execute')` dava true nas 8.
--
-- É o mesmo erro da 0003 com as tabelas, noutra roupa: **GRANT só soma, e
-- revogar do papel errado não tira.** Ficou por escrito no doc 8 §8.3.
--
-- Explorável hoje? Não. As quatro funções de trigger o Postgres recusa chamar
-- direto, e as `zn_*` são todas ancoradas em `auth.uid()`, que é nulo para o
-- anónimo — devolvem nulo ou conjunto vazio. Corrige-se na mesma: código que
-- diz revogar e não revoga é pior que código que não tenta, porque a próxima
-- pessoa confia nele.
-- =============================================================================

do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as assinatura
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
    loop
        execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    end loop;
end $$;

-- As políticas de RLS chamam estas quatro, e a chamada corre como o utilizador
-- da consulta — sem EXECUTE, toda política que as usa passa a rebentar.
grant execute on function public.zn_role()              to authenticated;
grant execute on function public.zn_ativo()             to authenticated;
grant execute on function public.zn_unidades_visiveis() to authenticated;
grant execute on function public.zn_minha_unidade()     to authenticated;

-- As de trigger não precisam de grant nenhum: o EXECUTE é conferido quando o
-- trigger é CRIADO, não quando dispara.
