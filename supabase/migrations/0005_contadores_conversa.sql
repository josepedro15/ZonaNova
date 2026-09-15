-- =============================================================================
-- ZonaNova — manter ultima_mensagem_em e total_mensagens no banco
--
-- Os dois campos ordenam a lista de conversas do vendedor. Mantê-los pela
-- aplicação obrigaria o webhook a ler-contar-escrever a cada mensagem, e duas
-- reentregas simultâneas da UAZAPI dariam contagem errada — a corrida acontece
-- entre o SELECT e o UPDATE.
--
-- No trigger não há corrida: só dispara quando a linha de mensagens foi mesmo
-- inserida. O `ON CONFLICT DO NOTHING` da idempotência não insere nada em
-- reentrega, logo o contador não sobe duas vezes.
-- =============================================================================

create or replace function public.conversa_conta_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.conversas
       set total_mensagens    = total_mensagens + 1,
           ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, new.enviada_em),
                                         new.enviada_em)
     where id = new.conversa_id;
    return new;
end;
$$;

drop trigger if exists trg_conversa_conta_mensagem on public.mensagens;
create trigger trg_conversa_conta_mensagem
    after insert on public.mensagens
    for each row execute function public.conversa_conta_mensagem();

-- Recontagem para o que já existir (hoje, nada — mas a migration tem de ser
-- correta se correr sobre base com dado).
update public.conversas c
   set total_mensagens    = x.n,
       ultima_mensagem_em = x.ultima
  from (select conversa_id, count(*) n, max(enviada_em) ultima
          from public.mensagens group by conversa_id) x
 where x.conversa_id = c.id
   and (c.total_mensagens is distinct from x.n
        or c.ultima_mensagem_em is distinct from x.ultima);

revoke all on function public.conversa_conta_mensagem() from anon, authenticated;
