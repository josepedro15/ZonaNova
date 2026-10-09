-- =============================================================================
-- ZonaNova — a mesma pessoa numa conversa só: LID × telefone (auditoria de 07/10/2026)
--
-- O histórico da UAZAPI trouxe o chat pelo LID (`…@lid`) e o ao vivo pelo
-- número. A ingestão grava o LID como `lid:<dígitos>` (0015), então a mesma
-- pessoa virou duas conversas — caso Lucas, da Ana Paula: `lid:141562256314579`
-- (14:10–14:37) e `555181009857` (14:48–16:52), as duas `venda_feita`, a venda
-- contada duas vezes. Em 08/10 eram 3.253 conversas `lid:` de 5.658, quase
-- todas do histórico de pareamento de 05–06/10.
--
-- 1. `conversas.cliente_lid`: o LID do contato, único por vendedor. As
--    conversas `lid:` já o recebem aqui.
-- 2. `zn_unificar_conversa(origem, destino)`: passa tudo da origem para o
--    destino e apaga a origem. Num dia analisado nos dois lados fica a análise
--    do destino (análise, aderência e observações do MEC do mesmo dia andam
--    juntas): as duas viram velhas com a conversa unida, e o dia tem de ser
--    reprocessado na Operação de qualquer forma.
-- 3. `zn_conversa_do_contato(...)`: a conversa da mensagem que chega com LID.
--    Com telefone, é a do telefone, e a conversa `lid:` do mesmo contato é
--    unida a ela. Só com o LID, é a conversa que já tiver aquele LID — com
--    telefone, se o contato já foi resolvido.
--
-- As `lid:` antigas são resolvidas pelo scripts/lid-backfill.ts (POST
-- /chat/check na UAZAPI devolve o número de um LID).
-- =============================================================================

alter table public.conversas add column if not exists cliente_lid text;

update public.conversas
   set cliente_lid = substr(cliente_telefone, 5)
 where cliente_telefone like 'lid:%'
   and cliente_lid is null;

create unique index if not exists conversas_user_lid_key
    on public.conversas (user_id, cliente_lid) where cliente_lid is not null;

-- -----------------------------------------------------------------------------
-- Unir duas conversas do mesmo vendedor
-- -----------------------------------------------------------------------------
create or replace function public.zn_unificar_conversa(p_origem uuid, p_destino uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    o public.conversas%rowtype;
    d public.conversas%rowtype;
    v_dias date[];
    v_movidas integer;
begin
    if p_origem = p_destino then
        raise exception 'zn_unificar_conversa: origem e destino são a mesma conversa';
    end if;
    -- Trava as duas em ordem fixa: duas unificações cruzadas não se esperam em ciclo.
    perform 1 from public.conversas where id in (p_origem, p_destino) order by id for update;
    select * into o from public.conversas where id = p_origem;
    select * into d from public.conversas where id = p_destino;
    if o.id is null or d.id is null then
        raise exception 'zn_unificar_conversa: conversa inexistente (% → %)', p_origem, p_destino;
    end if;
    if o.user_id <> d.user_id then
        raise exception 'zn_unificar_conversa: conversas de vendedores diferentes';
    end if;

    -- Dias com resultado de análise dos dois lados: fica o do destino.
    select coalesce(array_agg(distinct x.data_ref), '{}') into v_dias
      from (select data_ref from public.analises_conversa  where conversa_id = p_destino
            union select data_ref from public.aderencia_conversa where conversa_id = p_destino
            union select data_ref from public.mec_observacoes    where conversa_id = p_destino) x
     where x.data_ref in (select data_ref from public.analises_conversa  where conversa_id = p_origem
                          union select data_ref from public.aderencia_conversa where conversa_id = p_origem
                          union select data_ref from public.mec_observacoes    where conversa_id = p_origem);

    -- A contestação do vendedor não some com a aderência repetida: vai para a
    -- mesma etapa do destino, quando houver.
    update public.aderencia_contestacoes c
       set aderencia_id = dn.id
      from public.aderencia_conversa ao
      join public.aderencia_conversa dn
        on dn.conversa_id = p_destino and dn.data_ref = ao.data_ref and dn.etapa = ao.etapa
     where ao.conversa_id = p_origem and ao.data_ref = any (v_dias) and c.aderencia_id = ao.id;

    delete from public.analises_conversa  where conversa_id = p_origem and data_ref = any (v_dias);
    delete from public.aderencia_conversa where conversa_id = p_origem and data_ref = any (v_dias);
    delete from public.mec_observacoes    where conversa_id = p_origem and data_ref = any (v_dias);

    update public.analises_conversa  set conversa_id = p_destino where conversa_id = p_origem;
    update public.aderencia_conversa set conversa_id = p_destino where conversa_id = p_origem;
    update public.mec_observacoes    set conversa_id = p_destino where conversa_id = p_origem;
    update public.envios_crm         set conversa_id = p_destino where conversa_id = p_origem;

    -- Fila: o item da origem vira do destino, a não ser que o destino já tenha o seu.
    delete from public.fila_processamento f
     where f.referencia_id = p_origem and f.tipo in ('analise_conversa', 'envio_crm')
       and exists (select 1 from public.fila_processamento g
                    where g.tipo = f.tipo and g.referencia_id = p_destino and g.data_ref = f.data_ref);
    update public.fila_processamento set referencia_id = p_destino
     where referencia_id = p_origem and tipo in ('analise_conversa', 'envio_crm');

    -- Os gatilhos de mensagens são de INSERT: mover não mexe em contador nem na dispensa.
    update public.mensagens set conversa_id = p_destino where conversa_id = p_origem;
    get diagnostics v_movidas = row_count;

    -- Antes do update do destino: o índice único de cliente_lid não aceita os dois.
    delete from public.conversas where id = p_origem;

    update public.conversas c
       set cliente_nome = coalesce(d.cliente_nome, o.cliente_nome),
           cliente_lid  = coalesce(d.cliente_lid, o.cliente_lid,
                                   case when o.cliente_telefone like 'lid:%' then substr(o.cliente_telefone, 5) end),
           bloqueada    = d.bloqueada or o.bloqueada,
           -- Venda fechada na loja vale para a pessoa, não para a conversa por onde veio.
           fechada_presencial_em  = coalesce(d.fechada_presencial_em, o.fechada_presencial_em),
           fechada_presencial_por = case when d.fechada_presencial_em is null then o.fechada_presencial_por else d.fechada_presencial_por end,
           fechada_presencial_ref = case when d.fechada_presencial_em is null then o.fechada_presencial_ref else d.fechada_presencial_ref end,
           total_mensagens    = x.n,
           ultima_mensagem_em = x.ultima
      from (select count(*)::integer n, max(enviada_em) ultima
              from public.mensagens where conversa_id = p_destino) x
     where c.id = p_destino;

    return v_movidas;
end;
$$;

-- -----------------------------------------------------------------------------
-- A conversa de uma mensagem que chega com LID
-- -----------------------------------------------------------------------------
create or replace function public.zn_conversa_do_contato(
    p_user uuid, p_unidade uuid, p_telefone text, p_lid text, p_nome text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_id uuid;
    v_origem uuid;
begin
    if p_lid is null or p_lid = '' then
        raise exception 'zn_conversa_do_contato: sem LID — use o upsert pelo telefone';
    end if;
    -- Duas mensagens do mesmo contato ao mesmo tempo (uma pelo LID, outra pelo
    -- número) criariam as duas conversas que isto existe para evitar.
    perform pg_advisory_xact_lock(hashtextextended(p_user::text || '/lid/' || p_lid, 0));

    if p_telefone like 'lid:%' then
        select id into v_id from public.conversas where user_id = p_user and cliente_lid = p_lid;
        if v_id is not null then
            update public.conversas
               set unidade_id = p_unidade, cliente_nome = coalesce(p_nome, cliente_nome)
             where id = v_id;
            return v_id;
        end if;
        insert into public.conversas (user_id, unidade_id, cliente_telefone, cliente_nome, cliente_lid)
        values (p_user, p_unidade, p_telefone, p_nome, p_lid)
        on conflict (user_id, cliente_telefone) do update
           set unidade_id = excluded.unidade_id,
               cliente_nome = coalesce(excluded.cliente_nome, public.conversas.cliente_nome),
               cliente_lid = excluded.cliente_lid
        returning id into v_id;
        return v_id;
    end if;

    insert into public.conversas (user_id, unidade_id, cliente_telefone, cliente_nome)
    values (p_user, p_unidade, p_telefone, p_nome)
    on conflict (user_id, cliente_telefone) do update
       set unidade_id = excluded.unidade_id,
           cliente_nome = coalesce(excluded.cliente_nome, public.conversas.cliente_nome)
    returning id into v_id;

    -- Mesmo LID é a mesma pessoa: a conversa `lid:` e, se houver, outra
    -- conversa com telefone (com e sem o nono dígito) que já tinha o LID.
    for v_origem in
        select id from public.conversas
         where user_id = p_user and id <> v_id
           and (cliente_lid = p_lid or cliente_telefone = 'lid:' || p_lid)
         order by created_at
    loop
        perform public.zn_unificar_conversa(v_origem, v_id);
    end loop;

    update public.conversas set cliente_lid = p_lid
     where id = v_id and cliente_lid is distinct from p_lid;
    return v_id;
end;
$$;

revoke all on function public.zn_unificar_conversa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zn_conversa_do_contato(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.zn_unificar_conversa(uuid, uuid) to service_role;
grant execute on function public.zn_conversa_do_contato(uuid, uuid, text, text, text) to service_role;
