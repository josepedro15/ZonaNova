-- =============================================================================
-- ZonaNova — revogar os privilégios que o Supabase concede por defeito
--
-- O 0001 e o 0002 concedem privilégios estreitos de propósito: `grant update
-- (nome, telefone) on profiles`, e `grant select (…)` em conexoes_whatsapp
-- deixando `instance_token` de fora. Num Postgres limpo isso restringe.
--
-- No Supabase não restringe nada. O projeto vem com
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated`, então toda tabela criada já nasce com ALL para os dois
-- papéis, e um GRANT posterior só soma — nunca tira. Confirmado no projeto
-- real depois de aplicar 0001+0002: anon e authenticated tinham
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER nas 21 relações.
--
-- Consequência prática: um gestor com acesso de leitura à unidade conseguia
-- `select instance_token from conexoes_whatsapp` — a credencial de WhatsApp
-- cifrada dos vendedores dele. A RLS filtra as LINHAS, e as linhas da unidade
-- ele pode ver; era o grant por coluna que devia barrar a COLUNA, e ele estava
-- afogado pelo defeito do Supabase.
--
-- Aqui zeramos a herança e reconstruímos só o que o 0001 e o 0002 quiseram.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zerar o que veio de graça
-- -----------------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- E impedir que a próxima tabela volte a nascer aberta. O `for role postgres`
-- é necessário: o defeito está registado no dono do schema, e sem nomeá-lo o
-- ALTER só mexe nas defaults do papel que está a correr a migration.
alter default privileges for role postgres in schema public
    revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on functions from anon, authenticated;

-- anon não tem nada a fazer no schema public: quem não está autenticado não lê
-- conversa, relatório nem unidade. Fica só o USAGE, que o PostgREST precisa
-- para introspecção.
grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Reconstruir os grants do 0001
-- -----------------------------------------------------------------------------

grant select on
    public.unidades,
    public.profiles,
    public.gestor_unidades,
    public.conversas,
    public.mensagens,
    public.analises_conversa,
    public.relatorios_diarios,
    public.relatorios_unidade,
    public.relatorios_rede,
    public.fila_processamento,
    public.eventos_admin
to authenticated;

grant select on public.vw_conexoes_status to authenticated;

grant update (nome, telefone) on public.profiles to authenticated;

grant select, insert, update, delete on public.contatos_bloqueados to authenticated;

grant insert, update, delete on public.unidades to authenticated;

-- instance_token continua fora, agora de verdade.
grant select (id, user_id, unidade_id, instance_name, numero, status,
              ultimo_evento_em, created_at, updated_at)
    on public.conexoes_whatsapp to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Reconstruir os grants do 0002
-- -----------------------------------------------------------------------------

grant select on
    public.playbooks,
    public.playbook_etapas,
    public.playbook_itens,
    public.aderencia_conversa,
    public.aderencia_diaria,
    public.aderencia_contestacoes,
    public.descobertas
to authenticated;

grant insert on public.aderencia_contestacoes to authenticated;

-- -----------------------------------------------------------------------------
-- 4. As funções de escopo, que a RLS chama em toda política
-- -----------------------------------------------------------------------------

grant execute on function public.zn_role()              to authenticated;
grant execute on function public.zn_ativo()             to authenticated;
grant execute on function public.zn_unidades_visiveis() to authenticated;
grant execute on function public.zn_minha_unidade()     to authenticated;

-- -----------------------------------------------------------------------------
-- 5. O que este ficheiro NÃO consegue fechar
--
-- As default privileges do schema public existem sob DOIS donos no Supabase:
--
--   dono = postgres        → é o que a secção 1 revoga. Toda tabela criada
--                            pelas migrations (que correm como `postgres`) e
--                            pelo SQL editor do painel passa por aqui.
--   dono = supabase_admin  → continua a conceder ALL a anon e authenticated,
--                            e não temos como a alterar: só o próprio
--                            supabase_admin (superuser) pode, e o `postgres`
--                            do projeto não é superuser.
--
-- Na prática o caminho que usamos está coberto. Mas se alguma tabela em public
-- vier a ser criada por supabase_admin, ela nasce aberta outra vez — e nada
-- aqui avisa. A rede de segurança é a asserção no fim de tests/rls.sql, que
-- falha se qualquer tabela de public conceder privilégio a anon.
-- -----------------------------------------------------------------------------
