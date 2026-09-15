-- =============================================================================
-- ZonaNova — o que a fila precisa para ter retry de verdade e cache de áudio
--
-- Duas colunas que o 0001 não previu, e sem as quais o doc 3 não é
-- implementável como está escrito:
--
-- 1. `fila_processamento.proxima_tentativa_em` — o §3.4 pede "retry com
--    backoff". Sem uma data, backoff não existe: o worker roda de 5 em 5
--    minutos e reprocessaria o item que acabou de falhar, queimando as três
--    tentativas em quinze minutos. Com a data, a falha adia a próxima.
--
-- 2. `mensagens.midia_hash` — o §3.9 pede cache por hash do arquivo, para o
--    mesmo áudio encaminhado não ser transcrito duas vezes. Transcrição é
--    paga; áudio encaminhado entre vendedores da mesma rede não é raro.
-- =============================================================================

alter table public.fila_processamento
    add column if not exists proxima_tentativa_em timestamptz not null default now();

-- O índice parcial do 0001 ordenava por created_at; agora o que importa é
-- quando o item volta a estar elegível.
drop index if exists ix_fila_pendente;
create index if not exists ix_fila_pendente
    on public.fila_processamento (proxima_tentativa_em)
    where status = 'pendente';

alter table public.mensagens
    add column if not exists midia_hash text;

-- Só as já transcritas interessam ao cache: procurar por hash é procurar
-- resposta pronta.
create index if not exists ix_mensagens_midia_hash
    on public.mensagens (midia_hash)
    where midia_hash is not null and transcricao is not null;

-- As colunas novas seguem a regra das outras: o utilizador autenticado lê
-- pelo que o 0003 concedeu (select na tabela inteira), e não escreve nada —
-- quem escreve é o worker, com service role.
