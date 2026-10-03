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
-- Não basta fazê-lo uma vez: o piloto conecta os números DEPOIS desta
-- migration, e o histórico de A já guardou a conversa com B antes de B
-- conectar. Por isso um trigger em conexoes_whatsapp refaz a mesma marcação
-- sempre que um número é gravado ou trocado.
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

-- O mesmo, a cada número que chega. Quem grava `numero` é a server action de
-- conexão e o cron de checagem, ambos com service role — mas o trigger é
-- SECURITY DEFINER, como os demais de trigger do repositório (0001, 0005): a
-- marcação mexe em conversas de OUTRO utilizador, e sob a RLS de uma sessão
-- comum o UPDATE filtraria em silêncio e deixaria a conversa na tela. O
-- `search_path` fixo fecha o desvio clássico de função definer.
create or replace function public.conversas_bloqueia_numero_de_colega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'UPDATE' and new.numero is not distinct from old.numero then
        return null;
    end if;

    update public.conversas c
    set bloqueada = true
    where c.user_id <> new.user_id
      and not c.bloqueada
      and (
          c.cliente_telefone = new.numero
          or (length(new.numero) = 13 and substr(new.numero, 5, 1) = '9'
              and c.cliente_telefone = substr(new.numero, 1, 4) || substr(new.numero, 6))
          or (length(new.numero) = 12 and substr(new.numero, 5, 1) between '6' and '9'
              and c.cliente_telefone = substr(new.numero, 1, 4) || '9' || substr(new.numero, 5))
      );
    return null;
end;
$$;

-- `update of numero` não dispara quando o cron só mexe no status. O WHEN não
-- pode olhar OLD num trigger que também é de INSERT; a comparação com o valor
-- antigo fica dentro da função.
drop trigger if exists trg_conexao_bloqueia_colega on public.conexoes_whatsapp;
create trigger trg_conexao_bloqueia_colega
    after insert or update of numero on public.conexoes_whatsapp
    for each row
    when (new.numero is not null)
    execute function public.conversas_bloqueia_numero_de_colega();

-- Função nasce com EXECUTE para PUBLIC (doc 8 §8.3). Trigger não precisa de
-- grant: o EXECUTE é conferido quando o trigger é criado, não quando dispara.
revoke all on function public.conversas_bloqueia_numero_de_colega() from public, anon, authenticated;
