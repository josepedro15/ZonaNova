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

-- ---------------------------------------------------------------------------
-- GUARDA DE PRIVILÉGIOS
--
-- O stub do db-local.sh replica as default privileges do Supabase de propósito:
-- toda tabela nova em public nasce com ALL para anon e authenticated, e é a
-- migration 0003 que desfaz isso. Quem acrescentar uma tabela numa migration
-- futura sem a cobrir tem de falhar aqui — senão repete-se o vazamento do
-- instance_token, que passou na Fase 3 por o Postgres local ser mais fechado
-- que a produção.
-- ---------------------------------------------------------------------------
do $$
declare v_anon text; v_extra text;
begin
    select string_agg(distinct table_name, ', ' order by table_name) into v_anon
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon';

    if v_anon is not null then
        raise notice 'FALHOU  anon tem privilégio em public: %', v_anon;
    else
        raise notice 'PASSOU  anon sem privilégio nenhum em public';
    end if;

    -- authenticated só pode escrever onde 0001/0002 mandaram.
    select string_agg(distinct table_name, ', ' order by table_name) into v_extra
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and table_name not in ('profiles', 'contatos_bloqueados', 'unidades',
                             'aderencia_contestacoes');

    if v_extra is not null then
        raise notice 'FALHOU  authenticated escreve onde não devia: %', v_extra;
    else
        raise notice 'PASSOU  authenticated escreve só nas tabelas previstas';
    end if;
end $$;

do $$
begin
    perform 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'conexoes_whatsapp'
      and column_name = 'instance_token' and grantee in ('anon', 'authenticated');
    if found then
        raise notice 'FALHOU  instance_token alcançável por grant de coluna';
    else
        raise notice 'PASSOU  instance_token fora de todo grant';
    end if;
end $$;

-- webhook_entrada guarda conteúdo de mensagem em trânsito (0014): nenhum
-- papel de cliente lê nem escreve, com ou sem política.
do $$
begin
    if has_table_privilege('authenticated', 'public.webhook_entrada', 'select')
       or has_table_privilege('anon', 'public.webhook_entrada', 'select') then
        raise notice 'FALHOU  webhook_entrada legível por papel de cliente';
    else
        raise notice 'PASSOU  webhook_entrada fora de anon e authenticated';
    end if;
end $$;

-- As funções são o segundo lugar onde "revogar do papel errado" não revoga:
-- toda função nasce com EXECUTE para PUBLIC, e PUBLIC não é anon nem
-- authenticated. A 0003 e a 0005 caíram nisso; a 0006 corrige. Aqui se afirma
-- que continua corrigido.
do $$
declare v text;
begin
    select string_agg(p.proname, ', ' order by p.proname) into v
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'execute');
    if v is not null then raise notice 'FALHOU  anon executa função de public: %', v;
    else raise notice 'PASSOU  anon não executa função nenhuma de public'; end if;

    -- E o contrário: sem EXECUTE nas funções de escopo, toda política morre.
    select string_agg(nome, ', ') into v from unnest(array[
        'zn_role()', 'zn_ativo()', 'zn_unidades_visiveis()', 'zn_minha_unidade()'
    ]) nome
    where not has_function_privilege('authenticated', 'public.' || nome, 'execute');
    if v is not null then raise notice 'FALHOU  authenticated perdeu execute em: %', v;
    else raise notice 'PASSOU  authenticated executa as quatro funções de escopo'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- CONTADORES DA CONVERSA (migration 0005)
--
-- O que se prova aqui é a reentrega: a UAZAPI reentrega o que demora, e o
-- webhook responde com ON CONFLICT DO NOTHING. Se o contador fosse mantido
-- pela aplicação, a segunda entrega somaria de novo e o vendedor apareceria
-- com o dobro de mensagens. Roda por último porque escreve.
--
-- As datas são RELATIVAS a now(), de propósito. A primeira versão deste bloco
-- fixava '2026-09-15 10:00' e passou no dia em que foi escrita; quatro dias
-- depois falhou sozinha, porque o seed carimba a conversa com now() e a data
-- fixa deixou de ser a mais recente. O trigger estava certo — o teste é que
-- tinha prazo de validade.
-- ---------------------------------------------------------------------------
do $$
declare
    v_conv   uuid;
    n        integer;
    ult      timestamptz;
    recente  timestamptz := date_trunc('second', now() + interval '1 hour');
    atrasada timestamptz := date_trunc('second', now() - interval '5 days');
begin
    select id into v_conv from public.conversas limit 1;

    insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, enviada_em)
    values (v_conv, 'TESTE-TRIGGER-1', 'entrada', 'texto', 'oi', recente);

    select total_mensagens, ultima_mensagem_em into n, ult
      from public.conversas where id = v_conv;

    if n = (select count(*) from public.mensagens where conversa_id = v_conv)
    then raise notice 'PASSOU  trigger somou a mensagem';
    else raise notice 'FALHOU  total ficou %, mensagens são %', n,
         (select count(*) from public.mensagens where conversa_id = v_conv); end if;

    if ult = recente
    then raise notice 'PASSOU  ultima_mensagem_em carimbada';
    else raise notice 'FALHOU  ultima_mensagem_em veio %, esperado %', ult, recente; end if;

    insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, enviada_em)
    values (v_conv, 'TESTE-TRIGGER-1', 'entrada', 'texto', 'oi', recente)
    on conflict (wa_message_id) do nothing;

    if (select total_mensagens from public.conversas where id = v_conv) = n
    then raise notice 'PASSOU  reentrega do webhook não inflou o contador';
    else raise notice 'FALHOU  reentrega subiu o contador para %',
         (select total_mensagens from public.conversas where id = v_conv); end if;

    insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, enviada_em)
    values (v_conv, 'TESTE-TRIGGER-2', 'entrada', 'texto', 'atrasada', atrasada);

    if (select ultima_mensagem_em from public.conversas where id = v_conv) = recente
    then raise notice 'PASSOU  mensagem atrasada não recuou ultima_mensagem_em';
    else raise notice 'FALHOU  carimbo recuou com mensagem atrasada'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0016: inativo não herda o escopo do papel; contestação fica na unidade
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set status = 'inativo' where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor inativo NÃO vê o relatório da rede',
       (select count(*) from relatorios_rede), 0);
select pg_temp.ok('supervisor inativo NÃO vê o log',
       (select count(*) from eventos_admin), 0);
select pg_temp.ok('supervisor inativo NÃO vê profile de ninguém além do próprio',
       (select count(*) from profiles), 1);
do $$
begin
    insert into public.unidades (nome) values ('Unidade fantasma');
    raise notice 'FALHOU  supervisor inativo criou unidade';
exception when insufficient_privilege or check_violation then
    raise notice 'PASSOU  supervisor inativo não escreve em unidades';
end $$;
reset role;
update public.profiles set status = 'ativo' where id = '11111111-1111-1111-1111-111111111111';

-- Encerrado: só pode haver um playbook vigente, e o seed já tem o dele.
insert into public.playbooks (id, versao, nome, vigente_de, vigente_ate)
values ('dddddddd-0000-0000-0000-000000000001', 'teste-rls', 'Playbook de teste', current_date, current_date)
on conflict do nothing;
insert into public.aderencia_conversa (id, conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, aplicavel, aplicado)
values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003',
        '66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000002',
        current_date, 'dddddddd-0000-0000-0000-000000000001', 'acolhida', true, 'nao')
on conflict do nothing;
insert into public.aderencia_contestacoes (aderencia_id, contestado_por, motivo)
values ('eeeeeeee-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'motivo de Bento');

set role authenticated;
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('gestor do Centro NÃO lê contestação de Bento',
       (select count(*) from aderencia_contestacoes), 0);
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor de Bento lê a contestação da unidade dele',
       (select count(*) from aderencia_contestacoes), 1);
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor ativo lê a contestação',
       (select count(*) from aderencia_contestacoes), 1);

reset role;
-- mec_observacoes: mesmo escopo de aderencia_conversa (conversa de Bento).
insert into public.mec_observacoes (conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, sinal, item_chave, valor, trecho)
values ('cccccccc-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-0000-0000-0000-000000000002', current_date, 'dddddddd-0000-0000-0000-000000000001',
        'sondagem', 'sondagem_item', 'sondagem_a', true, 'o que está construindo?');

set role authenticated;
select pg_temp.como('44444444-4444-4444-4444-444444444444');
select pg_temp.ok('vendedor do Centro NÃO lê observação do MEC de Bento',
       (select count(*) from mec_observacoes), 0);
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('gestor do Centro NÃO lê observação do MEC de Bento',
       (select count(*) from mec_observacoes), 0);
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor de Bento lê a observação do MEC da unidade dele',
       (select count(*) from mec_observacoes), 1);
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor lê a observação do MEC',
       (select count(*) from mec_observacoes), 1);
reset role;

-- ---------------------------------------------------------------------------
-- 0017: reabrir sem execução dupla; limite de tentativas
-- ---------------------------------------------------------------------------
do $$
declare
    v_ref uuid := 'ffffffff-0000-0000-0000-000000000001';
    v_status text; v_reaberto boolean; v_tentativas int;
begin
    -- Item parado volta para pendente, zerado.
    insert into public.fila_processamento (tipo, referencia_id, data_ref, status, tentativas)
    values ('relatorio_vendedor', v_ref, '2026-09-21', 'falhou', 3);
    perform public.zn_reabrir_item('relatorio_vendedor', v_ref, '2026-09-21');
    select status, reaberto, tentativas into v_status, v_reaberto, v_tentativas
      from public.fila_processamento where referencia_id = v_ref;
    if v_status = 'pendente' and not v_reaberto and v_tentativas = 0
    then raise notice 'PASSOU  reabrir item parado volta para pendente';
    else raise notice 'FALHOU  reabrir item parado: % % %', v_status, v_reaberto, v_tentativas; end if;

    -- Item rodando só ganha a marca: não volta para pendente (execução dupla).
    update public.fila_processamento set status = 'processando', tentativas = 1 where referencia_id = v_ref;
    perform public.zn_reabrir_item('relatorio_vendedor', v_ref, '2026-09-21');
    select status, reaberto, tentativas into v_status, v_reaberto, v_tentativas
      from public.fila_processamento where referencia_id = v_ref;
    if v_status = 'processando' and v_reaberto and v_tentativas = 1
    then raise notice 'PASSOU  reabrir item rodando só marca reaberto';
    else raise notice 'FALHOU  reabrir item rodando: % % %', v_status, v_reaberto, v_tentativas; end if;

    -- Item inexistente nasce pendente.
    perform public.zn_reabrir_item('rollup_rede', '00000000-0000-0000-0000-000000000000', '2026-09-21');
    if exists (select 1 from public.fila_processamento where tipo = 'rollup_rede' and data_ref = '2026-09-21' and status = 'pendente')
    then raise notice 'PASSOU  reabrir item novo cria pendente';
    else raise notice 'FALHOU  reabrir item novo não criou'; end if;

    if public.zn_consumir_limite('teste:x', 2, 60) and public.zn_consumir_limite('teste:x', 2, 60)
       and not public.zn_consumir_limite('teste:x', 2, 60)
    then raise notice 'PASSOU  limite deixa 2 e barra o 3º';
    else raise notice 'FALHOU  limite não contou certo'; end if;

    update public.limites_acesso set inicio = now() - interval '2 minutes' where chave = 'teste:x';
    if public.zn_consumir_limite('teste:x', 2, 60)
    then raise notice 'PASSOU  janela vencida zera o limite';
    else raise notice 'FALHOU  janela vencida continuou barrando'; end if;
end $$;

do $$
begin
    if has_function_privilege('authenticated', 'public.zn_consumir_limite(text, integer, integer)', 'execute')
       or has_function_privilege('anon', 'public.zn_reabrir_item(text, uuid, date)', 'execute')
       or has_table_privilege('authenticated', 'public.limites_acesso', 'select')
    then raise notice 'FALHOU  funções/tabela da 0017 alcançáveis pelo cliente';
    else raise notice 'PASSOU  0017 só para o service role'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0018: admin lê todos os perfis; supervisor continua sem ver admin
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'admin@zonanova.com.br')
on conflict do nothing;
insert into public.profiles (id, nome, email, role, unidade_id, status)
values ('88888888-8888-8888-8888-888888888888', 'Ana Admin', 'admin@zonanova.com.br', 'admin', null, 'ativo')
on conflict (id) do update set role = 'admin', status = 'ativo', unidade_id = null;
set role authenticated;
select pg_temp.como('88888888-8888-8888-8888-888888888888');
select pg_temp.ok('admin vê todos os perfis, inclusive sem unidade',
       (select count(*) from profiles), 8);  -- os 7 do seed + o admin
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor NÃO vê o perfil do admin',
       (select count(*) from profiles where id = '88888888-8888-8888-8888-888888888888'), 0);
reset role;
do $$
begin
    if public.zn_vendedor_tem_analise_aberta('44444444-4444-4444-4444-444444444444', '2026-01-01') then
        raise notice 'FALHOU  pendência inventada';
    end if;
    insert into public.fila_processamento (tipo, referencia_id, data_ref, status)
    values ('analise_conversa', 'cccccccc-0000-0000-0000-000000000001', '2026-01-01', 'pendente');
    if public.zn_vendedor_tem_analise_aberta('44444444-4444-4444-4444-444444444444', '2026-01-01')
       and not public.zn_vendedor_tem_analise_aberta('55555555-5555-5555-5555-555555555555', '2026-01-01')
    then raise notice 'PASSOU  pendência do vendedor é só dele';
    else raise notice 'FALHOU  pendência do vendedor cruzou com colega'; end if;
    if has_function_privilege('authenticated', 'public.zn_vendedor_tem_analise_aberta(uuid, date)', 'execute')
    then raise notice 'FALHOU  zn_vendedor_tem_analise_aberta alcançável pelo cliente';
    else raise notice 'PASSOU  zn_vendedor_tem_analise_aberta só para o service role'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0019: a soma de custo respeita a RLS de quem chama
-- ---------------------------------------------------------------------------
do $$
begin
    if has_function_privilege('anon', 'public.zn_custo_total()', 'execute')
    then raise notice 'FALHOU  anon executa zn_custo_total';
    else raise notice 'PASSOU  zn_custo_total fora do anon'; end if;
    if (select prosecdef from pg_proc where proname = 'zn_custo_total')
    then raise notice 'FALHOU  zn_custo_total é security definer (furaria a RLS)';
    else raise notice 'PASSOU  zn_custo_total soma pela RLS de quem chama'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0022: contatos internos — cada loja lê a própria lista; ninguém escreve
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.como('44444444-4444-4444-4444-444444444444');
select pg_temp.ok('vendedor vê a lista interna da própria loja',
       (select count(*) from contatos_internos), 1);
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor NÃO vê a lista de loja que não gerencia',
       (select count(*) from contatos_internos where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0);
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor vê a lista da rede',
       (select count(*) from contatos_internos), 2);
reset role;

do $$
begin
    if has_table_privilege('authenticated', 'public.contatos_internos', 'insert')
       or has_table_privilege('authenticated', 'public.contatos_internos', 'update')
       or has_table_privilege('authenticated', 'public.contatos_internos', 'delete')
    then raise notice 'FALHOU  authenticated escreve em contatos_internos';
    else raise notice 'PASSOU  contatos_internos só se escreve pelo service role'; end if;
    if has_table_privilege('anon', 'public.contatos_internos', 'select')
    then raise notice 'FALHOU  anon lê contatos_internos';
    else raise notice 'PASSOU  anon fora de contatos_internos'; end if;
end $$;

-- O número de um colega conectado DEPOIS da migration: a conversa antiga com
-- ele tem de sair das telas na hora em que o número é gravado, não só no
-- backfill da 0022. Vera (pendente, sem conexão) conecta com o telefone da
-- cliente de Rafael; depois Letícia troca o número para a forma sem o nono
-- dígito do mesmo telefone. Tudo é desfeito no fim.
do $$
declare v_rafael boolean; v_leticia boolean;
begin
    insert into public.conexoes_whatsapp (user_id, unidade_id, instance_name, numero, status)
    values ('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001',
            'zn-vera-teste', '5554991347702', 'conectada');
    select bloqueada into v_rafael  from public.conversas where id = 'cccccccc-0000-0000-0000-000000000001';
    select bloqueada into v_leticia from public.conversas where id = 'cccccccc-0000-0000-0000-000000000002';
    if v_rafael and not v_leticia
    then raise notice 'PASSOU  colega conectado depois some das conversas (insert)';
    else raise notice 'FALHOU  colega conectado depois: rafael=% leticia=%', v_rafael, v_leticia; end if;

    delete from public.conexoes_whatsapp where user_id = '77777777-7777-7777-7777-777777777777';
    update public.conversas set bloqueada = false where id = 'cccccccc-0000-0000-0000-000000000001';

    -- Só o status mudou: não é número novo, nada se marca.
    update public.conexoes_whatsapp set status = 'caida'
     where user_id = '55555555-5555-5555-5555-555555555555';
    update public.conexoes_whatsapp set numero = '555491347702'
     where user_id = '55555555-5555-5555-5555-555555555555';
    select bloqueada into v_rafael from public.conversas where id = 'cccccccc-0000-0000-0000-000000000001';
    if v_rafael
    then raise notice 'PASSOU  número trocado sem o nono dígito também marca (update)';
    else raise notice 'FALHOU  número trocado sem o nono dígito não marcou'; end if;

    update public.conexoes_whatsapp set numero = '5554998887766', status = 'conectada'
     where user_id = '55555555-5555-5555-5555-555555555555';
    update public.conversas set bloqueada = false where id = 'cccccccc-0000-0000-0000-000000000001';

    if has_function_privilege('authenticated', 'public.conversas_bloqueia_numero_de_colega()', 'execute')
    then raise notice 'FALHOU  authenticated executa conversas_bloqueia_numero_de_colega';
    else raise notice 'PASSOU  conversas_bloqueia_numero_de_colega fora do cliente'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0023: envio ao CRM — a fila aceita o tipo novo; envios_crm é do service role
-- ---------------------------------------------------------------------------
do $$
begin
    insert into public.fila_processamento (tipo, referencia_id, data_ref)
    values ('envio_crm', gen_random_uuid(), current_date);
    raise notice 'PASSOU  fila aceita envio_crm';
exception when check_violation then
    raise notice 'FALHOU  fila recusa envio_crm';
end $$;

do $$
begin
    if to_regclass('public.envios_crm') is null
    then raise notice 'FALHOU  envios_crm não existe';
    elsif has_table_privilege('authenticated', 'public.envios_crm', 'select')
       or has_table_privilege('authenticated', 'public.envios_crm', 'insert')
       or has_table_privilege('authenticated', 'public.envios_crm', 'update')
       or has_table_privilege('authenticated', 'public.envios_crm', 'delete')
       or has_table_privilege('anon', 'public.envios_crm', 'select')
    then raise notice 'FALHOU  envios_crm aberto ao cliente';
    else raise notice 'PASSOU  envios_crm só pelo service role'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0024: gestor enxerga só a unidade do próprio perfil
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
    insert into public.gestor_unidades (gestor_id, unidade_id)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002');
    raise notice 'FALHOU  gestor ganhou uma segunda unidade';
exception when others then
    raise notice 'PASSOU  gestor não ganha unidade além da do perfil';
end $$;

do $$
begin
    insert into public.gestor_unidades (gestor_id, unidade_id)
    values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise notice 'FALHOU  vendedor ganhou vínculo de gestor';
exception when others then
    raise notice 'PASSOU  vendedor não ganha vínculo de gestor';
end $$;

-- Vínculo que entrou por fora (como em produção, 06/10/2026): mesmo que a
-- linha exista, a RLS do gestor não passa da unidade do perfil.
set session_replication_role = replica;
insert into public.gestor_unidades (gestor_id, unidade_id)
values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002')
on conflict do nothing;
set session_replication_role = origin;
set role authenticated;
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('vínculo a mais não abre a outra unidade',
       (select count(*) from conversas where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 0);
select pg_temp.ok('gestor segue vendo a própria unidade',
       (select count(*) from conversas), 2);
reset role;
delete from public.gestor_unidades
 where gestor_id = '22222222-2222-2222-2222-222222222222'
   and unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- Trocar a unidade do gestor troca o vínculo; deixar de ser gestor apaga.
do $$
declare v text;
begin
    update public.profiles set unidade_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '33333333-3333-3333-3333-333333333333';
    select string_agg(unidade_id::text, ',') into v from public.gestor_unidades
     where gestor_id = '33333333-3333-3333-3333-333333333333';
    if v = 'aaaaaaaa-0000-0000-0000-000000000001'
    then raise notice 'PASSOU  gestor movido leva só a unidade nova';
    else raise notice 'FALHOU  gestor movido ficou com %', v; end if;

    update public.profiles set role = 'vendedor'
     where id = '33333333-3333-3333-3333-333333333333';
    if exists (select 1 from public.gestor_unidades where gestor_id = '33333333-3333-3333-3333-333333333333')
    then raise notice 'FALHOU  ex-gestor manteve vínculo';
    else raise notice 'PASSOU  ex-gestor perde o vínculo'; end if;

    update public.profiles set role = 'gestor', unidade_id = 'aaaaaaaa-0000-0000-0000-000000000002'
     where id = '33333333-3333-3333-3333-333333333333';
    select string_agg(unidade_id::text, ',') into v from public.gestor_unidades
     where gestor_id = '33333333-3333-3333-3333-333333333333';
    if v = 'aaaaaaaa-0000-0000-0000-000000000002'
    then raise notice 'PASSOU  virar gestor cria o vínculo da unidade do perfil';
    else raise notice 'FALHOU  virar gestor deixou %', v; end if;
end $$;

-- 0027: "Não é atendimento" dispensa a conversa até o cliente escrever de
-- novo. Mensagem do vendedor e mensagem antiga do cliente (histórico importado)
-- não trazem a conversa de volta; mensagem nova do cliente traz. Tudo é
-- desfeito no fim.
do $$
declare v timestamptz;
begin
    update public.conversas set dispensada_em = now() - interval '1 hour', dispensada_por = '55555555-5555-5555-5555-555555555555'
     where id = 'cccccccc-0000-0000-0000-000000000001';

    insert into public.mensagens (conversa_id, wa_message_id, direcao, conteudo, enviada_em)
    values ('cccccccc-0000-0000-0000-000000000001', 'teste-0027-saida', 'saida', 'oi', now());
    insert into public.mensagens (conversa_id, wa_message_id, direcao, conteudo, enviada_em)
    values ('cccccccc-0000-0000-0000-000000000001', 'teste-0027-antiga', 'entrada', 'antiga', now() - interval '2 hours');
    select dispensada_em into v from public.conversas where id = 'cccccccc-0000-0000-0000-000000000001';
    if v is not null
    then raise notice 'PASSOU  dispensa resiste a mensagem do vendedor e a histórico antigo';
    else raise notice 'FALHOU  dispensa apagada sem mensagem nova do cliente'; end if;

    insert into public.mensagens (conversa_id, wa_message_id, direcao, conteudo, enviada_em)
    values ('cccccccc-0000-0000-0000-000000000001', 'teste-0027-nova', 'entrada', 'voltei', now());
    select dispensada_em into v from public.conversas where id = 'cccccccc-0000-0000-0000-000000000001';
    if v is null
    then raise notice 'PASSOU  cliente que escreve de novo desfaz a dispensa';
    else raise notice 'FALHOU  dispensa continuou depois de mensagem nova do cliente'; end if;

    delete from public.mensagens where wa_message_id like 'teste-0027-%';

    if has_function_privilege('authenticated', 'public.conversas_reativa_dispensada()', 'execute')
    then raise notice 'FALHOU  authenticated executa conversas_reativa_dispensada';
    else raise notice 'PASSOU  conversas_reativa_dispensada fora do cliente'; end if;
end $$;

-- 0031: a mesma pessoa numa conversa só (LID × telefone). Caso Lucas: a
-- conversa `lid:` do histórico e a do telefone, ao vivo, com análise no mesmo
-- dia nas duas. Tudo é desfeito no fim.
do $$
declare
    v_user    constant uuid := '44444444-4444-4444-4444-444444444444';
    v_unidade constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
    v_pb      constant uuid := 'dddddddd-0000-0000-0000-000000000001';
    v_lid     constant uuid := 'cccccccc-0000-0000-0031-000000000001';
    v_tel     constant uuid := 'cccccccc-0000-0000-0031-000000000002';
    v_id uuid; v_n int; v_txt text;
begin
    insert into public.conversas (id, user_id, unidade_id, cliente_telefone, cliente_lid)
    values (v_lid, v_user, v_unidade, 'lid:141562256314579', '141562256314579');
    insert into public.conversas (id, user_id, unidade_id, cliente_telefone, cliente_nome)
    values (v_tel, v_user, v_unidade, '555181009857', 'Lucas Vinicius');
    insert into public.mensagens (conversa_id, wa_message_id, direcao, conteudo, enviada_em) values
        (v_lid, 'teste-0031-1', 'entrada', 'quero o piso', '2026-10-07 14:10-03'),
        (v_lid, 'teste-0031-2', 'saida',   'fechado',      '2026-10-07 14:37-03'),
        (v_tel, 'teste-0031-3', 'entrada', 'paguei',       '2026-10-07 14:48-03');
    insert into public.analises_conversa (conversa_id, user_id, unidade_id, data_ref, status, payload) values
        (v_lid, v_user, v_unidade, '2026-10-07', 'venda_feita', '{}'),
        (v_lid, v_user, v_unidade, '2026-10-06', 'em_negociacao', '{}'),
        (v_tel, v_user, v_unidade, '2026-10-07', 'venda_feita', '{}');
    insert into public.aderencia_conversa (id, conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, aplicavel, aplicado) values
        ('eeeeeeee-0000-0000-0031-000000000001', v_lid, v_user, v_unidade, '2026-10-07', v_pb, 'acolhida', true, 'nao'),
        ('eeeeeeee-0000-0000-0031-000000000002', v_tel, v_user, v_unidade, '2026-10-07', v_pb, 'acolhida', true, 'sim');
    insert into public.aderencia_contestacoes (aderencia_id, contestado_por, motivo)
    values ('eeeeeeee-0000-0000-0031-000000000001', v_user, 'acolhi sim');
    insert into public.mec_observacoes (conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, sinal) values
        (v_lid, v_user, v_unidade, '2026-10-07', v_pb, 'fechamento', 'fechamento'),
        (v_lid, v_user, v_unidade, '2026-10-06', v_pb, 'sondagem', 'pergunta_aberta');
    insert into public.fila_processamento (tipo, referencia_id, data_ref, status) values
        ('analise_conversa', v_lid, '2026-10-07', 'concluido'),
        ('analise_conversa', v_tel, '2026-10-07', 'concluido'),
        ('analise_conversa', v_lid, '2026-10-06', 'concluido');
    insert into public.envios_crm (telefone, modo, conversa_id, user_id, unidade_id, data_ref)
    values ('lid:141562256314579', 'simulacao', v_lid, v_user, v_unidade, '2026-10-07');

    v_id := public.zn_conversa_do_contato(v_user, v_unidade, '555181009857', '141562256314579', null);

    if v_id = v_tel and not exists (select 1 from public.conversas where id = v_lid)
    then raise notice 'PASSOU  mensagem com telefone e LID une a conversa lid: na do telefone';
    else raise notice 'FALHOU  conversa lid: não foi unida (%)', v_id; end if;

    select count(*) into v_n from public.mensagens where conversa_id = v_tel and wa_message_id like 'teste-0031-%';
    if v_n = 3 and (select total_mensagens from public.conversas where id = v_tel) = 3
       and (select ultima_mensagem_em from public.conversas where id = v_tel) = '2026-10-07 14:48-03'
    then raise notice 'PASSOU  mensagens movidas e contadores recontados';
    else raise notice 'FALHOU  mensagens/contadores depois da unificação (%)', v_n; end if;

    select string_agg(data_ref || '=' || status, ',' order by data_ref) into v_txt
      from public.analises_conversa where conversa_id = v_tel;
    if v_txt = '2026-10-06=em_negociacao,2026-10-07=venda_feita'
       and (select count(*) from public.analises_conversa where conversa_id = v_tel and data_ref = '2026-10-07') = 1
    then raise notice 'PASSOU  dia analisado nos dois lados fica com uma análise só; o resto é movido';
    else raise notice 'FALHOU  análises depois da unificação: %', v_txt; end if;

    if (select count(*) from public.aderencia_conversa where conversa_id = v_tel) = 1
       and (select aderencia_id from public.aderencia_contestacoes where motivo = 'acolhi sim') = 'eeeeeeee-0000-0000-0031-000000000002'
    then raise notice 'PASSOU  aderência repetida sai e a contestação vai para a do destino';
    else raise notice 'FALHOU  aderência/contestação depois da unificação'; end if;

    if (select count(*) from public.mec_observacoes where conversa_id = v_tel) = 1
       and (select data_ref from public.mec_observacoes where conversa_id = v_tel) = '2026-10-06'
    then raise notice 'PASSOU  observações do MEC do dia repetido saem, as outras são movidas';
    else raise notice 'FALHOU  observações do MEC depois da unificação'; end if;

    if (select count(*) from public.fila_processamento where referencia_id = v_tel and tipo = 'analise_conversa') = 2
       and not exists (select 1 from public.fila_processamento where referencia_id = v_lid)
       and (select conversa_id from public.envios_crm where telefone = 'lid:141562256314579') = v_tel
    then raise notice 'PASSOU  fila e envio ao CRM passam para o destino';
    else raise notice 'FALHOU  fila/envio_crm depois da unificação'; end if;

    if (select cliente_lid from public.conversas where id = v_tel) = '141562256314579'
       and (select cliente_nome from public.conversas where id = v_tel) = 'Lucas Vinicius'
    then raise notice 'PASSOU  destino guarda o LID e o nome';
    else raise notice 'FALHOU  LID/nome do destino'; end if;

    -- Depois de resolvido, a mensagem que vier só pelo LID cai na mesma conversa.
    v_id := public.zn_conversa_do_contato(v_user, v_unidade, 'lid:141562256314579', '141562256314579', 'Lucas');
    if v_id = v_tel and not exists (select 1 from public.conversas where cliente_telefone = 'lid:141562256314579')
    then raise notice 'PASSOU  mensagem só com o LID cai na conversa do telefone';
    else raise notice 'FALHOU  mensagem só com o LID criou outra conversa'; end if;

    -- LID novo, sem telefone: conversa lid: com o LID guardado.
    v_id := public.zn_conversa_do_contato(v_user, v_unidade, 'lid:999000111222333', '999000111222333', null);
    if (select cliente_lid from public.conversas where id = v_id and cliente_telefone = 'lid:999000111222333') = '999000111222333'
    then raise notice 'PASSOU  contato só com LID vira conversa lid: com cliente_lid';
    else raise notice 'FALHOU  conversa lid: nova sem cliente_lid'; end if;

    begin
        perform public.zn_unificar_conversa(v_id, 'cccccccc-0000-0000-0000-000000000002');
        raise notice 'FALHOU  uniu conversas de vendedores diferentes';
    exception when raise_exception then
        raise notice 'PASSOU  não une conversas de vendedores diferentes';
    end;

    delete from public.envios_crm where telefone = 'lid:141562256314579';
    delete from public.fila_processamento where referencia_id in (v_tel, v_lid);
    delete from public.conversas where id in (v_tel, v_id);

    if has_function_privilege('authenticated', 'public.zn_unificar_conversa(uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.zn_conversa_do_contato(uuid, uuid, text, text, text)', 'execute')
    then raise notice 'FALHOU  authenticated executa as funções de unificação';
    else raise notice 'PASSOU  funções de unificação fora do cliente'; end if;
end $$;
