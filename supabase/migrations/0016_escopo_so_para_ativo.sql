-- =============================================================================
-- ZonaNova — papel e escopo só valem para quem está ativo (revisão 22/09/2026)
--
-- 1. Desativar alguém não encerra a sessão dele. As políticas de conversa,
--    mensagem e relatório já exigiam `zn_ativo()`, mas as que decidem por
--    papel não: um supervisor desativado seguia lendo relatorios_rede,
--    eventos_admin e descobertas, e escrevendo em `unidades`, pelo PostgREST
--    direto. Em vez de remendar política por política, as duas funções de
--    escopo passam a responder "nenhum papel" e "nenhuma unidade" a quem não
--    está ativo — toda política que as usa, hoje e no futuro, herda isso.
--    O que continua valendo para o inativo é só o que é dele: o próprio
--    profile (a tela de aguardando aprovação precisa) e os próprios registros.
--
-- 2. Contestações vazavam entre unidades: qualquer gestor lia o motivo de
--    todas. Agora gestor lê as contestações de aderências que ele enxerga.
-- =============================================================================

create or replace function public.zn_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid() and status = 'ativo';
$$;

create or replace function public.zn_unidades_visiveis()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    select role into v_role from public.profiles where id = auth.uid() and status = 'ativo';

    if v_role in ('supervisor', 'admin') then
        return query select id from public.unidades;
    elsif v_role = 'gestor' then
        return query select unidade_id from public.gestor_unidades where gestor_id = auth.uid();
    end if;
    return;
end;
$$;

drop policy if exists p_contestacoes_select on public.aderencia_contestacoes;
create policy p_contestacoes_select on public.aderencia_contestacoes
    for select to authenticated
    using (
        contestado_por = auth.uid()
        or exists (
            select 1 from public.aderencia_conversa a
            where a.id = aderencia_id
              and a.unidade_id in (select public.zn_unidades_visiveis())
        )
    );
