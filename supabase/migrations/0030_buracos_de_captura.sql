-- =============================================================================
-- ZonaNova — buracos de captura: "conectada", mas nada chega (auditoria de 07/10/2026)
--
-- O Vitor ficou de 07/10 10:56 até 08/10 07:35 sem nenhuma mensagem gravada,
-- nas duas direções, embora tenha negociado no período. A conexão seguia
-- `conectada` no checar-conexoes e `ultimo_evento_em` não mudou — ele só é
-- gravado em evento de conexão, nunca em mensagem. Nada no banco permitia ver
-- o buraco a não ser lendo as conversas.
--
-- 1. `conexoes_whatsapp.ultima_mensagem_em`: a hora da última mensagem do
--    vendedor, mantida por trigger como o `conversas.ultima_mensagem_em` (0005),
--    para a reentrega não precisar ler-e-escrever na aplicação.
-- 2. `buracos_captura`: o silêncio que o checar-conexoes detecta (lib/captura.ts),
--    com o que a recuperação conseguiu. `inicio` é a última mensagem antes do
--    buraco; `fim`, a primeira depois (nulo enquanto aberto). Só o service role
--    lê e escreve: o gestor vê o alerta pela view e o dia pelo relatório.
-- 3. `conexoes_whatsapp.silencio_desde`: o `inicio` do buraco aberto, para o
--    painel do gestor alertar sem ler a tabela de buracos.
-- 4. `relatorios_diarios.captura_incompleta`: o dia do vendedor teve buraco no
--    expediente. A IA e o gestor não podem ler esse silêncio como abandono.
--
-- Ordem: aplicar ANTES do deploy. O checar-conexoes e o fechamento do dia
-- leem e gravam estas colunas.
-- =============================================================================

alter table public.conexoes_whatsapp
    add column if not exists ultima_mensagem_em timestamptz,
    add column if not exists silencio_desde timestamptz;

alter table public.relatorios_diarios
    add column if not exists captura_incompleta boolean not null default false;

-- -----------------------------------------------------------------------------
-- 1. A última mensagem da conexão
-- -----------------------------------------------------------------------------

-- Mensagem com relógio adiantado (o `enviada_em` vem do aparelho) não pode
-- empurrar a última mensagem para o futuro e esconder um silêncio: o teto é now().
-- O `where … <` evita escrever (e travar a linha da conexão) quando a mensagem
-- é antiga, que é o caso de todo o histórico.
create or replace function public.conexao_marca_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    quando timestamptz := least(new.enviada_em, now());
begin
    update public.conexoes_whatsapp w
       set ultima_mensagem_em = quando
      from public.conversas c
     where c.id = new.conversa_id
       and w.user_id = c.user_id
       and (w.ultima_mensagem_em is null or w.ultima_mensagem_em < quando);
    return new;
end;
$$;

drop trigger if exists trg_conexao_marca_mensagem on public.mensagens;
create trigger trg_conexao_marca_mensagem
    after insert on public.mensagens
    for each row execute function public.conexao_marca_mensagem();

revoke all on function public.conexao_marca_mensagem() from public, anon, authenticated;

-- O que já está no banco.
update public.conexoes_whatsapp w
   set ultima_mensagem_em = x.ultima
  from (select c.user_id, least(max(m.enviada_em), now()) ultima
          from public.mensagens m
          join public.conversas c on c.id = m.conversa_id
         group by c.user_id) x
 where x.user_id = w.user_id
   and w.ultima_mensagem_em is distinct from x.ultima;

-- -----------------------------------------------------------------------------
-- 2. Os buracos
-- -----------------------------------------------------------------------------

create table if not exists public.buracos_captura (
    id                  uuid primary key default gen_random_uuid(),
    conexao_id          uuid not null references public.conexoes_whatsapp(id) on delete cascade,
    user_id             uuid not null references public.profiles(id) on delete cascade,
    unidade_id          uuid not null references public.unidades(id) on delete restrict,
    inicio              timestamptz not null,
    fim                 timestamptz,
    detectado_em        timestamptz not null default now(),
    -- O que a /message/find achou e reinjetou, somado entre as tentativas.
    tentativas          integer not null default 0,
    encontradas         integer not null default 0,
    recuperadas         integer not null default 0,
    -- Por que a última tentativa não reinjetou (lib/captura.ts ResultadoRecuperacao).
    motivo              text,
    -- Erros de entrega do webhook desde o início do buraco (GET /webhook/errors),
    -- sem payload: 401/5xx ou fila cheia apontam o webhook; vazio, a sessão.
    erros_webhook       jsonb,
    -- Histórico pedido ao celular depois de fechado o buraco, e para quantas conversas.
    historico_pedido_em timestamptz,
    historico_conversas integer,
    updated_at          timestamptz not null default now(),
    check (fim is null or fim >= inicio)
);

-- Um buraco aberto por conexão: é ele que a próxima rodada atualiza.
create unique index if not exists ux_buracos_captura_aberto
    on public.buracos_captura (conexao_id) where fim is null;
create index if not exists ix_buracos_captura_user
    on public.buracos_captura (user_id, inicio);

alter table public.buracos_captura enable row level security;
revoke all on public.buracos_captura from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. O alerta do gestor
-- -----------------------------------------------------------------------------

create or replace view public.vw_conexoes_status
with (security_invoker = true) as
select id, user_id, unidade_id, numero, status, ultimo_evento_em, updated_at,
       historico_status, historico_ultimo_em, ultima_mensagem_em, silencio_desde
from public.conexoes_whatsapp;

grant select (ultima_mensagem_em, silencio_desde)
    on public.conexoes_whatsapp to authenticated;
grant select on public.vw_conexoes_status to authenticated;
