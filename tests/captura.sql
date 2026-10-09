-- =============================================================================
-- Buracos de captura (0030): a última mensagem da conexão, a tabela de
-- buracos e o que o gestor enxerga. Roda sobre o seed, dentro de uma
-- transação desfeita no fim (scripts/db-local.sh test).
-- =============================================================================

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

begin;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
    perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

create or replace function pg_temp.ok(p_nome text, p_ok boolean)
returns text language sql as $$
    select case when p_ok then 'PASSOU  ' || p_nome else 'FALHOU  ' || p_nome end;
$$;

-- Rafael (Centro): conversa cccc…01, conexão do seed. A Letícia, colega dele,
-- serve de controle: o tests/rls.sql pode já ter gravado mensagens dela.
create temp table controle as
select ultima_mensagem_em from public.conexoes_whatsapp where user_id = '55555555-5555-5555-5555-555555555555';
insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, enviada_em)
values ('cccccccc-0000-0000-0000-000000000001', 'cap-1', 'saida', 'texto', '2026-10-07 10:56-03');
select pg_temp.ok('mensagem nova marca a última mensagem da conexão',
       (select ultima_mensagem_em = greatest('2026-10-07 10:56-03'::timestamptz, ultima_mensagem_em)
          from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444')
       and (select ultima_mensagem_em is not null from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444'));

update public.conexoes_whatsapp set ultima_mensagem_em = '2026-10-07 10:56-03'
 where user_id = '44444444-4444-4444-4444-444444444444';
insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, enviada_em)
values ('cccccccc-0000-0000-0000-000000000001', 'cap-0', 'entrada', 'texto', '2026-10-07 09:00-03');
select pg_temp.ok('histórico antigo não puxa a última mensagem para trás',
       (select ultima_mensagem_em = '2026-10-07 10:56-03' from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444'));

insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, enviada_em)
values ('cccccccc-0000-0000-0000-000000000001', 'cap-futuro', 'entrada', 'texto', now() + interval '3 days');
select pg_temp.ok('relógio adiantado do aparelho não empurra a última mensagem para o futuro',
       (select ultima_mensagem_em <= now() from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444'));

select pg_temp.ok('a mensagem só marca a conexão do próprio vendedor',
       (select w.ultima_mensagem_em is not distinct from c.ultima_mensagem_em
          from conexoes_whatsapp w, controle c where w.user_id = '55555555-5555-5555-5555-555555555555'));

-- Buracos: um aberto por conexão.
insert into public.buracos_captura (conexao_id, user_id, unidade_id, inicio)
select id, user_id, unidade_id, '2026-10-07 10:56-03' from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
    insert into public.buracos_captura (conexao_id, user_id, unidade_id, inicio)
    select id, user_id, unidade_id, '2026-10-07 12:00-03' from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444';
    raise notice 'FALHOU  dois buracos abertos na mesma conexão';
exception when unique_violation then
    raise notice 'PASSOU  um buraco aberto por conexão';
end $$;
update public.buracos_captura set fim = '2026-10-08 07:35-03' where fim is null;
insert into public.buracos_captura (conexao_id, user_id, unidade_id, inicio)
select id, user_id, unidade_id, '2026-10-08 10:00-03' from conexoes_whatsapp where user_id = '44444444-4444-4444-4444-444444444444';
select pg_temp.ok('fechado o buraco, a conexão pode abrir outro',
       (select count(*) = 2 from buracos_captura));
do $$
begin
    update public.buracos_captura set fim = inicio - interval '1 minute' where fim is null;
    raise notice 'FALHOU  buraco terminando antes de começar';
exception when check_violation then
    raise notice 'PASSOU  buraco não termina antes de começar';
end $$;

update public.conexoes_whatsapp set silencio_desde = '2026-10-08 10:00-03'
 where user_id = '44444444-4444-4444-4444-444444444444';
update public.relatorios_diarios set captura_incompleta = true
 where user_id = '44444444-4444-4444-4444-444444444444';

-- O que cada papel enxerga.
set local role authenticated;

-- Gestor do Centro (seed): vê o alerta e a marca do relatório da equipe.
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('gestor vê o silêncio do vendedor na view de conexões',
       (select count(*) = 1 from vw_conexoes_status where silencio_desde is not null));
select pg_temp.ok('gestor vê a última mensagem das conexões da unidade',
       (select count(*) >= 1 from vw_conexoes_status where ultima_mensagem_em is not null));
select pg_temp.ok('gestor vê a captura incompleta no relatório',
       (select count(*) = 1 from relatorios_diarios where captura_incompleta));
do $$
begin
    perform 1 from public.buracos_captura;
    raise notice 'FALHOU  usuário autenticado leu buracos_captura';
exception when insufficient_privilege then
    raise notice 'PASSOU  buracos_captura só pelo service role';
end $$;

-- Gestor de Bento: não vê o silêncio de outra unidade.
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor de outra unidade não vê o silêncio',
       (select count(*) = 0 from vw_conexoes_status where silencio_desde is not null));

reset role;
select pg_temp.ok('trigger da conexão fora do alcance do cliente',
       not has_function_privilege('authenticated', 'public.conexao_marca_mensagem()', 'execute'));

rollback;
