# Pedidos do piloto Redemac — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atender o que o Silas (Redemac Zona Nova) pediu no grupo NEXO & ZONA NOVA em 02/10/2026 antes de o piloto (2 vendedores + 1 gestor por unidade, 14–16 contas) começar.

**Architecture:** Tudo cabe no desenho atual. O "fora da análise" continua sendo um flag só (`conversas.bloqueada`), agora alimentado por três listas: a pessoal (já existe), a interna da unidade (nova tabela `contatos_internos`) e os números dos colegas conectados (`conexoes_whatsapp.numero`). "Retomar contato" é uma consulta nova no dashboard sobre dados que já existem (`analises_conversa`). O perfil do cliente entra no schema da análise e fica no `payload`, sem migração.

**Tech Stack:** Next.js 16 (App Router, server components e server actions), Supabase (Postgres + RLS), supabase-js, zod 4, testes com `node --test` (TypeScript direto, sem build).

**Spec:** não há spec separada. A fonte são as mensagens do Silas e a análise feita na sessão de 03/10/2026, resumidas aqui:

| Pedido | Tarefa |
|---|---|
| 2 novas unidades: Venda Externa e Pisos Matriz | Tarefa 0 (operacional, sem código) |
| Botão "Responder" abrir a conversa no WhatsApp Web | Tarefa 1 |
| Lista de exclusão para contatos internos da loja (ex.: Depósito) — José respondeu "Conseguimos sim" | Tarefas 2 a 5 |
| Aba "Retomar contato", com símbolo de atenção, para quem está há 30 dias sem conversa — José respondeu "Da pra fazer sim" | Tarefas 6 e 7 |
| Profissão do cliente no nome do contato (mensagem cortada no "Ler mais") | Tarefa 8 (pela IA, não pelo nome) |
| Lista quente → campanha no CRPRO | **Fora deste plano** (ver o fim) |

## Global Constraints

- Todo texto de tela, comentário e mensagem de commit em português do Brasil, no tom do resto do código (comentário explica o porquê, não o quê).
- Arquivo em `lib/` coberto por teste importa outros arquivos de `lib/` pelo caminho relativo **com** `.ts` (`./painel.ts`), nunca por `@/lib/...`: os testes rodam em `node --test` sem o alias do Next.
- Conversa e mensagem só são escritas pelo service role (`criarClienteAdmin`). Server action confere papel e escopo antes de escrever, e grava em `eventos_admin` quando é ação de gestão.
- Nada é apagado por exclusão: a conversa sai das telas por `bloqueada = true` e volta quando nenhuma lista a cobre mais.
- Conversão continua inferida pela IA. Nenhuma tarefa depende de ERP.
- Comandos de verificação: `npm run test:unidade`, `npm run typecheck`, `npm run lint`, e `npm run test:rls` (Supabase local, depois de `npm run db:reset`) quando a tarefa mexe em migração.
- Base: a branch `redesign/redemac` (o dashboard e as `secoes.tsx` que este plano edita são as do redesign). Trabalhe num worktree próprio (superpowers:using-git-worktrees).

---

### Tarefa 0: Novas unidades e capacidade do piloto (operacional, sem código)

**Files:** nenhum.

- [ ] **Passo 1: Criar as unidades**

Logado como admin em produção, abra `/admin/unidades` e crie "Venda Externa" e "Pisos Matriz", com cidade e UF. A action `criarUnidade` (`app/actions/operacao.ts:36`) já grava em `eventos_admin`.

- [ ] **Passo 2: Decidir o piloto do MEC para as unidades novas**

O detalhe do MEC é ligado por unidade na variável `MEC_DETALHE_UNIDADES` (lida em `app/api/cron/processar-fila/route.ts:385`). Pergunte ao Silas se a **Venda Externa** segue o Book: o vendedor externo não atende balcão, e as etapas de acolhida e solução completa podem não caber. Só depois disso acrescente (ou não) os ids das unidades novas à variável na Vercel.

- [ ] **Passo 3: Conferir a capacidade**

1. Na UAZAPI, confira se o plano atual comporta 16 instâncias.
2. No SQL do Supabase de produção, estime o custo mensal de OpenAI por vendedor:

```sql
select round(sum(custo_estimado) / nullif(count(distinct user_id), 0) / 14 * 30, 2) as custo_mes_por_vendedor
from analises_conversa
where data_ref > current_date - 14;
```

Multiplique por 16 e anote o resultado na task do ClickUp.

---

### Tarefa 1: "Responder" abre o WhatsApp Web no computador

`wa.me` no computador para numa página intermediária. No celular ele abre o app direto, e é isso que queremos manter. O servidor decide pelo User-Agent.

**Files:**
- Modify: `lib/painel.ts` (acrescentar `ehCelular` e `linkWhatsapp` depois de `semTelefone`)
- Modify: `app/(app)/dashboard/secoes.tsx:48-56` (`destinoDaEspera` → `destinoResponder`), `ItemEspera`, `EsperandoVoce`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/conversas/[id]/page.tsx:123-125`
- Test: `tests/unidade/painel.test.ts`

**Interfaces:**
- Produces: `ehCelular(userAgent: string | null | undefined): boolean` e `linkWhatsapp(telefone: string, celular: boolean): string | null`, em `lib/painel.ts`. Também `destinoResponder(c: { id: string; cliente_telefone: string }, celular: boolean)`, interno de `secoes.tsx` e usado de novo na Tarefa 7.

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/unidade/painel.test.ts`, acrescente `ehCelular, linkWhatsapp` ao import de `../../lib/painel.ts` e, no fim do arquivo:

```ts
// --- responder ---------------------------------------------------------------

test('responder no computador abre direto o WhatsApp Web', () => {
    assert.equal(linkWhatsapp('5554998124471', false), 'https://web.whatsapp.com/send?phone=5554998124471');
});

test('responder no celular abre o app pelo wa.me', () => {
    assert.equal(linkWhatsapp('5554998124471', true), 'https://wa.me/5554998124471');
});

// Um wa.me com os dígitos de um LID abriria uma pessoa qualquer.
test('contato @lid não ganha link de WhatsApp', () => {
    assert.equal(linkWhatsapp('lid:123456789012345', false), null);
    assert.equal(linkWhatsapp('lid:123456789012345', true), null);
});

test('celular é reconhecido pelo User-Agent; na dúvida, computador', () => {
    assert.equal(ehCelular('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'), true);
    assert.equal(ehCelular('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Mobile Safari/537.36'), true);
    assert.equal(ehCelular('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), false);
    assert.equal(ehCelular('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0'), false);
    assert.equal(ehCelular(null), false);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/painel.test.ts`
Expected: FAIL, porque `linkWhatsapp` e `ehCelular` não são exportados.

- [ ] **Passo 3: Implementar**

Em `lib/painel.ts`, logo depois de `export const semTelefone = ...`:

```ts
/** Celular ou tablet pelo User-Agent. Na dúvida, computador. */
export function ehCelular(userAgent: string | null | undefined): boolean {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? '');
}

/**
 * Para onde "Responder" leva. No celular, `wa.me` abre o app na conversa; no
 * computador ele para numa página intermediária, então vai direto ao WhatsApp
 * Web. Contato `@lid` não tem número: null, e quem chama decide o destino.
 */
export function linkWhatsapp(telefone: string, celular: boolean): string | null {
    if (semTelefone(telefone)) return null;
    const d = telefone.replace(/\D/g, '');
    return celular ? `https://wa.me/${d}` : `https://web.whatsapp.com/send?phone=${d}`;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `node --test tests/unidade/painel.test.ts`
Expected: PASS, todos os testes.

- [ ] **Passo 5: Usar no dashboard**

Em `app/(app)/dashboard/secoes.tsx`, troque o bloco das linhas 48-56 (comentário e `destinoDaEspera`) por:

```ts
/**
 * Resposta acontece no WhatsApp: no celular, o app; no computador, o WhatsApp
 * Web. Contato `@lid` não tem telefone, e um link com aqueles dígitos abriria
 * uma pessoa qualquer; aí vai para a conversa no painel.
 */
function destinoResponder(c: { id: string; cliente_telefone: string }, celular: boolean): { href: string; target?: string; rel?: string } {
    const href = linkWhatsapp(c.cliente_telefone, celular);
    return href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href: `/conversas/${c.id}` };
}
```

No import de `@/lib/painel`, acrescente `linkWhatsapp`. Remova `semTelefone` do import se o lint apontá-lo como não usado.

Em `ItemEspera`, mude a assinatura e a primeira linha:

```tsx
function ItemEspera({ conversa, espera, celular }: { conversa: ConversaComMensagens; espera: number; celular: boolean }) {
    const destino = destinoResponder(conversa, celular);
```

Em `EsperandoVoce`, acrescente `celular` às props:

```tsx
export function EsperandoVoce({ className = '', titulo, esperando, celular }: {
    className?: string; titulo: string; esperando: { conversa: ConversaComMensagens; espera: number }[]; celular: boolean;
}) {
```

Depois troque **todas** as ocorrências de `<ItemEspera key={e.conversa.id} {...e} />` por `<ItemEspera key={e.conversa.id} {...e} celular={celular} />`. São duas: a lista visível e a de dentro do `<details>`.

Em `app/(app)/dashboard/page.tsx`:
1. Acrescente `import { headers } from 'next/headers';`.
2. Acrescente `ehCelular` ao import de `@/lib/painel`.
3. Logo depois de `const dataRef = dataEmSaoPaulo(agora);`, inclua:

```ts
    const celular = ehCelular((await headers()).get('user-agent'));
```

4. Passe a prop: `<EsperandoVoce esperando={esperando} celular={celular} titulo={...} />`.

- [ ] **Passo 6: Usar na conversa**

Em `app/(app)/conversas/[id]/page.tsx`:
1. Acrescente `import { headers } from 'next/headers';`.
2. Acrescente `ehCelular, linkWhatsapp` ao import de `@/lib/painel`.
3. Logo depois de `if (!conversa) notFound();`, inclua:

```ts
    const responder = linkWhatsapp(conversa.cliente_telefone, ehCelular((await headers()).get('user-agent')));
```

4. Troque o bloco

```tsx
                        {!semTelefone(conversa.cliente_telefone) && (
                            <BotaoLink href={`https://wa.me/${conversa.cliente_telefone.replace(/\D/g, '')}`} externo>Responder no WhatsApp</BotaoLink>
                        )}
```

por

```tsx
                        {responder && <BotaoLink href={responder} externo>Responder no WhatsApp</BotaoLink>}
```

Remova `semTelefone` do import se não sobrar uso.

- [ ] **Passo 7: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.

Em seguida, com `npm run dev:demo` aberto em `http://localhost:3100/dashboard`:
- no computador, o "Responder" de um item de "Esperando você" aponta para `https://web.whatsapp.com/send?phone=...`;
- com o preset mobile do navegador e a página recarregada, aponta para `https://wa.me/...`.

- [ ] **Passo 8: Commit**

```bash
git add lib/painel.ts tests/unidade/painel.test.ts "app/(app)/dashboard/secoes.tsx" "app/(app)/dashboard/page.tsx" "app/(app)/conversas/[id]/page.tsx"
git commit -m "feat: Responder abre o WhatsApp Web no computador e o app no celular"
```

---

### Tarefa 2: Regra única de "contato fora da análise"

Hoje a regra está espalhada: o webhook consulta a lista pessoal, e o desbloqueio recalcula sozinho. Com três listas, ela vira uma função pura, testada, usada por todos.

**Files:**
- Create: `lib/exclusao.ts`
- Test: `tests/unidade/exclusao.test.ts`

**Interfaces:**
- Consumes: `variantesTelefone` de `lib/painel.ts`.
- Produces: `type ListasDeExclusao = { pessoais: string[]; internos: string[]; colegas: string[] }` e `estaFora(telefone: string, listas: ListasDeExclusao): boolean`.

- [ ] **Passo 1: Escrever os testes que falham**

Crie `tests/unidade/exclusao.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaFora } from '../../lib/exclusao.ts';

const VAZIAS = { pessoais: [], internos: [], colegas: [] };

test('ninguém nas listas: contato entra na análise', () => {
    assert.equal(estaFora('5554998124471', VAZIAS), false);
});

test('lista pessoal do vendedor tira o contato', () => {
    assert.equal(estaFora('5554998124471', { ...VAZIAS, pessoais: ['5554998124471'] }), true);
});

// O Depósito cadastrado pelo gestor vale para todos os vendedores da loja.
test('lista interna da loja tira o contato', () => {
    assert.equal(estaFora('5554932100001', { ...VAZIAS, internos: ['5554932100001'] }), true);
});

test('número de colega conectado é conversa de trabalho', () => {
    assert.equal(estaFora('5554991112222', { ...VAZIAS, colegas: ['5554991112222'] }), true);
});

// O JID chega sem o nono dígito; o gestor digitou com ele.
test('casa com e sem o nono dígito, nos dois sentidos', () => {
    assert.equal(estaFora('555498124471', { ...VAZIAS, internos: ['5554998124471'] }), true);
    assert.equal(estaFora('5554998124471', { ...VAZIAS, colegas: ['555498124471'] }), true);
});

test('contato @lid só casa com o próprio identificador', () => {
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['lid:123456789012345'] }), true);
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['123456789012345'] }), false);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/exclusao.test.ts`
Expected: FAIL, "Cannot find module ... lib/exclusao.ts".

- [ ] **Passo 3: Implementar**

Crie `lib/exclusao.ts`:

```ts
import { variantesTelefone } from './painel.ts';

/**
 * As três razões para uma conversa não ser atendimento:
 * - `pessoais`: a lista do próprio vendedor (contatos_bloqueados);
 * - `internos`: a lista da unidade, cadastrada pelo gestor (Depósito, caixa);
 * - `colegas`: o número de outro vendedor conectado — conversa de trabalho.
 */
export type ListasDeExclusao = { pessoais: string[]; internos: string[]; colegas: string[] };

/**
 * O contato está fora da análise? Uma regra só para o webhook, o bloqueio e o
 * desbloqueio: se cada um decidisse do seu jeito, tirar o Depósito da lista
 * pessoal o devolvia ao painel mesmo ele estando na lista da loja.
 *
 * Compara com e sem o nono dígito, como o bloqueio pessoal já fazia.
 */
export function estaFora(telefone: string, listas: ListasDeExclusao): boolean {
    const dele = new Set(variantesTelefone(telefone));
    return [...listas.pessoais, ...listas.internos, ...listas.colegas]
        .some((t) => variantesTelefone(t).some((v) => dele.has(v)));
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `node --test tests/unidade/exclusao.test.ts`
Expected: PASS, 6 testes.

- [ ] **Passo 5: Commit**

```bash
git add lib/exclusao.ts tests/unidade/exclusao.test.ts
git commit -m "feat: regra única de contato fora da análise (pessoal, loja e colega)"
```

---

### Tarefa 3: Tabela `contatos_internos` com RLS

**Files:**
- Create: `supabase/migrations/0022_contatos_internos.sql`
- Modify: `supabase/seed/dev_seed.sql` (fim do arquivo)
- Modify: `tests/rls.sql` (fim do arquivo)
- Modify: `docs/02-modelo-de-dados.md` (seção de tabelas de conversa/bloqueio)

**Interfaces:**
- Produces: a tabela `public.contatos_internos(id uuid, unidade_id uuid not null, telefone text, descricao text, criado_por uuid, created_at timestamptz)`, com `unique (unidade_id, telefone)`. `authenticated` só lê; escrever é exclusivo do service role.

- [ ] **Passo 1: Escrever o teste de RLS que falha**

No fim de `supabase/seed/dev_seed.sql`:

```sql
insert into public.contatos_internos (unidade_id, telefone, descricao) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '5554932100001', 'Depósito Centro'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '5554932100002', 'Depósito Bento')
on conflict do nothing;
```

No fim de `tests/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 0022: contatos internos — cada loja lê a própria lista; ninguém escreve
-- ---------------------------------------------------------------------------
set role authenticated;
select pg_temp.como('44444444-4444-4444-4444-444444444444');
select pg_temp.ok('vendedor vê a lista interna da própria loja',
       (select count(*) from contatos_internos), 1);
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor NÃO vê a lista de loja que não gerencia',
       (select count(*) from contatos_internos where unidade_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0);
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor vê a lista da rede',
       (select count(*) from contatos_internos), 2);
reset role;

do $$
begin
    if has_table_privilege('authenticated', 'public.contatos_internos', 'insert')
       or has_table_privilege('authenticated', 'public.contatos_internos', 'delete')
    then raise notice 'FALHOU  authenticated escreve em contatos_internos';
    else raise notice 'PASSOU  contatos_internos só se escreve pelo service role'; end if;
    if has_table_privilege('anon', 'public.contatos_internos', 'select')
    then raise notice 'FALHOU  anon lê contatos_internos';
    else raise notice 'PASSOU  anon fora de contatos_internos'; end if;
end $$;
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run db:reset`
Expected: o seed falha com `relation "public.contatos_internos" does not exist`.

- [ ] **Passo 3: Escrever a migração**

Crie `supabase/migrations/0022_contatos_internos.sql`:

```sql
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
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run db:reset && npm run test:rls`
Expected: todas as linhas `PASSOU`, inclusive as cinco novas. A checagem "authenticated escreve só nas tabelas previstas" continua `PASSOU`, porque a tabela nova não dá escrita ao `authenticated`.

- [ ] **Passo 5: Conferir o formato de `numero` em produção**

O `update` de colegas e o webhook (Tarefa 4) supõem `conexoes_whatsapp.numero` em E.164 sem `+`, do jeito que `cliente_telefone` é gravado. No SQL de produção, **somente leitura**:

```sql
select numero, length(numero) from conexoes_whatsapp where numero is not null limit 10;
```

Expected: só dígitos, 12 ou 13 caracteres, começando com `55`. Se vier com sufixo (`@s.whatsapp.net`) ou `+`, **pare** e normalize na escrita (`app/actions/conexao.ts:119`) antes de seguir.

- [ ] **Passo 6: Documentar**

Em `docs/02-modelo-de-dados.md`, no fim da seção `### \`contatos_bloqueados\`` (antes do próximo `###`), acrescente:

```markdown
### `contatos_internos`

Lista da unidade com os números de trabalho (Depósito, caixa, financeiro). Vale
para todos os vendedores da unidade e tem o mesmo efeito do bloqueio pessoal: o
webhook não guarda a mensagem, e a conversa que já existia ganha
`bloqueada = true`. O número de outro vendedor conectado (`conexoes_whatsapp.numero`)
é tratado do mesmo jeito, sem cadastro. Leitura por escopo de unidade; escrita
só pelo service role (`app/actions/internos.ts`). Migração 0022.
```

- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations/0022_contatos_internos.sql supabase/seed/dev_seed.sql tests/rls.sql docs/02-modelo-de-dados.md
git commit -m "feat: tabela de contatos internos da loja com RLS"
```

---

### Tarefa 4: Webhook não guarda contato interno nem número de colega

**Files:**
- Modify: `lib/uazapi/ingestao.ts:53-64` (dentro de `processarMensagem`)

**Interfaces:**
- Consumes: a tabela `contatos_internos` (Tarefa 3) e `variantesTelefone` de `@/lib/painel`.

- [ ] **Passo 1: Implementar**

Em `lib/uazapi/ingestao.ts`, troque o bloco das linhas 53-64 (do comentário "Contato bloqueado é escolha do vendedor" até `if (bloqueado?.length) return;`) por:

```ts
    // Contato fora da análise não é guardado: barrar aqui e não na análise
    // evita guardar o que pediram para não ser guardado. Três listas, a mesma
    // regra de lib/exclusao.ts:
    // - a pessoal do vendedor ("isto não é atendimento");
    // - a interna da loja (Depósito, caixa), cadastrada pelo gestor;
    // - o número de outro vendedor conectado: conversa de trabalho.
    // Compara com e sem o nono dígito: o JID e o que foi digitado nem sempre concordam.
    const variantes = variantesTelefone(m.clienteTelefone);
    const [pessoal, interno, colega] = await Promise.all([
        supabase.from('contatos_bloqueados').select('id').eq('user_id', conexao.user_id).in('telefone', variantes).limit(1),
        supabase.from('contatos_internos').select('id').eq('unidade_id', conexao.unidade_id).in('telefone', variantes).limit(1),
        supabase.from('conexoes_whatsapp').select('id').neq('id', conexao.id).in('numero', variantes).limit(1),
    ]);
    // Falha de leitura não é "pode guardar": lançar mantém a entrada em
    // webhook_entrada para o worker tentar de novo.
    for (const r of [pessoal, interno, colega]) if (r.error) throw r.error;
    if (pessoal.data?.length || interno.data?.length || colega.data?.length) return;
```

- [ ] **Passo 2: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.

- [ ] **Passo 3: Verificar de ponta a ponta (local)**

Com `npm run db:reset` feito e o app rodando (`npm run dev` + `npm run tunel`, como na doc 10), cadastre no SQL local:

```sql
insert into contatos_internos (unidade_id, telefone, descricao)
values ('<unidade do vendedor de teste>', '<número de um celular seu>', 'Teste interno');
```

Mande uma mensagem desse celular para o número conectado e espere ~10 s.

Expected: `select count(*) from conversas where cliente_telefone like '%<final do número>'` continua 0. Depois apague a linha de teste.

- [ ] **Passo 4: Commit**

```bash
git add lib/uazapi/ingestao.ts
git commit -m "feat: webhook barra contato interno da loja e número de colega"
```

---

### Tarefa 5: Gestor cadastra a lista interna; desbloqueio respeita as três listas

**Files:**
- Create: `lib/exclusao-dados.ts`
- Create: `app/actions/internos.ts`
- Create: `app/(app)/perfil/contatos-internos.tsx`
- Modify: `app/actions/conexao.ts:213-239` (`desbloquearContato`)
- Modify: `app/(app)/perfil/page.tsx`

**Interfaces:**
- Consumes: `estaFora` (Tarefa 2), tabela `contatos_internos` (Tarefa 3), `telefoneE164` e `variantesTelefone` de `@/lib/painel`.
- Produces:
  - `liberarConversas(admin, filtro: { userId?: string; unidadeId?: string }, telefones: string[]): Promise<void>` em `lib/exclusao-dados.ts`;
  - server actions `adicionarContatoInterno(form)` (campos `unidadeId`, `telefone`, `descricao`) e `removerContatoInterno(form)` (campo `id`);
  - o componente `ContatosInternos`.

- [ ] **Passo 1: `liberarConversas`**

Crie `lib/exclusao-dados.ts`:

```ts
import 'server-only';
import type { criarClienteAdmin } from '@/lib/supabase/admin';
import { estaFora } from '@/lib/exclusao';

type Admin = ReturnType<typeof criarClienteAdmin>;
type Candidata = { id: string; user_id: string; unidade_id: string; cliente_telefone: string };

/**
 * Devolve às telas as conversas com estes telefones que nenhuma lista cobre
 * mais. Serve ao desbloqueio pessoal e à remoção de contato interno: tirar o
 * Depósito da lista pessoal não pode devolvê-lo ao painel enquanto ele estiver
 * na lista da loja, nem um colega conectado.
 */
export async function liberarConversas(admin: Admin, filtro: { userId?: string; unidadeId?: string }, telefones: string[]): Promise<void> {
    if (!telefones.length) return;
    let consulta = admin.from('conversas').select('id,user_id,unidade_id,cliente_telefone')
        .eq('bloqueada', true).in('cliente_telefone', telefones);
    if (filtro.userId) consulta = consulta.eq('user_id', filtro.userId);
    if (filtro.unidadeId) consulta = consulta.eq('unidade_id', filtro.unidadeId);
    const { data: candidatas, error } = await consulta.returns<Candidata[]>();
    if (error) throw error;
    if (!candidatas?.length) return;

    const usuarios = [...new Set(candidatas.map((c) => c.user_id))];
    const unidades = [...new Set(candidatas.map((c) => c.unidade_id))];
    const [pessoais, internos, conexoes] = await Promise.all([
        admin.from('contatos_bloqueados').select('user_id,telefone').in('user_id', usuarios)
            .returns<{ user_id: string; telefone: string }[]>(),
        admin.from('contatos_internos').select('unidade_id,telefone').in('unidade_id', unidades)
            .returns<{ unidade_id: string; telefone: string }[]>(),
        admin.from('conexoes_whatsapp').select('user_id,numero').not('numero', 'is', null)
            .returns<{ user_id: string; numero: string }[]>(),
    ]);
    for (const r of [pessoais, internos, conexoes]) if (r.error) throw r.error;

    const liberar = candidatas.filter((c) => !estaFora(c.cliente_telefone, {
        pessoais: (pessoais.data ?? []).filter((p) => p.user_id === c.user_id).map((p) => p.telefone),
        internos: (internos.data ?? []).filter((i) => i.unidade_id === c.unidade_id).map((i) => i.telefone),
        colegas: (conexoes.data ?? []).filter((x) => x.user_id !== c.user_id).map((x) => x.numero),
    })).map((c) => c.id);
    if (!liberar.length) return;
    const { error: erroLiberar } = await admin.from('conversas').update({ bloqueada: false }).in('id', liberar);
    if (erroLiberar) throw erroLiberar;
}
```

- [ ] **Passo 2: O desbloqueio pessoal passa a usar a regra única**

Em `app/actions/conexao.ts`, dentro de `desbloquearContato`, troque o bloco

```ts
    if (removido) {
        // Outro bloqueio pode cobrir o mesmo número (com e sem o nono dígito):
        // o que ele cobre continua bloqueado.
        const { data: restantes } = await admin.from('contatos_bloqueados').select('telefone').eq('user_id', user.id)
            .returns<{ telefone: string }[]>();
        const aindaCobertos = new Set((restantes ?? []).flatMap((r) => variantesTelefone(r.telefone)));
        const liberar = variantesTelefone(removido.telefone).filter((t) => !aindaCobertos.has(t));
        if (liberar.length) {
            await admin.from('conversas').update({ bloqueada: false })
                .eq('user_id', user.id).in('cliente_telefone', liberar);
        }
    }
```

por

```ts
    // Outro bloqueio (com ou sem o nono dígito), a lista da loja ou um colega
    // conectado podem cobrir o mesmo número: o que eles cobrem continua fora.
    if (removido) await liberarConversas(admin, { userId: user.id }, variantesTelefone(removido.telefone));
```

E acrescente no topo `import { liberarConversas } from '@/lib/exclusao-dados';`.

- [ ] **Passo 3: As server actions da lista interna**

Crie `app/actions/internos.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { telefoneE164, variantesTelefone } from '@/lib/painel';
import { liberarConversas } from '@/lib/exclusao-dados';

const UUID = /^[0-9a-f-]{36}$/i;

/** Quem mexe na lista da unidade: o gestor dela, supervisor e admin — ativos. */
async function quemCuida(unidadeId: string) {
    if (!UUID.test(unidadeId)) return null;
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = criarClienteAdmin();
    const { data: p } = await admin.from('profiles').select('role,status').eq('id', user.id)
        .maybeSingle<{ role: string; status: string }>();
    if (p?.status !== 'ativo') return null;
    if (p.role === 'supervisor' || p.role === 'admin') return { admin, userId: user.id };
    if (p.role !== 'gestor') return null;
    const { count } = await admin.from('gestor_unidades').select('unidade_id', { count: 'exact', head: true })
        .eq('gestor_id', user.id).eq('unidade_id', unidadeId);
    return count ? { admin, userId: user.id } : null;
}

function revalidar() {
    for (const caminho of ['/perfil', '/dashboard', '/conversas', '/equipe']) revalidatePath(caminho);
}

export async function adicionarContatoInterno(form: FormData) {
    const unidadeId = String(form.get('unidadeId') ?? '');
    const telefone = telefoneE164(String(form.get('telefone') ?? '')).slice(0, 20);
    const descricao = String(form.get('descricao') ?? '').trim().slice(0, 120);
    if (telefone.length < 8 || !descricao) return;
    const ctx = await quemCuida(unidadeId);
    if (!ctx) return;
    const { error } = await ctx.admin.from('contatos_internos')
        .upsert({ unidade_id: unidadeId, telefone, descricao, criado_por: ctx.userId }, { onConflict: 'unidade_id,telefone' });
    if (error) throw error;
    // O que já chegou sai das telas e da análise, sem ser apagado.
    const { error: erroBloqueio } = await ctx.admin.from('conversas').update({ bloqueada: true })
        .eq('unidade_id', unidadeId).in('cliente_telefone', variantesTelefone(telefone));
    if (erroBloqueio) throw erroBloqueio;
    await ctx.admin.from('eventos_admin').insert({
        actor_id: ctx.userId, acao: 'adicionou_contato_interno', alvo_id: unidadeId, detalhes: { telefone, descricao },
    });
    revalidar();
}

export async function removerContatoInterno(form: FormData) {
    const id = String(form.get('id') ?? '');
    if (!UUID.test(id)) return;
    const { data: alvo } = await criarClienteAdmin().from('contatos_internos').select('unidade_id,telefone,descricao').eq('id', id)
        .maybeSingle<{ unidade_id: string; telefone: string; descricao: string }>();
    if (!alvo) return;
    const ctx = await quemCuida(alvo.unidade_id);
    if (!ctx) return;
    const { error } = await ctx.admin.from('contatos_internos').delete().eq('id', id);
    if (error) throw error;
    await liberarConversas(ctx.admin, { unidadeId: alvo.unidade_id }, variantesTelefone(alvo.telefone));
    await ctx.admin.from('eventos_admin').insert({
        actor_id: ctx.userId, acao: 'removeu_contato_interno', alvo_id: alvo.unidade_id, detalhes: { telefone: alvo.telefone, descricao: alvo.descricao },
    });
    revalidar();
}
```

- [ ] **Passo 4: A seção na tela de configurações do gestor**

Para o gestor, o item "Configurações" do menu é o `/perfil`. A seção entra ali, logo abaixo de "Contatos fora da análise".

Crie `app/(app)/perfil/contatos-internos.tsx`:

```tsx
import type { criarClienteServidor } from '@/lib/supabase/server';
import { telefoneBonito } from '@/lib/painel';
import { adicionarContatoInterno, removerContatoInterno } from '@/app/actions/internos';

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Unidade = { id: string; nome: string };
type Interno = { id: string; unidade_id: string; telefone: string; descricao: string };

/** As lojas cuja lista a pessoa cuida: as que gerencia, ou a rede para supervisor e admin. */
async function unidadesQueCuida(supabase: Supabase, userId: string, role: string): Promise<Unidade[]> {
    if (role === 'gestor') {
        const { data } = await supabase.from('gestor_unidades').select('unidades(id,nome)').eq('gestor_id', userId)
            .returns<{ unidades: Unidade | null }[]>();
        return (data ?? []).flatMap((g) => (g.unidades ? [g.unidades] : []));
    }
    const { data } = await supabase.from('unidades').select('id,nome').eq('ativa', true).order('nome').returns<Unidade[]>();
    return data ?? [];
}

export async function ContatosInternos({ supabase, userId, role }: { supabase: Supabase; userId: string; role: string }) {
    const unidades = await unidadesQueCuida(supabase, userId, role);
    if (!unidades.length) return null;
    const { data: internos } = await supabase.from('contatos_internos').select('id,unidade_id,telefone,descricao')
        .in('unidade_id', unidades.map((u) => u.id)).order('created_at', { ascending: false }).returns<Interno[]>();
    const nomeDa = new Map(unidades.map((u) => [u.id, u.nome]));
    return (
        <section className="mt-5 rounded-card border border-linha bg-superficie p-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="display text-lg font-semibold">Contatos internos da loja</h2>
                    <p className="mt-1 text-[12px] text-tinta-2">Depósito, caixa, financeiro: ficam fora da análise para todos os vendedores da loja.</p>
                </div>
                <span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs font-semibold">{internos?.length ?? 0}</span>
            </div>
            <form action={adicionarContatoInterno} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
                {unidades.length === 1 ? (
                    <input type="hidden" name="unidadeId" value={unidades[0].id} />
                ) : (
                    <select name="unidadeId" required className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm">
                        {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                )}
                <input name="telefone" required inputMode="tel" placeholder="Telefone com DDD" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                <input name="descricao" required maxLength={120} placeholder="Quem é (ex.: Depósito)" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                <button className="rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Adicionar</button>
            </form>
            <div className="mt-4 divide-y divide-linha">
                {(internos ?? []).map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-4 py-3">
                        <div>
                            <p className="text-sm font-semibold">{i.descricao}</p>
                            <p className="text-xs text-tinta-3">{telefoneBonito(i.telefone)} · {nomeDa.get(i.unidade_id) ?? 'Loja'}</p>
                        </div>
                        <form action={removerContatoInterno}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs font-semibold text-petroleo">Remover</button>
                        </form>
                    </div>
                ))}
                {!internos?.length && <p className="py-4 text-sm text-tinta-3">Nenhum contato interno cadastrado.</p>}
            </div>
            <p className="mt-3 text-[12px] text-tinta-3">Os números dos vendedores conectados já ficam fora automaticamente.</p>
        </section>
    );
}
```

Em `app/(app)/perfil/page.tsx`:
1. Acrescente `import { ContatosInternos } from './contatos-internos';`.
2. Logo depois do fechamento da `<section>` de "Contatos fora da análise", inclua:

```tsx
                {perfil.role !== 'vendedor' && <ContatosInternos supabase={supabase} userId={user.id} role={perfil.role} />}
```

- [ ] **Passo 5: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.

Com o banco local (`npm run db:reset`) e `npm run dev`, entre como a gestora do seed (Carla, unidade Centro):
1. Em `/perfil`, a seção mostra "Depósito Centro".
2. Adicione `(54) 9 9134-7702`, o telefone da conversa do seed `cccccccc-...-0001`, com a descrição "Teste". Expected: `select bloqueada from conversas where id = 'cccccccc-0000-0000-0000-000000000001'` → `true`.
3. Remova o item. Expected: `bloqueada` volta a `false`.

- [ ] **Passo 6: Commit**

```bash
git add lib/exclusao-dados.ts app/actions/internos.ts app/actions/conexao.ts "app/(app)/perfil/contatos-internos.tsx" "app/(app)/perfil/page.tsx"
git commit -m "feat: gestor cadastra os contatos internos da loja"
```

---

### Tarefa 6: Regra do "Retomar contato"

Critério combinado com o Silas: 30 dias sem conversa. O resto é decisão deste plano, a validar com ele:
- só negociações ainda em aberto pela última análise (`em_andamento`, `lead_frio`, `sem_resposta`). Venda feita, perdida, encerrada, suporte e social ficam de fora;
- teto de 90 dias, para a lista não virar arquivo morto;
- ordem: potencial alto primeiro, depois a maior nota de oportunidade, depois quem esfriou mais recentemente (é mais fácil de recuperar).

**Files:**
- Create: `lib/retomar.ts`
- Test: `tests/unidade/retomar.test.ts`

**Interfaces:**
- Produces: as constantes `DIAS_PARA_RETOMAR = 30` e `DIAS_LIMITE_RETOMAR = 90`; os tipos `AnaliseResumo`, `CandidataRetomar` e `ItemRetomar`; `janelaRetomar(agora: Date): { de: Date; ate: Date }`; e `paraRetomar(conversas: CandidataRetomar[], agora: Date): ItemRetomar[]`.

- [ ] **Passo 1: Escrever os testes que falham**

Crie `tests/unidade/retomar.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { janelaRetomar, paraRetomar, type AnaliseResumo, type CandidataRetomar } from '../../lib/retomar.ts';

const AGORA = new Date('2026-10-03T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA).toISOString();

const analise = (extra: Partial<AnaliseResumo> = {}): AnaliseResumo => ({
    data_ref: '2026-08-20', tipo_conversa: 'negociacao', status: 'em_andamento', potencial_venda: 'medio', score_oportunidade: 50, ...extra,
});
const conversa = (id: string, dias: number, analises: AnaliseResumo[] = [analise()]): CandidataRetomar => ({
    id, cliente_nome: id, cliente_telefone: '5554998124471', ultima_mensagem_em: haDias(dias), analises_conversa: analises,
});

test('negociação em aberto parada há 31 dias entra', () => {
    const itens = paraRetomar([conversa('a', 31)], AGORA);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].dias, 31);
});

test('29 dias ainda não é contato frio', () => {
    assert.equal(paraRetomar([conversa('a', 29)], AGORA).length, 0);
});

test('mais de 90 dias sai da lista', () => {
    assert.equal(paraRetomar([conversa('a', 91)], AGORA).length, 0);
});

test('venda feita, perdida e encerrada não pedem retomada', () => {
    for (const status of ['venda_feita', 'perdida', 'encerrada']) {
        assert.equal(paraRetomar([conversa('a', 40, [analise({ status })])], AGORA).length, 0, status);
    }
});

test('lead frio e sem resposta pedem retomada', () => {
    for (const status of ['lead_frio', 'sem_resposta']) {
        assert.equal(paraRetomar([conversa('a', 40, [analise({ status })])], AGORA).length, 1, status);
    }
});

test('suporte, social e conversa sem análise ficam de fora', () => {
    assert.equal(paraRetomar([conversa('a', 40, [analise({ tipo_conversa: 'suporte' })])], AGORA).length, 0);
    assert.equal(paraRetomar([conversa('b', 40, [analise({ tipo_conversa: 'social' })])], AGORA).length, 0);
    assert.equal(paraRetomar([conversa('c', 40, [])], AGORA).length, 0);
});

// A conversa estava em andamento e, no último dia analisado, virou venda.
test('vale a análise mais recente', () => {
    const analises = [analise({ data_ref: '2026-08-20', status: 'em_andamento' }), analise({ data_ref: '2026-08-25', status: 'venda_feita' })];
    assert.equal(paraRetomar([conversa('a', 35, analises)], AGORA).length, 0);
});

test('ordem: potencial alto, depois oportunidade, depois quem esfriou mais recentemente', () => {
    const itens = paraRetomar([
        conversa('medio-antigo', 60, [analise({ potencial_venda: 'medio', score_oportunidade: 90 })]),
        conversa('alto-baixo', 50, [analise({ potencial_venda: 'alto', score_oportunidade: 40 })]),
        conversa('alto-alto', 70, [analise({ potencial_venda: 'alto', score_oportunidade: 80 })]),
        conversa('medio-recente', 31, [analise({ potencial_venda: 'medio', score_oportunidade: 90 })]),
    ], AGORA);
    assert.deepEqual(itens.map((i) => i.conversa.id), ['alto-alto', 'alto-baixo', 'medio-recente', 'medio-antigo']);
});

test('a janela da consulta é de 90 a 30 dias atrás', () => {
    const { de, ate } = janelaRetomar(AGORA);
    assert.equal(de.toISOString(), haDias(90));
    assert.equal(ate.toISOString(), haDias(30));
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/retomar.test.ts`
Expected: FAIL, "Cannot find module ... lib/retomar.ts".

- [ ] **Passo 3: Implementar**

Crie `lib/retomar.ts`:

```ts
/**
 * "Retomar contato": a negociação que esfriou. O cliente está há pelo menos
 * 30 dias sem conversa com o vendedor (combinado com a Redemac em 02/10/2026),
 * a última análise não a deu por vendida, perdida nem encerrada, e ela ainda
 * não passou de 90 dias — depois disso a lista vira arquivo morto.
 *
 * Sai sozinha: quando o vendedor escreve, `ultima_mensagem_em` anda e a
 * conversa deixa de ter 30 dias.
 */
export const DIAS_PARA_RETOMAR = 30;
export const DIAS_LIMITE_RETOMAR = 90;

const DIA = 24 * 60 * 60 * 1000;
const EM_ABERTO = new Set(['em_andamento', 'lead_frio', 'sem_resposta']);
const PESO_POTENCIAL: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

export type AnaliseResumo = {
    data_ref: string;
    tipo_conversa: string | null;
    status: string | null;
    potencial_venda: string | null;
    score_oportunidade: number | null;
};

export type CandidataRetomar = {
    id: string;
    cliente_nome: string | null;
    cliente_telefone: string;
    ultima_mensagem_em: string;
    analises_conversa?: AnaliseResumo[];
};

export type ItemRetomar = { conversa: CandidataRetomar; dias: number; analise: AnaliseResumo };

/** O intervalo de `ultima_mensagem_em` que a consulta deve buscar. */
export function janelaRetomar(agora: Date): { de: Date; ate: Date } {
    return {
        de: new Date(agora.getTime() - DIAS_LIMITE_RETOMAR * DIA),
        ate: new Date(agora.getTime() - DIAS_PARA_RETOMAR * DIA),
    };
}

export function paraRetomar(conversas: CandidataRetomar[], agora: Date): ItemRetomar[] {
    const { de, ate } = janelaRetomar(agora);
    return conversas
        .flatMap((c): ItemRetomar[] => {
            const quando = new Date(c.ultima_mensagem_em);
            if (quando > ate || quando < de) return [];
            // A última análise diz como a negociação ficou.
            const analise = [...(c.analises_conversa ?? [])].sort((a, b) => b.data_ref.localeCompare(a.data_ref))[0];
            if (!analise || analise.tipo_conversa !== 'negociacao' || !EM_ABERTO.has(analise.status ?? '')) return [];
            return [{ conversa: c, dias: Math.floor((agora.getTime() - quando.getTime()) / DIA), analise }];
        })
        .sort((a, b) =>
            (PESO_POTENCIAL[a.analise.potencial_venda ?? ''] ?? 3) - (PESO_POTENCIAL[b.analise.potencial_venda ?? ''] ?? 3)
            || (b.analise.score_oportunidade ?? 0) - (a.analise.score_oportunidade ?? 0)
            || a.dias - b.dias);
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `node --test tests/unidade/retomar.test.ts`
Expected: PASS, 9 testes.

- [ ] **Passo 5: Commit**

```bash
git add lib/retomar.ts tests/unidade/retomar.test.ts
git commit -m "feat: regra do Retomar contato (30 a 90 dias, negociação em aberto)"
```

---

### Tarefa 7: Seção "Retomar contato" no dashboard do vendedor

**Files:**
- Modify: `app/(app)/dashboard/secoes.tsx` (novo componente `RetomarContato` depois de `EsperandoVoce`)
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `docs/05-mapa-de-telas.md` (seção do dashboard do vendedor)

**Interfaces:**
- Consumes: `destinoResponder` (Tarefa 1), `DIAS_PARA_RETOMAR`, `janelaRetomar`, `paraRetomar`, `CandidataRetomar` e `ItemRetomar` (Tarefa 6).
- Produces: `type AcaoRetomar = { proxima_acao?: string }` e `RetomarContato({ className?, itens: ItemRetomar[], acoes: Map<string, AcaoRetomar>, celular: boolean })`. A chave do mapa é `` `${conversa.id}|${analise.data_ref}` ``. A Tarefa 8 estende `AcaoRetomar`.

- [ ] **Passo 1: O componente**

Em `app/(app)/dashboard/secoes.tsx`, acrescente o import:

```ts
import { DIAS_PARA_RETOMAR, type ItemRetomar } from '@/lib/retomar';
```

E, logo depois do fim da função `EsperandoVoce`:

```tsx
/** O que a última análise sugeriu fazer, para o vendedor não retomar no escuro. */
export type AcaoRetomar = { proxima_acao?: string };

export const chaveRetomar = (i: ItemRetomar) => `${i.conversa.id}|${i.analise.data_ref}`;

function ItemRetomarContato({ item, acao, celular }: { item: ItemRetomar; acao?: AcaoRetomar; celular: boolean }) {
    const { conversa, dias, analise } = item;
    const destino = destinoResponder(conversa, celular);
    return (
        <li className="border-t border-linha-2">
            <a {...destino} className="flex min-h-11 items-center gap-3.5 py-3 text-tinta">
                <Avatar nome={conversa.cliente_nome} />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{conversa.cliente_nome ?? telefoneBonito(conversa.cliente_telefone)}</span>
                        {analise.potencial_venda === 'alto' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.azul}`}>Potencial alto</span>}
                    </span>
                    <span className="truncate text-[13px] text-tinta-3">{acao?.proxima_acao || 'Sem próxima ação sugerida'}</span>
                </span>
                <span className={`whitespace-nowrap rounded-ctl px-2.5 py-1 text-[12.5px] font-bold ${SELO.atencao}`}>{dias} dias</span>
                <span className="hidden items-center gap-1.5 rounded-ctl border border-linha px-3 py-2 text-[12.5px] font-semibold text-azul sm:inline-flex">
                    Retomar<Icone nome={destino.target ? 'externo' : 'seta_direita'} tamanho={14} />
                </span>
            </a>
        </li>
    );
}

export function RetomarContato({ className = '', itens, acoes, celular }: {
    className?: string; itens: ItemRetomar[]; acoes: Map<string, AcaoRetomar>; celular: boolean;
}) {
    const item = (i: ItemRetomar) => <ItemRetomarContato key={i.conversa.id} item={i} acao={acoes.get(chaveRetomar(i))} celular={celular} />;
    return (
        <Cartao className={`flex flex-col gap-2 ${className}`}>
            <div>
                <h3 className="display flex items-center gap-2.5 text-lg font-bold">
                    <Icone nome="alerta" tamanho={18} className="shrink-0 text-atencao-texto" />Retomar contato
                    {itens.length > 0 && <Selo tom="atencao">{itens.length}</Selo>}
                </h3>
                <p className="mt-1 text-[13px] text-tinta-3">
                    {itens.length
                        ? `Negociações sem conversa há mais de ${DIAS_PARA_RETOMAR} dias. Uma mensagem agora pode reabrir a venda.`
                        : `Negociação em aberto que ficar mais de ${DIAS_PARA_RETOMAR} dias sem conversa aparece aqui.`}
                </p>
            </div>
            {itens.length > 0 && <ul className="flex flex-col">{itens.slice(0, VISIVEIS).map(item)}</ul>}
            {itens.length > VISIVEIS && (
                <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-azul group-open:hidden">
                        Ver os outros {itens.length - VISIVEIS}<Icone nome="seta_direita" tamanho={14} />
                    </summary>
                    <ul className="flex flex-col">{itens.slice(VISIVEIS).map(item)}</ul>
                </details>
            )}
        </Cartao>
    );
}
```

`Avatar`, `Cartao`, `Icone`, `SELO`, `Selo` e `telefoneBonito` já estão importados em `secoes.tsx`.

- [ ] **Passo 2: A consulta no dashboard**

Em `app/(app)/dashboard/page.tsx`:

1. Imports:

```ts
import { janelaRetomar, paraRetomar, type CandidataRetomar } from '@/lib/retomar';
```

E acrescente `RetomarContato, chaveRetomar, type AcaoRetomar` ao import de `./secoes`.

2. Depois de `const celular = ...` (Tarefa 1):

```ts
    const frias = janelaRetomar(agora);
```

3. Acrescente um 7º item ao `Promise.all` e o nome `{ data: candidatas }` na desestruturação:

```ts
        // Só as conversas do próprio vendedor: a lista é o que ELE tem para retomar.
        supabase.from('conversas')
            .select('id, cliente_nome, cliente_telefone, ultima_mensagem_em, analises_conversa(data_ref, tipo_conversa, status, potencial_venda, score_oportunidade)')
            .eq('user_id', user!.id).eq('bloqueada', false)
            .gte('ultima_mensagem_em', frias.de.toISOString()).lt('ultima_mensagem_em', frias.ate.toISOString())
            .order('ultima_mensagem_em', { ascending: false }).limit(500).returns<CandidataRetomar[]>(),
```

4. Depois do cálculo de `esperando`:

```ts
    // Cinquenta bastam: uma lista de trezentos ninguém percorre.
    const retomar = paraRetomar(candidatas ?? [], agora).slice(0, 50);
    // A próxima ação vem do payload da MESMA análise que pôs a conversa na lista.
    const { data: payloads } = retomar.length
        ? await supabase.from('analises_conversa').select('conversa_id,data_ref,payload')
            .in('conversa_id', retomar.map((r) => r.conversa.id))
            .in('data_ref', [...new Set(retomar.map((r) => r.analise.data_ref))])
            .returns<{ conversa_id: string; data_ref: string; payload: AcaoRetomar | null }[]>()
        : { data: [] as { conversa_id: string; data_ref: string; payload: AcaoRetomar | null }[] };
    const acoes = new Map((payloads ?? []).map((p) => [`${p.conversa_id}|${p.data_ref}`, p.payload ?? {}]));
```

`chaveRetomar` produz a mesma chave. Se o lint reclamar que `chaveRetomar` não é usado na página, tire-o do import da página: ele é usado dentro de `secoes.tsx`.

5. Na coluna da esquerda, logo depois de `<EsperandoVoce ... />`:

```tsx
                        <RetomarContato itens={retomar} acoes={acoes} celular={celular} />
```

- [ ] **Passo 3: Documentar a tela**

Em `docs/05-mapa-de-telas.md`, no fim da seção `### 4. Dashboard do vendedor — /dashboard` (antes do próximo `###`), acrescente:

```markdown
- **Retomar contato** — negociações em aberto (pela última análise) sem conversa
  há 30 a 90 dias, com a próxima ação sugerida e o botão que abre o WhatsApp.
  Potencial alto primeiro. Sai da lista sozinha quando o vendedor escreve.
  Regra em `lib/retomar.ts`.
```

- [ ] **Passo 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.

Na demo (`npm run dev:demo`, `http://localhost:3100/dashboard`), a seção aparece com o estado vazio: a demo não tem conversa de 30+ dias com análise em aberto. Para ver a seção cheia no banco local, rode no SQL:

```sql
update conversas set ultima_mensagem_em = now() - interval '35 days'
where id = 'cccccccc-0000-0000-0000-000000000001';
insert into analises_conversa (conversa_id, user_id, unidade_id, data_ref, tipo_conversa, status, potencial_venda, score_oportunidade, payload)
values ('cccccccc-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        current_date - 35, 'negociacao', 'lead_frio', 'alto', 80, '{"proxima_acao":"Mandar o orçamento do porcelanato revisado"}')
on conflict (conversa_id, data_ref) do nothing;
```

Entre como Rafael (`rafael@zonanova.com.br`). Expected: "Retomar contato" com Márcia Toledo, "Potencial alto", "35 dias" e a próxima ação. Tire um screenshot para a task do ClickUp.

- [ ] **Passo 5: Commit**

```bash
git add "app/(app)/dashboard/secoes.tsx" "app/(app)/dashboard/page.tsx" docs/05-mapa-de-telas.md
git commit -m "feat: seção Retomar contato no dashboard do vendedor"
```

---

### Tarefa 8: Perfil e profissão do cliente pela IA

O nome do contato vem do `pushName`, o nome que o próprio cliente pôs no WhatsApp dele (`lib/uazapi/normalizar.ts:118`). Salvar "Pedro Carpinteiro" na agenda do vendedor não chega até nós. Por isso a IA lê o que o cliente disse ("sou pedreiro", "é pra obra de um cliente meu").

Esta tarefa é independente das outras. Se a mensagem completa do Silas (cortada no "Ler mais") pedir outra coisa, pule-a.

**Files:**
- Modify: `lib/analise.ts` (`schemaAnalise` e `schemaJsonAnalise`)
- Modify: `lib/openai-analise.ts` (instruções de `analisarConversa`)
- Modify: `lib/visual.ts` (nova `rotuloPerfilCliente`)
- Modify: `app/(app)/conversas/[id]/page.tsx` (tipo `Payload` e linha `sobre`)
- Modify: `app/(app)/dashboard/secoes.tsx` (`AcaoRetomar` e `ItemRetomarContato`)
- Test: `tests/unidade/analise.test.ts`, `tests/unidade/visual.test.ts`

**Interfaces:**
- Consumes: `AcaoRetomar` e `ItemRetomarContato` (Tarefa 7).
- Produces:
  - no resultado da análise (e no `payload`), os campos `perfil_cliente: 'consumidor_final' | 'profissional_obra' | 'empresa_revenda' | 'nao_identificado'` e `profissao_cliente: string`;
  - `rotuloPerfilCliente(perfil?: string | null, profissao?: string | null): string | null` em `lib/visual.ts`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/unidade/analise.test.ts`, acrescente `schemaJsonAnalise` ao import de `../../lib/analise.ts` e, no fim:

```ts
// Com `strict: true`, a OpenAI exige que toda propriedade esteja em `required`.
test('todo campo do schema da análise é obrigatório para a OpenAI', () => {
    assert.deepEqual([...schemaJsonAnalise.required].sort(), Object.keys(schemaJsonAnalise.properties).sort());
});

test('perfil do cliente fora do contrato vira não identificado, sem derrubar a análise', () => {
    const r = schemaAnalise.shape.perfil_cliente.parse('pedreiro');
    assert.equal(r, 'nao_identificado');
    assert.equal(schemaAnalise.shape.profissao_cliente.parse(undefined), '');
    assert.equal(schemaAnalise.shape.perfil_cliente.parse('profissional_obra'), 'profissional_obra');
});
```

Em `tests/unidade/visual.test.ts`, acrescente `rotuloPerfilCliente` ao import de `../../lib/visual.ts` e, no fim:

```ts
test('profissão dita pelo cliente vira o rótulo, com inicial maiúscula', () => {
    assert.equal(rotuloPerfilCliente('profissional_obra', 'carpinteiro'), 'Carpinteiro');
});

test('perfil sem profissão dita usa o nome do perfil', () => {
    assert.equal(rotuloPerfilCliente('profissional_obra', ''), 'Profissional de obra');
    assert.equal(rotuloPerfilCliente('consumidor_final', ''), 'Consumidor final');
    assert.equal(rotuloPerfilCliente('empresa_revenda', null), 'Empresa ou revenda');
});

// Análise antiga não tem o campo; não identificado não merece selo.
test('sem perfil, sem rótulo', () => {
    assert.equal(rotuloPerfilCliente('nao_identificado', ''), null);
    assert.equal(rotuloPerfilCliente(undefined, undefined), null);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/analise.test.ts tests/unidade/visual.test.ts`
Expected: FAIL. `schemaAnalise.shape.perfil_cliente` é undefined e `rotuloPerfilCliente` não existe. O teste de `required` pode passar já agora: ele é uma rede de segurança para o passo 3.

- [ ] **Passo 3: Schema da análise**

Em `lib/analise.ts`, dentro de `schemaAnalise`, logo depois de `tags: z.array(z.string()),`:

```ts
    // Quem é o cliente, pelo que ELE disse — o nome do contato é o que ele pôs
    // no próprio WhatsApp, não o da agenda do vendedor. Fora do contrato vira
    // "não identificado" em vez de derrubar a análise (como o mec_detalhe).
    perfil_cliente: z.enum(['consumidor_final', 'profissional_obra', 'empresa_revenda', 'nao_identificado']).catch('nao_identificado'),
    profissao_cliente: z.string().catch(''),
```

Em `schemaJsonAnalise.properties`, logo depois da linha de `erros_vendedor`/`tags`:

```ts
        perfil_cliente: { type: 'string', enum: ['consumidor_final','profissional_obra','empresa_revenda','nao_identificado'] },
        profissao_cliente: { type: 'string' },
```

E acrescente `'perfil_cliente','profissao_cliente'` ao fim do array `required` de `schemaJsonAnalise`.

- [ ] **Passo 4: Rótulo**

Em `lib/visual.ts`, no fim do arquivo:

```ts
const NOMES_PERFIL: Record<string, string> = {
    consumidor_final: 'Consumidor final',
    profissional_obra: 'Profissional de obra',
    empresa_revenda: 'Empresa ou revenda',
};

/**
 * O selo de quem é o cliente. A profissão dita ("carpinteiro") diz mais que a
 * categoria; sem ela, a categoria. Não identificado (ou análise antiga, sem o
 * campo) não ganha selo.
 */
export function rotuloPerfilCliente(perfil?: string | null, profissao?: string | null): string | null {
    const dita = (profissao ?? '').trim();
    if (dita) return dita.charAt(0).toLocaleUpperCase('pt-BR') + dita.slice(1);
    return NOMES_PERFIL[perfil ?? ''] ?? null;
}
```

- [ ] **Passo 5: Rodar e ver passar**

Run: `npm run test:unidade`
Expected: PASS, inclusive `mec.test.ts`. O `ANALISE_BASE` de lá não tem os campos novos, e o `.catch` os completa.

- [ ] **Passo 6: Instrução para a IA**

Em `lib/openai-analise.ts`, dentro da string `instructions` de `analisarConversa`, troque o trecho

```
- Não deduza conteúdo de imagem/documento.\n
```

por

```
- Não deduza conteúdo de imagem/documento.\n- perfil_cliente e profissao_cliente só pelo que o CLIENTE disse na conversa ("sou pedreiro", "é pra obra de um cliente meu", "compro pra revenda"). Não deduza pelo produto nem pela quantidade. profissao_cliente é a profissão em uma ou duas palavras minúsculas, como ele disse ("carpinteiro"), ou "" se ele não disse. Sem indício, perfil_cliente = nao_identificado.\n
```

Mudar o prompt não reprocessa nada sozinho: só as análises novas, ou um dia reprocessado em `/admin`, trazem os campos.

- [ ] **Passo 7: Mostrar na conversa e no Retomar contato**

Em `app/(app)/conversas/[id]/page.tsx`:
1. No tipo `Payload`, acrescente `perfil_cliente?: string; profissao_cliente?: string;`.
2. Acrescente `rotuloPerfilCliente` ao import de `@/lib/visual`.
3. Na prop `sobre` do `CabecalhoPagina`, troque o array por:

```tsx
                    sobre={[telefoneBonito(conversa.cliente_telefone), rotuloPerfilCliente(payload.perfil_cliente, payload.profissao_cliente), vendedor?.nome && `atendida por ${vendedor.nome}`, dataCurta(conversa.ultima_mensagem_em as string)].filter(Boolean).join(' · ')}
```

Em `app/(app)/dashboard/secoes.tsx`:
1. Troque `export type AcaoRetomar = { proxima_acao?: string };` por:

```ts
export type AcaoRetomar = { proxima_acao?: string; perfil_cliente?: string; profissao_cliente?: string };
```

2. Acrescente `rotuloPerfilCliente` ao import de `@/lib/visual`.
3. Em `ItemRetomarContato`, depois de `const destino = ...`, inclua:

```ts
    const perfil = rotuloPerfilCliente(acao?.perfil_cliente, acao?.profissao_cliente);
```

E logo depois do selo "Potencial alto":

```tsx
                        {perfil && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.neutro}`}>{perfil}</span>}
```

- [ ] **Passo 8: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.

Calibração rápida, com a chave da OpenAI em `.env.local`: reprocesse em `/admin` (local) um dia que tenha uma conversa em que o cliente diz a profissão.

Expected:
- `select payload->>'perfil_cliente', payload->>'profissao_cliente' from analises_conversa where conversa_id = '<id>'` traz `profissional_obra` e a profissão;
- numa conversa sem indício, traz `nao_identificado` e `""`.

Anote 3 exemplos na task do ClickUp.

- [ ] **Passo 9: Commit**

```bash
git add lib/analise.ts lib/openai-analise.ts lib/visual.ts tests/unidade/analise.test.ts tests/unidade/visual.test.ts "app/(app)/conversas/[id]/page.tsx" "app/(app)/dashboard/secoes.tsx"
git commit -m "feat: IA identifica o perfil e a profissão do cliente pela conversa"
```

---

## Fora deste plano: lista quente → CRPRO

> Resolvido em 04/10/2026 pelo plano `2026-10-04-leads-quentes-crpro.md`: opção de card para o vendedor trabalhar (sem disparo), org Zona Nova2, etapa Lead. A validação LGPD (item 2) continua sendo o portão do envio real.

Fica para um plano próprio, que só faz sentido depois de quatro respostas:

1. **O que é "quente".** Proposta: negociação em aberto com potencial alto e nota de oportunidade ≥ 70 pela última análise.
2. **LGPD.** O aceite em `/conectar` fala em "armazenadas e analisadas para gestão". Usar o contato para campanha de marketing é outra finalidade, e alguém da Redemac precisa validar a base legal antes do primeiro disparo.
3. **Conflito com o vendedor.** Proposta: o lead quente que esfria entra primeiro em "Retomar contato" (Tarefa 7). Só vai para a lista de campanha se o vendedor não agir em X dias. Assim o cliente nunca recebe disparo em massa no meio de uma negociação.
4. **Integração.** De qual organização e de qual linha do CRPRO sai a campanha, e se a v1 pode ser um CSV exportado pelo gestor (sem depender da API) ou já precisa ser automática.

## Ordem e dependências

- Antes do piloto começar: **0 → 1 → 2 → 3 → 4 → 5**. Sem a lista interna, conversas de trabalho entram nas métricas e no custo de IA desde o primeiro dia.
- **6 → 7** dependem de 1 (`destinoResponder`).
- **8** depende de 7 só no último passo (o selo no Retomar contato). Se 7 não estiver pronta, faça os passos 1 a 6 e a parte da conversa no passo 7.
- Migração 0022 em produção: aplicar pelo mesmo caminho da 0021, depois de `npm run test:rls` passar localmente.
