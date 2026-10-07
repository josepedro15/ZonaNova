-- =============================================================================
-- ZonaNova — imagem e documento na análise (07/10/2026)
--
-- O vendedor manda o orçamento em PDF ou foto e a análise só via
-- "[Mídia: documento]". Duas colunas em `mensagens`:
--
--   midia_nome       o nome do arquivo do documento, vindo do webhook
--                    ("orçamento dos cromados.pdf"). De graça.
--   midia_descricao  uma linha gerada a partir do arquivo (imagem pelo modelo
--                    com visão; PDF pelo texto das primeiras páginas). Paga,
--                    e só nas unidades de `MIDIA_UNIDADES`.
--
-- A descrição é um item próprio da fila, `descricao_midia`: herda retry e
-- resgate, e falhar não impede a análise — a conversa sai como hoje.
--
-- O índice serve o cache por hash: a mesma foto de catálogo encaminhada por
-- vários vendedores é descrita uma vez só.
--
-- Aplicar ANTES de ligar `MIDIA_UNIDADES`. O código deste deploy roda sem a
-- migração: o webhook grava sem o nome se a coluna não existir, e o worker só
-- lê as colunas novas na unidade ligada.
-- =============================================================================

alter table public.mensagens
    add column if not exists midia_nome      text,
    add column if not exists midia_descricao text;

create index if not exists ix_mensagens_midia_hash_descricao
    on public.mensagens (midia_hash)
    where midia_hash is not null and midia_descricao is not null;

alter table public.fila_processamento drop constraint if exists fila_processamento_tipo_check;
alter table public.fila_processamento add constraint fila_processamento_tipo_check check (tipo in (
    'analise_conversa', 'relatorio_vendedor', 'rollup_unidade', 'rollup_rede', 'transcricao', 'envio_crm', 'descricao_midia'));
