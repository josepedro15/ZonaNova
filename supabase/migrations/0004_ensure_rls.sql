-- =============================================================================
-- ZonaNova — versionar o event trigger `ensure_rls`
--
-- Isto não é código novo: já estava no projeto Supabase, criado à mão e sem
-- passar por migration nenhuma. Descoberto ao auditar o banco depois do 0003 —
-- `rls_auto_enable` aparecia em pg_proc sem existir em lado nenhum do repo.
--
-- É útil e fica: liga RLS automaticamente em toda tabela criada em `public`,
-- o que fecha a janela entre `create table` e o `alter table … enable row level
-- security` da migration. Mas drift não versionado é pior que a ausência da
-- funcionalidade: quem recriar o projeto a partir das migrations não o teria,
-- e a diferença só apareceria como uma tabela sem RLS em produção.
--
-- Cuidado: ligar RLS não concede nem revoga privilégio. Uma tabela nova nasce
-- com RLS graças a isto E com os grants que as default privileges do
-- `supabase_admin` ainda dão (ver secção 5 do 0003). As duas coisas são
-- independentes — a guarda no fim de tests/rls.sql é que cobre a segunda.
-- =============================================================================

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
    cmd record;
begin
    for cmd in
        select *
        from pg_event_trigger_ddl_commands()
        where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
          and object_type in ('table', 'partitioned table')
    loop
        if cmd.schema_name is not null
           and cmd.schema_name in ('public')
           and cmd.schema_name not in ('pg_catalog', 'information_schema')
           and cmd.schema_name not like 'pg_toast%'
           and cmd.schema_name not like 'pg_temp%' then
            begin
                execute format('alter table if exists %s enable row level security',
                               cmd.object_identity);
                raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
            exception
                when others then
                    raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
            end;
        else
            raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
                      cmd.object_identity, cmd.schema_name;
        end if;
    end loop;
end;
$function$;

-- `create event trigger` não tem `if not exists`, e no projeto real ele já
-- existe — por isso o guard.
do $$
begin
    if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
        create event trigger ensure_rls
            on ddl_command_end
            when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
            execute function public.rls_auto_enable();
    end if;
end $$;
