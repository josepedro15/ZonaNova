-- =============================================================================
-- ZonaNova — contatos internos da loja (pedido do piloto Redemac, 02/10/2026)
--
-- O Depósito, o caixa, o financeiro: conversa de trabalho, não atendimento. O
-- bloqueio pessoal (contatos_bloqueados) obrigava cada vendedor a cadastrar o
-- mesmo número. Esta lista é da unidade e vale para todos os vendedores dela.
-- O efeito é o do bloqueio: a mensagem não é guardada, e a conversa que já
-- existia sai das telas por conversas.bloqueada (0015). Nada é apagado.
--
-- Escrita só pelo service role, na server action que confere o gestor (como
-- as demais tabelas de gestão). Leitura: quem enxerga a unidade.
--
-- Também: o número de outro vendedor conectado é conversa de trabalho. O
-- webhook passa a barrá-lo, e as conversas que já existem saem das telas aqui.
-- =============================================================================

create table if not exists public.contatos_internos (
    id          uuid primary key default gen_random_uuid(),
    unidade_id  uuid not null references public.unidades(id) on delete cascade,
    telefone    text not null,
    descricao   text not null check (length(descricao) between 1 and 120),
    criado_por  uuid references public.profiles(id) on delete set null,
    created_at  timestamptz not null default now(),
    unique (unidade_id, telefone)
);

create index if not exists ix_contatos_internos_telefone on public.contatos_internos (telefone);

alter table public.contatos_internos enable row level security;

drop policy if exists p_contatos_internos_select on public.contatos_internos;
create policy p_contatos_internos_select on public.contatos_internos
    for select to authenticated
    using (
        public.zn_ativo()
        and (unidade_id = public.zn_minha_unidade() or unidade_id in (select public.zn_unidades_visiveis()))
    );

revoke all on public.contatos_internos from anon, authenticated;
grant select on public.contatos_internos to authenticated;

-- Conversas já guardadas com o número de um colega conectado saem das telas.
-- Mesma equivalência do nono dígito de 0015.
update public.conversas c
set bloqueada = true
from public.conexoes_whatsapp w
where w.numero is not null
  and w.user_id <> c.user_id
  and (
      c.cliente_telefone = w.numero
      or (length(w.numero) = 13 and substr(w.numero, 5, 1) = '9'
          and c.cliente_telefone = substr(w.numero, 1, 4) || substr(w.numero, 6))
      or (length(w.numero) = 12 and substr(w.numero, 5, 1) between '6' and '9'
          and c.cliente_telefone = substr(w.numero, 1, 4) || '9' || substr(w.numero, 5))
  );
