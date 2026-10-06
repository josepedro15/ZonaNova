-- =============================================================================
-- ZonaNova — gestor enxerga só a unidade do próprio perfil (06/10/2026)
--
-- Em produção, uma gestora lia as conversas da Venda Externa: gestor_unidades
-- tinha linhas dela para as 7 unidades da rede, gravadas por fora do app (o app
-- só grava uma, na aprovação e em /admin/unidades). A RLS confiava nessa
-- tabela, então cada linha a mais virava acesso.
--
-- Decisão do usuário: gestor cobre UMA unidade, a do perfil. Quem enxerga a
-- rede é supervisor. Três camadas:
--
-- 1. zn_unidades_visiveis lê a unidade do PERFIL do gestor, não gestor_unidades.
--    Uma linha a mais na tabela já não abre nada pela RLS.
-- 2. gestor_unidades vira reflexo do perfil: um trigger em profiles a mantém
--    (troca de unidade, troca de papel), e outro recusa linha que não seja a
--    unidade do perfil de um gestor. Continua existindo porque o app a lê
--    para montar a equipe e conferir quem cuida da loja.
-- 3. Limpeza do que já entrou errado.
-- =============================================================================

-- 3. Limpeza. Gestor sem unidade no perfil mas com UM vínculo só: o vínculo é a
-- unidade dele, e passa para o perfil. Com mais de um não há como saber qual é
-- — fica sem unidade até o admin escolher em /admin/unidades.
update public.profiles p
set unidade_id = g.unidade_id
from (
    select gestor_id, min(unidade_id::text)::uuid as unidade_id
    from public.gestor_unidades
    group by gestor_id
    having count(*) = 1
) g
where p.id = g.gestor_id
  and p.role = 'gestor'
  and p.unidade_id is null;

delete from public.gestor_unidades g
using public.profiles p
where p.id = g.gestor_id
  and (p.role <> 'gestor' or p.unidade_id is null or g.unidade_id <> p.unidade_id);

-- Vínculo de quem não tem perfil (não deveria existir: a FK é para profiles).
delete from public.gestor_unidades g
where not exists (select 1 from public.profiles p where p.id = g.gestor_id);

insert into public.gestor_unidades (gestor_id, unidade_id)
select id, unidade_id from public.profiles
where role = 'gestor' and unidade_id is not null
on conflict do nothing;

create unique index if not exists ux_gestor_unidades_um_por_gestor
    on public.gestor_unidades (gestor_id);

-- 1. Escopo do gestor = unidade do perfil.
create or replace function public.zn_unidades_visiveis()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_role    text;
    v_unidade uuid;
begin
    select role, unidade_id into v_role, v_unidade
    from public.profiles where id = auth.uid() and status = 'ativo';

    if v_role in ('supervisor', 'admin') then
        return query select id from public.unidades;
    elsif v_role = 'gestor' and v_unidade is not null then
        return next v_unidade;
    end if;
    return;
end;
$$;

-- 2a. Só entra em gestor_unidades a unidade do perfil de um gestor. Vale para
-- o service role também: foi por fora do app que a linha errada entrou.
create or replace function public.gestor_unidades_so_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.profiles p
        where p.id = new.gestor_id
          and p.role = 'gestor'
          and p.unidade_id = new.unidade_id
    ) then
        raise exception
            'Gestor cobre só a unidade do próprio perfil. Troque a unidade em /admin/unidades.'
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_gestor_unidades_so_do_perfil on public.gestor_unidades;
create trigger trg_gestor_unidades_so_do_perfil
    before insert or update on public.gestor_unidades
    for each row execute function public.gestor_unidades_so_do_perfil();

-- 2b. Perfil manda: trocar unidade ou papel refaz o vínculo. A aprovação e
-- /admin/unidades não precisam mais gravar gestor_unidades.
create or replace function public.profiles_sincroniza_gestor_unidades()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.gestor_unidades
    where gestor_id = new.id
      and (new.role <> 'gestor' or new.unidade_id is null or unidade_id <> new.unidade_id);

    if new.role = 'gestor' and new.unidade_id is not null then
        insert into public.gestor_unidades (gestor_id, unidade_id)
        values (new.id, new.unidade_id)
        on conflict do nothing;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_profiles_sincroniza_gestor_unidades on public.profiles;
create trigger trg_profiles_sincroniza_gestor_unidades
    after insert or update of role, unidade_id on public.profiles
    for each row execute function public.profiles_sincroniza_gestor_unidades();

-- Funções nascem com EXECUTE para PUBLIC (doc 8 §8.3). As de trigger não
-- precisam de grant; zn_unidades_visiveis mantém o da 0006.
revoke all on function public.gestor_unidades_so_do_perfil() from public, anon, authenticated;
revoke all on function public.profiles_sincroniza_gestor_unidades() from public, anon, authenticated;
