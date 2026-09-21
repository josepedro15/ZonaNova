-- Remove qualquer política permissiva que possa ter sido aplicada durante o
-- desenvolvimento. Observações são escritas apenas por server action validada.
drop policy if exists p_observacoes_insert on public.observacoes_gestor;
revoke insert, update, delete on public.observacoes_gestor from authenticated;

-- O estado de sincronização é visível na view, sem expor credenciais.
alter table public.conexoes_whatsapp
    add column if not exists historico_status text not null default 'nao_solicitado'
        check (historico_status in ('nao_solicitado', 'recebendo', 'recebido')),
    add column if not exists historico_ultimo_em timestamptz;

create or replace view public.vw_conexoes_status
with (security_invoker = true) as
select id, user_id, unidade_id, numero, status, ultimo_evento_em, updated_at,
       historico_status, historico_ultimo_em
from public.conexoes_whatsapp;

grant select (historico_status, historico_ultimo_em)
    on public.conexoes_whatsapp to authenticated;
grant select on public.vw_conexoes_status to authenticated;
