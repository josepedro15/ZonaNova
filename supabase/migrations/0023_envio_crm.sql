-- =============================================================================
-- ZonaNova — lead quente vai para o CRM CRPRO (04/10/2026)
--
-- Depois da análise do dia, a negociação quente vira card na etapa Lead do
-- funil da org Zona Nova2 no CRPRO, para o vendedor trabalhar (sem disparo
-- automático). Cada envio é um item próprio da fila, `envio_crm`: herda retry
-- e resgate, e uma falha do CRPRO não derruba a análise nem gasta OpenAI de
-- novo.
--
-- `envios_crm` é a trava contra card repetido. O mesmo cliente é analisado em
-- todo dia que tem mensagem e pode falar com dois vendedores; e o POST /deals
-- do CRPRO com um external_ref conhecido MOVE o card de volta para a etapa
-- pedida — desfaria o que o vendedor já andou no funil. Um telefone, um card.
-- Simulação e envio real têm travas separadas: a semana de simulação não pode
-- impedir o primeiro envio real do mesmo cliente.
--
-- Só o service role lê e escreve.
-- =============================================================================

alter table public.fila_processamento drop constraint if exists fila_processamento_tipo_check;
alter table public.fila_processamento add constraint fila_processamento_tipo_check check (tipo in (
    'analise_conversa', 'relatorio_vendedor', 'rollup_unidade', 'rollup_rede', 'transcricao', 'envio_crm'));

create table if not exists public.envios_crm (
    id               uuid primary key default gen_random_uuid(),
    -- Com o nono dígito quando é celular (lib/crm.ts, telefoneDoCrm).
    telefone         text not null,
    modo             text not null check (modo in ('simulacao', 'envio')),
    conversa_id      uuid references public.conversas(id) on delete set null,
    user_id          uuid references public.profiles(id) on delete set null,
    unidade_id       uuid references public.unidades(id) on delete set null,
    data_ref         date not null,
    crpro_contato_id text,
    crpro_card_id    text,
    created_at       timestamptz not null default now(),
    unique (telefone, modo)
);

alter table public.envios_crm enable row level security;
revoke all on public.envios_crm from anon, authenticated;
