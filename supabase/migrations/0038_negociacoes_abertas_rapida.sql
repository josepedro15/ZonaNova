-- =============================================================================
-- ZonaNova — base do card de monitoramento sem a RLS linha a linha (23/11/2026)
--
-- Na 0036 a zn_negociacoes_abertas era SECURITY INVOKER: a RLS de
-- analises_conversa e de conversas era conferida em cada linha de 90 dias de
-- análises, e para o supervisor levava 2,6 s por página (o card pede duas). Aqui
-- ela roda como dona da tabela e aplica o MESMO recorte da RLS de conversas
-- uma vez só: ativo, e a conversa é do próprio usuário ou de uma unidade que
-- ele vê (zn_unidades_visiveis). Medido: 54 ms.
-- =============================================================================

create or replace function public.zn_negociacoes_abertas(p_desde date, p_unidade uuid default null)
returns table (
    conversa_id        uuid,
    user_id            uuid,
    unidade_id         uuid,
    cliente_nome       text,
    cliente_telefone   text,
    ultima_mensagem_em timestamptz,
    data_ref           date,
    status             text,
    potencial_venda    text
)
language sql
stable
security definer
set search_path = public
as $$
    select u.conversa_id, u.user_id, u.unidade_id, u.cliente_nome, u.cliente_telefone,
           u.ultima_mensagem_em, u.data_ref, u.status, u.potencial_venda
    from (
        select distinct on (a.conversa_id)
               a.conversa_id, c.user_id, c.unidade_id, c.cliente_nome, c.cliente_telefone,
               c.ultima_mensagem_em, a.data_ref, a.tipo_conversa, a.status, a.potencial_venda
        from public.analises_conversa a
        join public.conversas c on c.id = a.conversa_id
        where public.zn_ativo()
          and (c.user_id = auth.uid() or c.unidade_id in (select public.zn_unidades_visiveis()))
          and a.data_ref >= p_desde
          and c.bloqueada = false
          and c.dispensada_em is null
          and (p_unidade is null or c.unidade_id = p_unidade)
        order by a.conversa_id, a.data_ref desc
    ) u
    where u.tipo_conversa = 'negociacao'
      and u.status in ('em_andamento', 'lead_frio', 'sem_resposta');
$$;

revoke all on function public.zn_negociacoes_abertas(date, uuid) from public, anon;
grant execute on function public.zn_negociacoes_abertas(date, uuid) to authenticated;
