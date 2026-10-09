-- =============================================================================
-- ZonaNova — "Não é atendimento" vira dispensa, e "Fechado presencialmente"
-- (pedidos do piloto Redemac, 07 e 08/10/2026)
--
-- 1. Dispensa. O botão "Não é atendimento" bloqueava o contato para sempre
--    (contatos_bloqueados + conversas.bloqueada), e o piloto entendia outra
--    coisa: tirar a conversa da fila agora e deixá-la voltar se o cliente
--    escrever de novo. `dispensada_em` marca isso. A conversa continua em
--    /conversas, mas sai do "Esperando você", da análise e do relatório. O
--    trigger abaixo apaga a marca quando chega mensagem do cliente posterior
--    a ela; mensagem antiga, importada pelo histórico, não apaga. O bloqueio
--    de verdade continua existindo, na lista do Perfil.
--
-- 2. Fechado presencialmente. Nos Pisos a venda costuma fechar na loja, depois
--    da conversa. O vendedor (ou o gestor) marca, e a análise do dia indicado
--    em `fechada_presencial_ref` passa a valer como venda feita. Quem grava a
--    análise com a marca é a server action e o worker (lib/presencial.ts).
--
-- Escrita só pelo service role, na server action que confere quem pode
-- (o vendedor dono, o gestor da unidade, supervisor e admin).
-- =============================================================================

alter table public.conversas
    add column if not exists dispensada_em          timestamptz,
    add column if not exists dispensada_por         uuid references public.profiles(id) on delete set null,
    add column if not exists fechada_presencial_em  timestamptz,
    add column if not exists fechada_presencial_por uuid references public.profiles(id) on delete set null,
    add column if not exists fechada_presencial_ref date;

-- SECURITY DEFINER como os demais triggers do repositório (0001, 0005, 0022):
-- a mensagem entra pelo service role hoje, mas a marcação não pode depender de
-- quem insere. `search_path` fixo fecha o desvio clássico de função definer.
create or replace function public.conversas_reativa_dispensada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.conversas
    set dispensada_em = null, dispensada_por = null
    where id = new.conversa_id
      and dispensada_em is not null
      and dispensada_em < new.enviada_em;
    return null;
end;
$$;

drop trigger if exists trg_mensagem_reativa_dispensada on public.mensagens;
create trigger trg_mensagem_reativa_dispensada
    after insert on public.mensagens
    for each row
    when (new.direcao = 'entrada')
    execute function public.conversas_reativa_dispensada();

revoke all on function public.conversas_reativa_dispensada() from public, anon, authenticated;
