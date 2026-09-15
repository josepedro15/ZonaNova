-- =============================================================================
-- Teste de isolamento por RLS.
-- Prova o critério de pronto da Fase 3: um vendedor não enxerga dado de outra
-- unidade, e a hierarquia vendedor → gestor → supervisor entrega exatamente o
-- escopo prometido no doc 02.
--
-- Roda como superuser e usa SET ROLE authenticated + o GUC que simula o JWT.
-- =============================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', p_user::text, false);
end $$;

create or replace function pg_temp.ok(p_nome text, p_real bigint, p_esperado bigint)
returns text language sql as $$
    select case when p_real = p_esperado
        then 'PASSOU  ' || p_nome || '  (' || p_real || ')'
        else 'FALHOU  ' || p_nome || '  esperado ' || p_esperado || ', veio ' || p_real
    end;
$$;

set role authenticated;

-- ---------------------------------------------------------------------------
-- VENDEDOR (Rafael, unidade Centro)
-- ---------------------------------------------------------------------------
select pg_temp.como('44444444-4444-4444-4444-444444444444');
select pg_temp.ok('vendedor vê só as próprias conversas',
       (select count(*) from conversas), 1);
select pg_temp.ok('vendedor NÃO vê conversa de outra unidade',
       (select count(*) from conversas where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0);
select pg_temp.ok('vendedor NÃO vê mensagem de outra unidade',
       (select count(*) from mensagens), 1);
select pg_temp.ok('vendedor vê só o próprio relatório',
       (select count(*) from relatorios_diarios), 1);
select pg_temp.ok('vendedor NÃO vê o relatório da rede',
       (select count(*) from relatorios_rede), 0);
-- O vendedor lê o STATUS da própria conexão, mas a coluna do token está fora
-- do grant: mesmo um `select *` tem de falhar.
select pg_temp.ok('vendedor lê o status da própria conexão',
       (select count(*) from vw_conexoes_status), 1);
do $$
begin
    perform instance_token from public.conexoes_whatsapp where user_id = auth.uid();
    raise notice 'FALHOU  o token da instância FOI LIDO por um vendedor';
exception when insufficient_privilege then
    raise notice 'PASSOU  token da instância inalcançável (grant por coluna)';
end $$;
do $$
declare n integer;
begin
    select count(*) into n from public.conexoes_whatsapp where user_id <> auth.uid();
    if n > 0 then raise notice 'FALHOU  vendedor viu conexão de colega (%)', n;
    else raise notice 'PASSOU  vendedor não vê conexão de colega'; end if;
end $$;
select pg_temp.ok('vendedor vê a lista de unidades (precisa no cadastro)',
       (select count(*) from unidades), 2);
select pg_temp.ok('vendedor NÃO vê o profile de colega da mesma unidade',
       (select count(*) from profiles), 1);
select pg_temp.ok('vendedor vê o agregado da PRÓPRIA unidade (para comparar)',
       (select count(*) from relatorios_unidade), 1);
select pg_temp.ok('vendedor NÃO vê o agregado de outra unidade',
       (select count(*) from relatorios_unidade
        where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0);

-- ---------------------------------------------------------------------------
-- GESTOR (Carla, unidade Centro)
-- ---------------------------------------------------------------------------
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('gestor vê as conversas da unidade dele',
       (select count(*) from conversas), 2);
select pg_temp.ok('gestor NÃO vê conversa de outra unidade',
       (select count(*) from conversas where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0);
select pg_temp.ok('gestor vê os relatórios da unidade dele',
       (select count(*) from relatorios_diarios), 2);
select pg_temp.ok('gestor NÃO vê o relatório da rede',
       (select count(*) from relatorios_rede), 0);

-- ---------------------------------------------------------------------------
-- GESTOR DA OUTRA UNIDADE (Denis, Bento) — o espelho do teste acima
-- ---------------------------------------------------------------------------
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor de Bento vê só Bento',
       (select count(*) from conversas), 1);
select pg_temp.ok('gestor de Bento NÃO vê o Centro',
       (select count(*) from conversas where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0);

-- ---------------------------------------------------------------------------
-- SUPERVISOR (Paulo)
-- ---------------------------------------------------------------------------
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor vê a rede inteira',
       (select count(*) from conversas), 3);
select pg_temp.ok('supervisor vê todos os relatórios',
       (select count(*) from relatorios_diarios), 3);
select pg_temp.ok('supervisor vê o relatório da rede',
       (select count(*) from relatorios_rede), 1);

-- ---------------------------------------------------------------------------
-- PENDENTE (Vera) — aprovada ainda não foi: não vê dado nenhum
-- ---------------------------------------------------------------------------
select pg_temp.como('77777777-7777-7777-7777-777777777777');
select pg_temp.ok('pendente NÃO vê conversa nenhuma',
       (select count(*) from conversas), 0);
select pg_temp.ok('pendente NÃO vê relatório nenhum',
       (select count(*) from relatorios_diarios), 0);
select pg_temp.ok('pendente ainda vê as unidades (para corrigir a escolha)',
       (select count(*) from unidades), 2);

-- ---------------------------------------------------------------------------
-- SEM SESSÃO — ninguém logado não lê nada
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok('anônimo NÃO vê conversa',   (select count(*) from conversas), 0);
select pg_temp.ok('anônimo NÃO vê relatório',  (select count(*) from relatorios_diarios), 0);
select pg_temp.ok('anônimo NÃO vê profiles',   (select count(*) from profiles), 0);

-- ---------------------------------------------------------------------------
-- ESCALADA DE PRIVILÉGIO — as colunas que definem o que a pessoa enxerga
-- ---------------------------------------------------------------------------
select pg_temp.como('22222222-2222-2222-2222-222222222222');

do $$
begin
    update public.profiles set role = 'supervisor' where id = auth.uid();
    raise notice 'FALHOU  gestor CONSEGUIU se promover a supervisor';
exception when insufficient_privilege then
    raise notice 'PASSOU  gestor não consegue mudar o próprio papel';
end $$;

do $$
begin
    update public.profiles set unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'
    where id = auth.uid();
    raise notice 'FALHOU  gestor CONSEGUIU trocar a própria unidade';
exception when insufficient_privilege then
    raise notice 'PASSOU  gestor não consegue trocar a própria unidade';
end $$;

select pg_temp.como('77777777-7777-7777-7777-777777777777');
do $$
begin
    update public.profiles set status = 'ativo' where id = auth.uid();
    raise notice 'FALHOU  pendente CONSEGUIU aprovar a si mesmo';
exception when insufficient_privilege then
    raise notice 'PASSOU  pendente não consegue aprovar a si mesmo';
end $$;

select pg_temp.como('44444444-4444-4444-4444-444444444444');
do $$
begin
    update public.profiles set nome = 'Rafael M.' where id = auth.uid();
    raise notice 'PASSOU  vendedor edita o próprio nome';
exception when others then
    raise notice 'FALHOU  vendedor não consegue editar o próprio nome: %', sqlerrm;
end $$;

do $$
declare n integer;
begin
    update public.profiles set nome = 'invadido'
    where id = '55555555-5555-5555-5555-555555555555';
    get diagnostics n = row_count;
    if n > 0 then raise notice 'FALHOU  vendedor editou o profile de COLEGA';
    else raise notice 'PASSOU  vendedor não edita profile de colega'; end if;
end $$;

reset role;
