-- =============================================================================
-- ZonaNova — bloqueio que funciona e contato sem telefone (revisão 22/09/2026)
--
-- 1. `conversas.bloqueada` — bloquear um contato só barrava mensagem nova. O
--    que já tinha chegado continuava no painel, na lista e no fechamento do
--    dia. Agora a conversa é marcada e sai das três; desbloquear devolve. Nada
--    é apagado.
--
-- 2. Bloqueios gravados sem o país. O formulário guardava os dígitos como
--    digitados ("54998124471"), e o webhook grava E.164 ("5554998124471"):
--    nunca casavam. DDD + número (10 ou 11 dígitos) ganha o 55.
--
-- 3. Conversas de contato `@lid`. O identificador de privacidade do WhatsApp
--    era gravado como se fosse telefone. O código passa a gravá-lo como
--    `lid:<dígitos>`; as conversas antigas recebem o mesmo prefixo para a
--    próxima mensagem cair na mesma conversa. Não há como distinguir um LID de
--    um telefone só pelos dígitos: a regra usa o que a rede atende — número
--    brasileiro começa com 55 e tem 12 ou 13 dígitos; LID tem 14 ou mais e não
--    começa com 55.
-- =============================================================================

alter table public.conversas
    add column if not exists bloqueada boolean not null default false;

update public.contatos_bloqueados
set telefone = '55' || telefone
where length(telefone) in (10, 11)
  and not exists (
      select 1 from public.contatos_bloqueados b
      where b.user_id = contatos_bloqueados.user_id
        and b.telefone = '55' || contatos_bloqueados.telefone
  );

-- Mesma equivalência de lib/painel.ts `variantesTelefone`: com e sem o nono
-- dígito do celular.
update public.conversas c
set bloqueada = true
from public.contatos_bloqueados b
where b.user_id = c.user_id
  and (
      c.cliente_telefone = b.telefone
      or (length(b.telefone) = 13 and substr(b.telefone, 5, 1) = '9'
          and c.cliente_telefone = substr(b.telefone, 1, 4) || substr(b.telefone, 6))
      or (length(b.telefone) = 12 and substr(b.telefone, 5, 1) between '6' and '9'
          and c.cliente_telefone = substr(b.telefone, 1, 4) || '9' || substr(b.telefone, 5))
  );

update public.conversas
set cliente_telefone = 'lid:' || cliente_telefone
where cliente_telefone ~ '^[0-9]{14,}$'
  and cliente_telefone not like '55%';
