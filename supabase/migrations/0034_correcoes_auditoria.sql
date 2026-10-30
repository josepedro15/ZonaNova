-- =============================================================================
-- ZonaNova — correções da auditoria de segurança (24/10/2026)
--
-- Quatro buracos que só aparecem chamando o PostgREST direto, com a anon key
-- (pública) e o JWT da própria sessão — as telas não os mostram, por isso
-- passaram despercebidos.
--
-- 1. `protege_colunas_de_poder` não protegia nada. Sendo `security definer`,
--    `current_user` dentro dela é o dono da função, nunca `authenticated`, e
--    o primeiro `if` liberava tudo. Quem segurava a escalada era só o grant por
--    coluna da 0003; um `grant update on profiles` futuro abriria papel,
--    unidade e situação para o próprio usuário.
-- 2. Contestação nascia já julgada. O grant de insert valia para a tabela
--    inteira e a política só olhava `contestado_por`: um gestor inseria
--    `veredito = 'procedente'` com `revisado_por` de um supervisor.
-- 3. Conversa bloqueada (pessoal, contato interno, colega) só saía das telas.
--    Conversa, mensagens, análise, aderência e observações do MEC continuavam
--    legíveis pela API para o vendedor e para quem o gere.
-- 4. O cadastro confiava no `unidade_id` de `raw_user_meta_data`, que qualquer
--    `/auth/v1/signup` público escreve. Passa a vir de `raw_app_meta_data`,
--    que só o service role grava (app/actions/auth.ts).
--
-- Validação: tests/rls.sql, bloco "0034".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas de poder: a função passa a rodar como quem chamou
-- -----------------------------------------------------------------------------
-- Com `security invoker`, `current_user` é `authenticated` na sessão do
-- usuário e `service_role`/`postgres` nas server actions, crons e triggers
-- definer (sincronia de gestor_unidades). A função só lê NEW e OLD: não
-- precisa de privilégio nenhum.
alter function public.protege_colunas_de_poder() security invoker;

-- -----------------------------------------------------------------------------
-- 2. Contestação: o gestor escreve o motivo, não o veredito
-- -----------------------------------------------------------------------------
-- Grant por coluna: veredito, revisado_por e revisado_em ficam com o default
-- (pendente, null, null). A política repete a regra — se alguém um dia
-- reabrir o grant da tabela, a segunda tranca continua no lugar.
revoke insert on public.aderencia_contestacoes from authenticated;
grant insert (aderencia_id, contestado_por, motivo) on public.aderencia_contestacoes to authenticated;

drop policy if exists p_contestacoes_insert on public.aderencia_contestacoes;
create policy p_contestacoes_insert on public.aderencia_contestacoes
    for insert to authenticated
    with check (
        contestado_por = auth.uid()
        and veredito = 'pendente'
        and revisado_por is null
        and revisado_em is null
        and public.zn_role() in ('gestor', 'supervisor', 'admin')
        and exists (
            select 1 from public.aderencia_conversa a
            where a.id = aderencia_id
              and a.unidade_id in (select public.zn_unidades_visiveis())
        )
    );

-- O app corta em 1000 (app/actions/gestao.ts); pela API não havia teto.
-- `not valid`: vale para o que entrar daqui em diante, sem reler o histórico.
alter table public.aderencia_contestacoes
    drop constraint if exists ck_contestacoes_motivo;
alter table public.aderencia_contestacoes
    add constraint ck_contestacoes_motivo check (char_length(motivo) <= 1000) not valid;

-- -----------------------------------------------------------------------------
-- 3. Conversa bloqueada some também da API
-- -----------------------------------------------------------------------------
-- Análise, aderência e observação do MEC perguntam SÓ se a conversa está
-- bloqueada, por uma função definer, e seguem com o escopo da própria linha.
-- Passar pela RLS de `conversas` (um `exists` na tabela) herdaria o escopo da
-- conversa: o vendedor transferido de unidade leva a conversa para a unidade
-- nova (zn_conversa_do_contato, 0031), a análise antiga fica na de origem, e o
-- gestor da origem perderia o histórico dela. E um `not exists (… bloqueada)`
-- pela RLS vazaria: a subconsulta não enxergaria a conversa bloqueada.
--
-- A função devolve um booleano por id (uuid aleatório): não abre conversa de
-- ninguém. Sem linha (conversa apagada) conta como não bloqueada; as filhas
-- caem em cascata com ela.
--
-- Bloquear, desbloquear, excluir e o worker usam o service role, que passa
-- por cima da RLS; nenhuma tela lê conversa bloqueada pela sessão.
create or replace function public.zn_conversa_bloqueada(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select c.bloqueada from public.conversas c where c.id = p_conversa), false);
$$;
revoke execute on function public.zn_conversa_bloqueada(uuid) from public, anon;
grant execute on function public.zn_conversa_bloqueada(uuid) to authenticated;
drop policy if exists p_conversas_select on public.conversas;
create policy p_conversas_select on public.conversas
    for select to authenticated
    using (
        public.zn_ativo()
        and not bloqueada
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

drop policy if exists p_mensagens_select on public.mensagens;
create policy p_mensagens_select on public.mensagens
    for select to authenticated
    using (exists (
        select 1 from public.conversas c
        where c.id = mensagens.conversa_id
          and public.zn_ativo()
          and not c.bloqueada
          and (c.user_id = auth.uid() or c.unidade_id in (select public.zn_unidades_visiveis()))
    ));

drop policy if exists p_analises_select on public.analises_conversa;
create policy p_analises_select on public.analises_conversa
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
        and not public.zn_conversa_bloqueada(analises_conversa.conversa_id)
    );

drop policy if exists p_aderencia_select on public.aderencia_conversa;
create policy p_aderencia_select on public.aderencia_conversa
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
        and not public.zn_conversa_bloqueada(aderencia_conversa.conversa_id)
    );

drop policy if exists p_mec_observacoes_select on public.mec_observacoes;
create policy p_mec_observacoes_select on public.mec_observacoes
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
        and not public.zn_conversa_bloqueada(mec_observacoes.conversa_id)
    );

-- -----------------------------------------------------------------------------
-- 4. Cadastro: a unidade vem do app_metadata
-- -----------------------------------------------------------------------------
-- Nome e telefone seguem no user_metadata: são do próprio usuário e ele pode
-- mudá-los depois (grant por coluna da 0003). A unidade decide em que fila de
-- aprovação o cadastro cai, então só vale a que o servidor gravou. Signup
-- direto pela API nasce sem unidade e não aparece para gestor nenhum.
--
-- Ordem de deploy: o código que grava em app_metadata sobe ANTES desta
-- migration (ele grava nos dois lugares), senão cadastro feito no intervalo
-- nasce sem unidade.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, nome, email, telefone, unidade_id)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
        new.email,
        new.raw_user_meta_data->>'telefone',
        nullif(new.raw_app_meta_data->>'unidade_id', '')::uuid
    )
    on conflict (id) do nothing;
    return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
