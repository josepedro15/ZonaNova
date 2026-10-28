-- =============================================================================
-- ZonaNova — produtos que a rede não trabalha e sem alternativa (28/10/2026)
--
-- A análise cobrava "não sugeriu alternativa de produto" quando a rede não tem
-- o produto nem nada parecido para oferecer (Silas, 27/10). O admin mantém a
-- lista em /admin/produtos; quando um item dela aparece na conversa, a análise
-- recebe a regra e o erro sai (lib/sem-alternativa.ts). Vale para a rede toda.
--
-- Só o service role toca, como custos_ia (0034): a tela confere que quem pede
-- é admin, e o worker lê com a chave de serviço.
-- =============================================================================

create table if not exists public.produtos_sem_alternativa (
    id          uuid primary key default gen_random_uuid(),
    produto     text not null check (length(btrim(produto)) between 2 and 80),
    observacao  text check (observacao is null or length(observacao) <= 200),
    criado_por  uuid references public.profiles(id) on delete set null,
    created_at  timestamptz not null default now()
);

-- "Porcelanato 120x120" e "porcelanato 120X120" são o mesmo produto.
create unique index if not exists ux_produtos_sem_alternativa_produto
    on public.produtos_sem_alternativa (lower(btrim(produto)));

alter table public.produtos_sem_alternativa enable row level security;
revoke all on public.produtos_sem_alternativa from anon, authenticated;
