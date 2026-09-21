-- =============================================================================
-- 0008 — O agendamento sai do Vercel e passa a morar no banco.
--
-- O plano Hobby do Vercel só aceita cron diário, e a fila precisa rodar de 5
-- em 5 minutos. Esse foi o empurrão; a razão de ficar assim é melhor: o
-- horário passa a viver no mesmo banco que o estado que ele mexe, dá para ler
-- cron.job_run_details quando um dia não fecha, e mudar horário deixa de
-- exigir deploy.
--
-- As rotas /api/cron/* não mudaram: continuam rotas HTTP comuns, fechadas pelo
-- mesmo `Authorization: Bearer ${CRON_SECRET}`. Só trocou quem aperta o botão.
--
-- PRÉ-REQUISITO, fora desta migration de propósito: dois segredos no Vault.
-- Não entram aqui porque este ficheiro é versionado no git.
--
--   select vault.create_secret('<o CRON_SECRET>',            'cron_secret');
--   select vault.create_secret('https://zona-nova.vercel.app','app_url');
--
-- Os jobs leem os dois em tempo de EXECUÇÃO, não de agendamento: trocar o
-- segredo ou o domínio é um update no Vault, sem remarcar nada.
-- =============================================================================

create extension if not exists pg_cron;
-- pg_net ignora o `with schema` e cria o seu próprio schema `net`.
create extension if not exists pg_net;

-- Dispara uma rota de cron da aplicação. Concentrada numa função para os dois
-- agendamentos não repetirem a montagem do cabeçalho — e para o dia em que o
-- `fechar-dia` e o `expurgo` existirem, acrescentar job ser uma linha.
--
-- Mora em `public` e não em `cron`: no Supabase o schema `cron` pertence ao
-- `supabase_admin`, e o papel que aplica as migrations não escreve lá dentro.
create or replace function public.disparar_rota_cron(rota text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    base    text;
    segredo text;
begin
    select decrypted_secret into base    from vault.decrypted_secrets where name = 'app_url';
    select decrypted_secret into segredo from vault.decrypted_secrets where name = 'cron_secret';

    -- Falhar alto: sem segredo a rota responde 401 e o job "passa" todo dia
    -- sem fazer nada. Um erro no cron.job_run_details é visível; uma sequência
    -- de 401 silenciosos não é.
    if base is null or segredo is null then
        raise exception 'faltam os segredos app_url/cron_secret no Vault';
    end if;

    return net.http_get(
        url     => base || rota,
        headers => jsonb_build_object('Authorization', 'Bearer ' || segredo),
        timeout_milliseconds => 60000
    );
end;
$$;

revoke all on function public.disparar_rota_cron(text) from public;

-- Horários em UTC, como o resto do doc 4 §4.4.
select cron.schedule('zn-processar-fila',  '*/5 * * * *', $$ select public.disparar_rota_cron('/api/cron/processar-fila')  $$);
select cron.schedule('zn-checar-conexoes', '0 */2 * * *', $$ select public.disparar_rota_cron('/api/cron/checar-conexoes') $$);

-- `fechar-dia` (30 2 * * *) e `expurgo` (0 5 1 * *) ficam de fora até as rotas
-- existirem. Agendar o que ainda não foi escrito faz o banco bater numa 404
-- todo dia e dá a impressão, no painel de jobs, de que estão cobertos.
