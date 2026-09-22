-- =============================================================================
-- ZonaNova — reabertura sem execução dupla e limite de tentativas
-- (terceira revisão, 22/09/2026)
--
-- 1. `fila_processamento.reaberto` + `zn_reabrir_item`. Reabrir um passo da
--    cadeia (relatório, unidade, rede) quando algo antes dele mudou é o que
--    mantém o dia correto com retries. Mas reabrir voltando para `pendente` um
--    item que estava RODANDO fazia ele rodar de novo em seguida — pagando a
--    OpenAI duas vezes pelo mesmo relatório. Agora:
--      - item parado (pendente, concluído, ignorado, falhou): volta a pendente;
--      - item rodando: só ganha `reaberto = true`. O worker limpa a marca ao
--        começar a execução; se ela voltar a aparecer até o fim, é porque algo
--        mudou DEPOIS do início, e aí sim o item volta para a fila.
--    Num único comando, para não haver janela entre ler o status e escrever.
--
-- 2. `limites_acesso` + `zn_consumir_limite`. O cadastro usa
--    `auth.admin.createUser`, que passa por fora do rate limit do Supabase: um
--    script criava milhares de contas pendentes. Login e recuperação de senha
--    saem todos do IP do servidor, então o limite por IP do Supabase era um só
--    para a rede inteira. Janela fixa por chave (ip:…, email:…), contada no
--    banco porque é o único estado que todas as instâncias da Vercel dividem.
--
-- As duas funções são só do service role: nada aqui é chamado pelo navegador.
-- =============================================================================

alter table public.fila_processamento
    add column if not exists reaberto boolean not null default false;

create or replace function public.zn_reabrir_item(p_tipo text, p_referencia uuid, p_data date)
returns void
language sql
security invoker
set search_path = public
as $$
    insert into public.fila_processamento (tipo, referencia_id, data_ref, status, tentativas, proxima_tentativa_em)
    values (p_tipo, p_referencia, p_data, 'pendente', 0, now())
    on conflict (tipo, referencia_id, data_ref) do update set
        reaberto             = (fila_processamento.status = 'processando'),
        status               = case when fila_processamento.status = 'processando' then 'processando' else 'pendente' end,
        tentativas           = case when fila_processamento.status = 'processando' then fila_processamento.tentativas else 0 end,
        ultimo_erro          = case when fila_processamento.status = 'processando' then fila_processamento.ultimo_erro else null end,
        processado_em        = case when fila_processamento.status = 'processando' then fila_processamento.processado_em else null end,
        proxima_tentativa_em = case when fila_processamento.status = 'processando' then fila_processamento.proxima_tentativa_em else now() end;
$$;

create table if not exists public.limites_acesso (
    chave     text primary key,
    inicio    timestamptz not null default now(),
    contagem  integer not null default 0
);

alter table public.limites_acesso enable row level security;
revoke all on public.limites_acesso from anon, authenticated;

-- true = pode seguir; false = estourou o limite desta janela.
create or replace function public.zn_consumir_limite(p_chave text, p_max integer, p_janela_segundos integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_contagem integer;
begin
    insert into public.limites_acesso as l (chave, inicio, contagem)
    values (p_chave, now(), 1)
    on conflict (chave) do update set
        inicio   = case when l.inicio < now() - make_interval(secs => p_janela_segundos) then now() else l.inicio end,
        contagem = case when l.inicio < now() - make_interval(secs => p_janela_segundos) then 1 else l.contagem + 1 end
    returning contagem into v_contagem;

    -- Faxina ocasional: chave parada há um dia não limita mais nada.
    if random() < 0.01 then
        delete from public.limites_acesso where inicio < now() - interval '1 day';
    end if;

    return v_contagem <= p_max;
end;
$$;

revoke all on function public.zn_reabrir_item(text, uuid, date) from public, anon, authenticated;
revoke all on function public.zn_consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.zn_reabrir_item(text, uuid, date) to service_role;
grant execute on function public.zn_consumir_limite(text, integer, integer) to service_role;
