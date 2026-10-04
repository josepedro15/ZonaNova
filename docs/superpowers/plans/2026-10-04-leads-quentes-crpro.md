# Lead quente → CRM CRPRO — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depois da análise do dia, cada negociação quente vira um card na etapa **Lead** do funil "Vendas Padrão" da organização **Zona Nova2** no CRPRO, com o contato etiquetado com o nome do vendedor, para o vendedor trabalhar.

**Architecture:** Um item novo na fila, `envio_crm`, enfileirado pelo `encadear` quando a análise do dia dá lead quente. Ele herda da fila o que já existe (retry com backoff, resgate de item preso, chave única por dia) e uma falha do CRPRO nunca derruba a análise. A regra (o que é quente, o telefone, o texto do card) fica em `lib/crm.ts`, sem I/O; as chamadas HTTP ficam em `lib/crpro/cliente.ts`. A tabela `envios_crm` garante um card por telefone. A primeira semana roda em **simulação**: grava o que seria enviado, sem chamar o CRPRO.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), supabase-js, testes com `node --test` (TypeScript direto, sem build), API pública do CRPRO v1.

**Spec:** não há spec separada. A fonte é a sessão de 04/10/2026, resumida aqui, e a seção "Fora deste plano: lista quente → CRPRO" do plano `2026-10-03-pedidos-piloto-redemac.md`.

| Decisão (04/10/2026) | Valor |
|---|---|
| Para que serve o card | Opção (a): registro para o vendedor trabalhar, **sem disparo automático** |
| Organização | Zona Nova2 (`zona-nova2-492`) |
| Funil / etapa | "Vendas Padrão" `cf2f67c9-d72e-424e-aaa1-ea0d9f9a5b7f` / "Lead" `e674b359-2790-4021-adcf-2f26025b6bf1` |
| Etapa de entrada | Lead foi **desmarcada** como entrada. O CRPRO não cria card automático; só a integração cria |
| Etiqueta | Nome do vendedor de origem, no **contato** (no CRPRO etiqueta é do contato, não do card) |
| O que é quente | Análise do dia com `tipo_conversa = negociacao`, `status = em_andamento`, `potencial_venda = alto` e `score_oportunidade ≥ 70` |
| Linha (`connected_phone`) | Uma linha de WhatsApp que o José vai conectar na Zona Nova2 (obrigatória em toda escrita da API) |

**O que a API do CRPRO faz e que o plano usa** (fonte: `docs/api/openapi.yaml` e `src/app/api/v1/` do repositório Batepapo, `origin/main`):

- Base `https://app.crpro.com.br/api/v1`, chave no cabeçalho `x-api-key`. A chave define a organização.
- `POST /contacts` `{ name, phone, connected_phone }` → `{ success, contact }`. Faz upsert pelo telefone, inclusive com e sem o nono dígito. **Se mandar `tags`, elas SUBSTITUEM as do contato**, então o plano nunca manda.
- `POST /contacts/{id}/tags` `{ tags, connected_phone }`: soma às etiquetas existentes.
- `POST /contacts/{id}/notes` `{ content, connected_phone }`: nota interna.
- `GET /deals?external_ref=…&limit=1` → `{ success, data: [...] }`.
- `POST /deals` `{ title, contact_id, connected_phone, pipeline_id, stage_id, external_ref }` → `{ success, deal }`. **Com um `external_ref` que já existe, ele MOVE o card para a etapa pedida.** Por isso o plano consulta antes e nunca chama duas vezes para o mesmo cliente: senão desfaria o que o vendedor andou no funil.
- 429 é limite de requisição; a fila trata como falha com nova tentativa.

## Global Constraints

- Todo texto de tela, comentário e mensagem de commit em português do Brasil, no tom do resto do código (comentário explica o porquê, não o quê).
- Arquivo em `lib/` coberto por teste importa outros arquivos de `lib/` pelo caminho relativo **com** `.ts` (`./painel.ts`), nunca por `@/lib/...`: os testes rodam em `node --test` sem o alias do Next.
- Sem "parameter properties" (`constructor(private x)`) em código importado por teste: o `node --test` roda em strip-only mode e as recusa.
- Conversa, análise e `envios_crm` só são escritas pelo service role (`criarClienteAdmin`).
- A chave do CRPRO só existe em variável de ambiente (`CRPRO_API_KEY`), nunca em arquivo versionado, log ou `ultimo_erro`.
- Conversão continua inferida pela IA. Nenhuma tarefa depende de ERP.
- Comandos de verificação: `npm run test:unidade`, `npm run typecheck`, `npm run lint`, e `npm run test:rls` (Postgres local) quando a tarefa mexe em migração.
- Base: a branch `redesign/redemac`. Trabalhe num worktree próprio (superpowers:using-git-worktrees).
- **Portão de release:** a migração 0023 tem de estar aplicada no Supabase de produção ANTES do deploy do código (o worker passa a enfileirar `envio_crm`, e sem a 0023 o check da fila recusa o tipo). O Supabase de produção não está no MCP: aplicar pelo mesmo caminho da 0021 e da 0022.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0023_envio_crm.sql` (novo) | Aceita `envio_crm` na fila; cria `envios_crm` (um card por telefone) |
| `tests/rls.sql` | Prova que a fila aceita o tipo novo e que `envios_crm` é só do service role |
| `lib/crm.ts` (novo) | Regra pura: lead quente, telefone do CRM, textos do card, configuração, decisão de envio |
| `tests/unidade/crm.test.ts` (novo) | Testes da regra |
| `lib/crpro/cliente.ts` (novo) | Cliente HTTP da API do CRPRO e a sequência `enviarLead` |
| `tests/unidade/cliente-crpro.test.ts` (novo) | Testes do cliente com `fetch` falso |
| `app/api/cron/processar-fila/route.ts` | Tipo novo na fila, `enviarAoCrmItem`, enfileiramento no `encadear` |
| `scripts/crpro-checar.ts` (novo) | Confere a chave e o funil sem escrever nada |
| `.env.example`, `docs/03-pipeline-de-analise.md` | Variáveis novas e a etapa nova do pipeline |

---

### Tarefa 1: Migração 0023 — fila aceita `envio_crm` e tabela `envios_crm`

**Files:**
- Create: `supabase/migrations/0023_envio_crm.sql`
- Modify: `tests/rls.sql` (acrescentar no fim)

**Interfaces:**
- Produces: `fila_processamento.tipo` aceita `'envio_crm'`; tabela `public.envios_crm (id, telefone, modo, conversa_id, user_id, unidade_id, data_ref, crpro_contato_id, crpro_card_id, created_at)` com `unique (telefone, modo)`, `modo in ('simulacao','envio')`.

- [ ] **Passo 1: Escrever o teste de RLS que falha**

Acrescente ao fim de `tests/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 0023: envio ao CRM — a fila aceita o tipo novo; envios_crm é do service role
-- ---------------------------------------------------------------------------
do $$
begin
    insert into public.fila_processamento (tipo, referencia_id, data_ref)
    values ('envio_crm', gen_random_uuid(), current_date);
    raise notice 'PASSOU  fila aceita envio_crm';
exception when check_violation then
    raise notice 'FALHOU  fila recusa envio_crm';
end $$;

do $$
begin
    if to_regclass('public.envios_crm') is null
    then raise notice 'FALHOU  envios_crm não existe';
    elsif has_table_privilege('authenticated', 'public.envios_crm', 'select')
       or has_table_privilege('authenticated', 'public.envios_crm', 'insert')
       or has_table_privilege('authenticated', 'public.envios_crm', 'update')
       or has_table_privilege('authenticated', 'public.envios_crm', 'delete')
       or has_table_privilege('anon', 'public.envios_crm', 'select')
    then raise notice 'FALHOU  envios_crm aberto ao cliente';
    else raise notice 'PASSOU  envios_crm só pelo service role'; end if;
end $$;
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:rls`
Expected: `FALHOU  fila recusa envio_crm` e `FALHOU  envios_crm não existe`.

- [ ] **Passo 3: Escrever a migração**

`supabase/migrations/0023_envio_crm.sql`:

```sql
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
```

- [ ] **Passo 4: Conferir o nome do check antigo**

Run: `npm run db:reset && bash scripts/db-local.sh psql -c '\d public.fila_processamento'`
Expected: aparece `fila_processamento_tipo_check` com `envio_crm` na lista e **nenhum** outro check sobre `tipo`. Se aparecer um segundo check de `tipo` com outro nome, o `drop constraint if exists` errou o nome: troque pelo nome que aparece no `\d` antes de seguir.

- [ ] **Passo 5: Rodar e ver passar**

Run: `npm run test:rls`
Expected: `PASSOU  fila aceita envio_crm`, `PASSOU  envios_crm só pelo service role` e nenhum `FALHOU` no resto.

- [ ] **Passo 6: Commit**

```bash
git add supabase/migrations/0023_envio_crm.sql tests/rls.sql
git commit -m "feat: fila aceita envio ao CRM e trava um card por telefone"
```

---

### Tarefa 2: Regra do lead quente (`lib/crm.ts`)

**Files:**
- Create: `lib/crm.ts`
- Test: `tests/unidade/crm.test.ts`

**Interfaces:**
- Consumes: `semTelefone`, `variantesTelefone` de `lib/painel.ts`; `detalheLigado(unidadeId, config)` de `lib/mec.ts` (mesma semântica de lista: vazio desliga, `*` liga todas, ids por vírgula).
- Produces:
  - `NOTA_MINIMA = 70`
  - `type AnaliseCrm = { tipo_conversa: string | null; status: string | null; potencial_venda: string | null; score_oportunidade: number | null }`
  - `leadQuente(a: AnaliseCrm): boolean`
  - `telefoneDoCrm(telefone: string): string | null`
  - `refExterna(telefone: string): string` → `zonanova:<telefone>`
  - `nomeDoContato(nome: string | null, telefone: string): string` (≤ 120)
  - `tituloDoCard(nome: string | null, profissao: string, telefone: string): string` (≤ 200)
  - `etiquetaDoVendedor(nome: string): string` (≤ 50)
  - `type ResumoLead = { vendedor: string; dataRef: string; score: number; resumo: string; proximaAcao: string }`; `notaDoCard(r: ResumoLead): string`
  - `type ConfigCrm = { unidades: string; modo: 'simulacao' | 'envio'; baseUrl: string; apiKey: string; pipelineId: string; stageId: string; linha: string }`
  - `lerConfigCrm(env: Record<string, string | undefined>): ConfigCrm`
  - `faltandoParaEnviar(c: ConfigCrm): string[]`
  - `type Candidato = { unidadeId: string; bloqueada: boolean; telefone: string; analise: AnaliseCrm | null }`
  - `type Decisao = { acao: 'ignorar'; motivo: string } | { acao: 'simular' | 'enviar'; telefone: string }`
  - `decidirEnvio(c: Candidato, config: ConfigCrm): Decisao`

- [ ] **Passo 1: Escrever os testes que falham**

`tests/unidade/crm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    decidirEnvio, etiquetaDoVendedor, faltandoParaEnviar, leadQuente, lerConfigCrm, nomeDoContato,
    notaDoCard, refExterna, telefoneDoCrm, tituloDoCard, type AnaliseCrm, type Candidato, type ConfigCrm,
} from '../../lib/crm.ts';

const quente = (extra: Partial<AnaliseCrm> = {}): AnaliseCrm => ({
    tipo_conversa: 'negociacao', status: 'em_andamento', potencial_venda: 'alto', score_oportunidade: 80, ...extra,
});

const config = (extra: Partial<ConfigCrm> = {}): ConfigCrm => ({
    unidades: '*', modo: 'simulacao', baseUrl: 'https://crm', apiKey: '', pipelineId: '', stageId: '', linha: '', ...extra,
});

const candidato = (extra: Partial<Candidato> = {}): Candidato => ({
    unidadeId: 'u1', bloqueada: false, telefone: '5554998124471', analise: quente(), ...extra,
});

test('negociação em andamento, potencial alto e nota 70 é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: 70 })), true);
});

test('nota 69 não é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: 69 })), false);
});

test('potencial médio, outro status ou outro tipo não é quente', () => {
    assert.equal(leadQuente(quente({ potencial_venda: 'medio' })), false);
    for (const status of ['venda_feita', 'lead_frio', 'sem_resposta', 'perdida', 'encerrada']) {
        assert.equal(leadQuente(quente({ status })), false, status);
    }
    assert.equal(leadQuente(quente({ tipo_conversa: 'suporte' })), false);
});

test('nota ausente não é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: null })), false);
});

test('celular sem o nono dígito vai ao CRM com ele', () => {
    assert.equal(telefoneDoCrm('555498124471'), '5554998124471');
    assert.equal(telefoneDoCrm('5554998124471'), '5554998124471');
});

test('fixo fica como está', () => {
    assert.equal(telefoneDoCrm('555433221100'), '555433221100');
});

test('lid, estrangeiro e lixo não têm telefone de CRM', () => {
    assert.equal(telefoneDoCrm('lid:123456789012345'), null);
    assert.equal(telefoneDoCrm('14155550123'), null);
    assert.equal(telefoneDoCrm('5554'), null);
});

test('external_ref é do ZonaNova e do telefone', () => {
    assert.equal(refExterna('5554998124471'), 'zonanova:5554998124471');
});

test('título leva a profissão quando a IA identificou', () => {
    assert.equal(tituloDoCard('Maria Souza', 'pedreira', '5554998124471'), 'Maria Souza · pedreira');
    assert.equal(tituloDoCard('Maria Souza', '  ', '5554998124471'), 'Maria Souza');
});

test('sem nome, contato e título usam o telefone', () => {
    assert.equal(nomeDoContato(null, '5554998124471'), 'Cliente 5554998124471');
    assert.equal(nomeDoContato('  ', '5554998124471'), 'Cliente 5554998124471');
    assert.equal(tituloDoCard(null, '', '5554998124471'), 'Cliente 5554998124471');
});

test('textos respeitam os limites da API', () => {
    assert.equal(nomeDoContato('x'.repeat(300), '1').length, 120);
    assert.equal(tituloDoCard('x'.repeat(300), 'y', '1').length, 200);
    assert.equal(etiquetaDoVendedor(' ' + 'v'.repeat(80) + ' ').length, 50);
});

test('nota traz vendedor, nota, resumo e próxima ação', () => {
    const nota = notaDoCard({ vendedor: 'Rafael', dataRef: '2026-10-03', score: 82, resumo: 'Quer 40m² de porcelanato.', proximaAcao: 'Mandar orçamento hoje.' });
    assert.match(nota, /03\/10\/2026/);
    assert.match(nota, /Vendedor: Rafael/);
    assert.match(nota, /82\/100/);
    assert.match(nota, /Resumo: Quer 40m² de porcelanato\./);
    assert.match(nota, /Próxima ação: Mandar orçamento hoje\./);
});

test('nota sem resumo nem próxima ação não deixa linha vazia', () => {
    const nota = notaDoCard({ vendedor: 'Rafael', dataRef: '2026-10-03', score: 82, resumo: '', proximaAcao: '' });
    assert.doesNotMatch(nota, /Resumo|Próxima ação|\n\n/);
});

test('só a palavra exata liga o envio real', () => {
    assert.equal(lerConfigCrm({ CRPRO_MODO: 'envio' }).modo, 'envio');
    assert.equal(lerConfigCrm({ CRPRO_MODO: 'Envio' }).modo, 'simulacao');
    assert.equal(lerConfigCrm({}).modo, 'simulacao');
});

test('base da API tem padrão de produção', () => {
    assert.equal(lerConfigCrm({}).baseUrl, 'https://app.crpro.com.br/api/v1');
    assert.equal(lerConfigCrm({ CRPRO_BASE_URL: 'https://dev/api/v1' }).baseUrl, 'https://dev/api/v1');
});

test('envio real lista o que falta configurar', () => {
    assert.deepEqual(faltandoParaEnviar(config()), ['CRPRO_API_KEY', 'CRPRO_PIPELINE_ID', 'CRPRO_STAGE_ID', 'CRPRO_CONNECTED_PHONE']);
    assert.deepEqual(faltandoParaEnviar(config({ apiKey: 'k', pipelineId: 'p', stageId: 's', linha: '5554' })), []);
});

test('lead quente de unidade ligada é simulado por padrão', () => {
    assert.deepEqual(decidirEnvio(candidato({ telefone: '555498124471' }), config()), { acao: 'simular', telefone: '5554998124471' });
});

test('com modo envio, o lead quente é enviado', () => {
    assert.equal(decidirEnvio(candidato(), config({ modo: 'envio' })).acao, 'enviar');
});

test('unidade fora da lista não envia', () => {
    assert.equal(decidirEnvio(candidato(), config({ unidades: '' })).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato(), config({ unidades: 'u2,u3' })).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato(), config({ unidades: 'u2, u1' })).acao, 'simular');
});

test('conversa fora da análise, sem análise ou fria não envia', () => {
    assert.equal(decidirEnvio(candidato({ bloqueada: true }), config()).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato({ analise: null }), config()).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato({ analise: quente({ potencial_venda: 'baixo' }) }), config()).acao, 'ignorar');
});

test('contato sem telefone não envia', () => {
    assert.equal(decidirEnvio(candidato({ telefone: 'lid:123456789012345' }), config()).acao, 'ignorar');
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/crm.test.ts`
Expected: FAIL com `Cannot find module '.../lib/crm.ts'`.

- [ ] **Passo 3: Implementar**

`lib/crm.ts`:

```ts
/**
 * Lead quente → CRM CRPRO (plano 2026-10-04). Só regra, sem I/O: o worker
 * busca os dados, pergunta aqui o que fazer e chama o cliente do CRPRO.
 */
import { detalheLigado } from './mec.ts';
import { semTelefone, variantesTelefone } from './painel.ts';

/** Combinado em 04/10/2026; a mesma nota que o plano do piloto propôs. */
export const NOTA_MINIMA = 70;

export type AnaliseCrm = {
    tipo_conversa: string | null;
    status: string | null;
    potencial_venda: string | null;
    score_oportunidade: number | null;
};

/**
 * Negociação em andamento, potencial alto e nota de oportunidade ≥ 70 na
 * análise do dia. Venda feita já não precisa do CRM; fria vai para o
 * "Retomar contato", não para cá.
 */
export function leadQuente(a: AnaliseCrm): boolean {
    return a.tipo_conversa === 'negociacao'
        && a.status === 'em_andamento'
        && a.potencial_venda === 'alto'
        && (a.score_oportunidade ?? 0) >= NOTA_MINIMA;
}

/**
 * O telefone que vai ao CRM e que trava o card repetido: brasileiro, com o
 * nono dígito quando é celular — o JID antigo chega sem ele, e a trava não
 * pode ver dois clientes onde há um. `lid:` não é telefone: o CRPRO recusaria
 * e não haveria para quem ligar.
 */
export function telefoneDoCrm(telefone: string): string | null {
    if (semTelefone(telefone)) return null;
    const d = telefone.replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(d)) return null;
    return variantesTelefone(d).find((v) => v.length === 13) ?? d;
}

export const refExterna = (telefone: string) => `zonanova:${telefone}`;

export function nomeDoContato(nome: string | null, telefone: string): string {
    return (nome?.trim() || `Cliente ${telefone}`).slice(0, 120);
}

/** A profissão no título: é o que o Silas queria ver no nome do contato. */
export function tituloDoCard(nome: string | null, profissao: string, telefone: string): string {
    // O título tem 200 de limite; o nome do contato, 120. Cortar antes daqui
    // cortaria o título no limite do contato.
    const quem = nome?.trim() || `Cliente ${telefone}`;
    const oficio = profissao.trim();
    return (oficio ? `${quem} · ${oficio}` : quem).slice(0, 200);
}

export function etiquetaDoVendedor(nome: string): string {
    return nome.trim().slice(0, 50);
}

export type ResumoLead = { vendedor: string; dataRef: string; score: number; resumo: string; proximaAcao: string };

/** A nota interna do contato: o porquê do card, para o vendedor não abrir o ZonaNova. */
export function notaDoCard(r: ResumoLead): string {
    const [ano, mes, dia] = r.dataRef.split('-');
    return [
        `Lead quente identificado pelo ZonaNova na conversa de ${dia}/${mes}/${ano}.`,
        `Vendedor: ${r.vendedor}`,
        `Oportunidade: ${r.score}/100 · potencial alto`,
        r.resumo.trim() && `Resumo: ${r.resumo.trim()}`,
        r.proximaAcao.trim() && `Próxima ação: ${r.proximaAcao.trim()}`,
    ].filter(Boolean).join('\n');
}

export type ConfigCrm = {
    unidades: string;
    modo: 'simulacao' | 'envio';
    baseUrl: string;
    apiKey: string;
    pipelineId: string;
    stageId: string;
    linha: string;
};

export function lerConfigCrm(env: Record<string, string | undefined>): ConfigCrm {
    return {
        unidades: env.CRPRO_UNIDADES ?? '',
        // Só a palavra exata liga o envio real: variável errada ou ausente simula.
        modo: env.CRPRO_MODO === 'envio' ? 'envio' : 'simulacao',
        baseUrl: env.CRPRO_BASE_URL || 'https://app.crpro.com.br/api/v1',
        apiKey: env.CRPRO_API_KEY ?? '',
        pipelineId: env.CRPRO_PIPELINE_ID ?? '',
        stageId: env.CRPRO_STAGE_ID ?? '',
        linha: env.CRPRO_CONNECTED_PHONE ?? '',
    };
}

/** O que falta para o envio real. Vazio = pode enviar. */
export function faltandoParaEnviar(c: ConfigCrm): string[] {
    return ([
        ['CRPRO_API_KEY', c.apiKey],
        ['CRPRO_PIPELINE_ID', c.pipelineId],
        ['CRPRO_STAGE_ID', c.stageId],
        ['CRPRO_CONNECTED_PHONE', c.linha],
    ] as const).filter(([, valor]) => !valor).map(([nome]) => nome);
}

export type Candidato = { unidadeId: string; bloqueada: boolean; telefone: string; analise: AnaliseCrm | null };

export type Decisao = { acao: 'ignorar'; motivo: string } | { acao: 'simular' | 'enviar'; telefone: string };

const ignorar = (motivo: string): Decisao => ({ acao: 'ignorar', motivo });

/**
 * Vale no enfileiramento e de novo na hora de enviar: entre um e outro a
 * conversa pode ter saído da análise (contato interno, colega conectado).
 */
export function decidirEnvio(c: Candidato, config: ConfigCrm): Decisao {
    // Mesma lista do piloto do MEC: vazio desliga, * liga todas, ou ids por vírgula.
    if (!detalheLigado(c.unidadeId, config.unidades)) return ignorar('unidade fora do envio ao CRM');
    if (c.bloqueada) return ignorar('conversa fora da análise');
    if (!c.analise || !leadQuente(c.analise)) return ignorar('não é lead quente');
    const telefone = telefoneDoCrm(c.telefone);
    if (!telefone) return ignorar('contato sem telefone brasileiro');
    return { acao: config.modo === 'envio' ? 'enviar' : 'simular', telefone };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `node --test tests/unidade/crm.test.ts`
Expected: todos PASS.

- [ ] **Passo 5: Commit**

```bash
git add lib/crm.ts tests/unidade/crm.test.ts
git commit -m "feat: regra do lead quente que vai para o CRM"
```

---

### Tarefa 3: Cliente do CRPRO e a sequência do envio (`lib/crpro/cliente.ts`)

**Files:**
- Create: `lib/crpro/cliente.ts`
- Test: `tests/unidade/cliente-crpro.test.ts`

**Interfaces:**
- Consumes: `refExterna(telefone)` de `lib/crm.ts` (Tarefa 2).
- Produces:
  - `class ErroCrpro extends Error { readonly status?: number }`
  - `type DestinoCrm = { pipelineId: string; stageId: string; linha: string }`
  - `class Crpro { constructor(baseUrl: string, apiKey: string, buscar?: typeof fetch) }` com `cardPorRef(ref): Promise<{ id: string } | null>`, `salvarContato({ nome, telefone, linha }): Promise<{ id: string }>`, `etiquetar(contatoId, tags, linha): Promise<void>`, `anotar(contatoId, texto, linha): Promise<void>`, `criarCard({ titulo, contatoId, ref, destino }): Promise<{ id: string }>`
  - `type Lead = { telefone: string; nome: string; titulo: string; etiqueta: string; nota: string }`
  - `type Enviado = { contatoId: string; cardId: string; jaExistia: boolean }`
  - `enviarLead(crpro: Crpro, lead: Lead, destino: DestinoCrm): Promise<Enviado>`

- [ ] **Passo 1: Escrever os testes que falham**

`tests/unidade/cliente-crpro.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crpro, ErroCrpro, enviarLead, type DestinoCrm, type Lead } from '../../lib/crpro/cliente.ts';

type Chamada = { chave: string; headers: Record<string, string>; corpo: unknown };

/**
 * fetch de mentira: responde pela chave "MÉTODO caminho" (caminho com a query)
 * e grava o que foi chamado, na ordem.
 */
function falso(respostas: Record<string, { status?: number; corpo: unknown }>) {
    const chamadas: Chamada[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
        const chave = `${init?.method ?? 'GET'} ${String(url).replace('https://crm', '')}`;
        chamadas.push({
            chave,
            headers: (init?.headers ?? {}) as Record<string, string>,
            corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const r = respostas[chave];
        if (!r) return new Response('{"error":{"message":"não mapeado"}}', { status: 404 });
        return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
    }) as unknown as typeof globalThis.fetch;
    return { f, chamadas };
}

const destino: DestinoCrm = { pipelineId: 'pipe-1', stageId: 'lead-1', linha: '5554900000000' };
const lead: Lead = {
    telefone: '5554998124471', nome: 'Maria Souza', titulo: 'Maria Souza · pedreira',
    etiqueta: 'Rafael', nota: 'Lead quente identificado pelo ZonaNova.',
};
const BUSCA = 'GET /deals?external_ref=zonanova%3A5554998124471&limit=1';

const comum = {
    'POST /contacts': { corpo: { success: true, contact: { id: 'c1' } } },
    'POST /contacts/c1/tags': { corpo: { success: true } },
    'POST /contacts/c1/notes': { corpo: { success: true, note: { id: 'n1' } } },
};

test('lead novo: contato, etiqueta, consulta, card e nota, nessa ordem', async () => {
    const { f, chamadas } = falso({
        ...comum,
        [BUSCA]: { corpo: { success: true, data: [] } },
        'POST /deals': { status: 201, corpo: { success: true, deal: { id: 'd1' } } },
    });
    const r = await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(r, { contatoId: 'c1', cardId: 'd1', jaExistia: false });
    assert.deepEqual(chamadas.map((c) => c.chave), [
        'POST /contacts', 'POST /contacts/c1/tags', BUSCA, 'POST /deals', 'POST /contacts/c1/notes',
    ]);
    assert.equal(chamadas[0].headers['x-api-key'], 'chave');
    assert.deepEqual(chamadas[3].corpo, {
        title: 'Maria Souza · pedreira', contact_id: 'c1', connected_phone: '5554900000000',
        pipeline_id: 'pipe-1', stage_id: 'lead-1', external_ref: 'zonanova:5554998124471',
    });
    assert.deepEqual(chamadas[1].corpo, { tags: ['Rafael'], connected_phone: '5554900000000' });
});

// No POST /contacts, `tags` SUBSTITUI as etiquetas do contato: um cliente que
// já fosse de outro vendedor perderia a etiqueta dele.
test('salvar contato nunca manda tags', async () => {
    const { f, chamadas } = falso({ ...comum, [BUSCA]: { corpo: { success: true, data: [{ id: 'd0' }] } } });
    await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(chamadas[0].corpo, { name: 'Maria Souza', phone: '5554998124471', connected_phone: '5554900000000' });
});

// O POST /deals com um external_ref conhecido MOVE o card para Lead: a nova
// tentativa depois de uma falha no meio desfaria o que o vendedor andou.
test('card que já existe não é recriado nem movido', async () => {
    const { f, chamadas } = falso({ ...comum, [BUSCA]: { corpo: { success: true, data: [{ id: 'd0' }] } } });
    const r = await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(r, { contatoId: 'c1', cardId: 'd0', jaExistia: true });
    assert.equal(chamadas.some((c) => c.chave === 'POST /deals'), false);
    assert.equal(chamadas.some((c) => c.chave === 'POST /contacts/c1/notes'), false);
});

test('erro da API vira ErroCrpro com o status e sem a query', async () => {
    const { f } = falso({
        ...comum,
        [BUSCA]: { status: 429, corpo: { error: { message: 'Too many requests', status: 429 } } },
    });
    await assert.rejects(enviarLead(new Crpro('https://crm', 'chave', f), lead, destino), (e: unknown) => {
        assert.ok(e instanceof ErroCrpro);
        assert.equal(e.status, 429);
        assert.doesNotMatch(e.message, /external_ref|5554998124471/);
        return true;
    });
});

test('resposta sem id do contato é erro, não card órfão', async () => {
    const { f, chamadas } = falso({ 'POST /contacts': { corpo: { success: true } } });
    await assert.rejects(enviarLead(new Crpro('https://crm', 'chave', f), lead, destino), ErroCrpro);
    assert.equal(chamadas.length, 1);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `node --test tests/unidade/cliente-crpro.test.ts`
Expected: FAIL com `Cannot find module '.../lib/crpro/cliente.ts'`.

- [ ] **Passo 3: Implementar**

`lib/crpro/cliente.ts`:

```ts
/**
 * Cliente da API pública do CRPRO (`docs/api/openapi.yaml` do repositório
 * Batepapo). A chave define a organização: a de produção é a da Zona Nova2.
 *
 * Toda escrita leva `connected_phone`, a linha de WhatsApp do CRPRO a que o
 * contato pertence — sem ela a API recusa.
 */
import { refExterna } from '../crm.ts';

type Fetch = typeof globalThis.fetch;

// Sem "parameter properties" neste arquivo: o `node --test` roda em
// strip-only mode, que as recusa.
export class ErroCrpro extends Error {
    readonly status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ErroCrpro';
        this.status = status;
    }
}

export type DestinoCrm = { pipelineId: string; stageId: string; linha: string };

export class Crpro {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly buscar: Fetch;

    constructor(baseUrl: string, apiKey: string, buscar: Fetch = globalThis.fetch) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.buscar = buscar;
    }

    private async chamar<T>(caminho: string, { metodo = 'GET', corpo }: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
        const r = await this.buscar(`${this.baseUrl}${caminho}`, {
            method: metodo,
            // Sem prazo, um CRPRO travado segurava o worker até o maxDuration.
            signal: AbortSignal.timeout(15_000),
            headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
            ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        });
        const texto = await r.text();
        // Sem a query: ela leva o telefone do cliente, e a mensagem vai para
        // `fila_processamento.ultimo_erro`.
        if (!r.ok) throw new ErroCrpro(`${metodo} ${caminho.split('?')[0]}: ${r.status} ${texto.slice(0, 300)}`, r.status);
        return (texto ? JSON.parse(texto) : {}) as T;
    }

    /** O card que já tem este external_ref, se houver. */
    async cardPorRef(ref: string): Promise<{ id: string } | null> {
        const r = await this.chamar<{ data?: { id: string }[] }>(`/deals?external_ref=${encodeURIComponent(ref)}&limit=1`);
        return r.data?.[0] ?? null;
    }

    /**
     * Cria ou atualiza pelo telefone (o CRPRO casa com e sem o nono dígito).
     * Nunca manda `tags`: neste endpoint elas SUBSTITUEM as do contato.
     */
    async salvarContato(c: { nome: string; telefone: string; linha: string }): Promise<{ id: string }> {
        const r = await this.chamar<{ contact?: { id?: string } }>('/contacts', {
            metodo: 'POST',
            corpo: { name: c.nome, phone: c.telefone, connected_phone: c.linha },
        });
        if (!r.contact?.id) throw new ErroCrpro('o CRPRO não devolveu o contato salvo');
        return { id: r.contact.id };
    }

    /** Soma às etiquetas que o contato já tem. */
    async etiquetar(contatoId: string, tags: string[], linha: string): Promise<void> {
        await this.chamar(`/contacts/${contatoId}/tags`, { metodo: 'POST', corpo: { tags, connected_phone: linha } });
    }

    async anotar(contatoId: string, texto: string, linha: string): Promise<void> {
        await this.chamar(`/contacts/${contatoId}/notes`, { metodo: 'POST', corpo: { content: texto, connected_phone: linha } });
    }

    async criarCard(c: { titulo: string; contatoId: string; ref: string; destino: DestinoCrm }): Promise<{ id: string }> {
        const r = await this.chamar<{ deal?: { id?: string } }>('/deals', {
            metodo: 'POST',
            corpo: {
                title: c.titulo, contact_id: c.contatoId, connected_phone: c.destino.linha,
                pipeline_id: c.destino.pipelineId, stage_id: c.destino.stageId, external_ref: c.ref,
            },
        });
        if (!r.deal?.id) throw new ErroCrpro('o CRPRO não devolveu o card criado');
        return { id: r.deal.id };
    }
}

export type Lead = { telefone: string; nome: string; titulo: string; etiqueta: string; nota: string };
export type Enviado = { contatoId: string; cardId: string; jaExistia: boolean };

/**
 * A sequência do envio. Contato e etiqueta primeiro: repetir é inofensivo.
 * O card só se o external_ref ainda não existe — o POST /deals com um ref
 * conhecido MOVERIA o card de volta para Lead. É isso que deixa a nova
 * tentativa, depois de uma falha no meio, sem duplicar nem desfazer nada.
 * A nota vem por último e só com card novo: se falhar, a nova tentativa acha
 * o card e segue sem ela, em vez de repetir a nota.
 */
export async function enviarLead(crpro: Crpro, lead: Lead, destino: DestinoCrm): Promise<Enviado> {
    const contato = await crpro.salvarContato({ nome: lead.nome, telefone: lead.telefone, linha: destino.linha });
    await crpro.etiquetar(contato.id, [lead.etiqueta], destino.linha);
    const ref = refExterna(lead.telefone);
    const existente = await crpro.cardPorRef(ref);
    if (existente) return { contatoId: contato.id, cardId: existente.id, jaExistia: true };
    const card = await crpro.criarCard({ titulo: lead.titulo, contatoId: contato.id, ref, destino });
    await crpro.anotar(contato.id, lead.nota, destino.linha);
    return { contatoId: contato.id, cardId: card.id, jaExistia: false };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `node --test tests/unidade/cliente-crpro.test.ts`
Expected: todos PASS.

- [ ] **Passo 5: Commit**

```bash
git add lib/crpro/cliente.ts tests/unidade/cliente-crpro.test.ts
git commit -m "feat: cliente do CRPRO cria contato, etiqueta e card sem duplicar"
```

---

### Tarefa 4: O worker envia o lead quente (`processar-fila`)

**Files:**
- Modify: `app/api/cron/processar-fila/route.ts` (imports no topo; lista de tipos em `processarLote` ~linha 74; despacho ~linha 120; `type ItemTipo` ~linha 229; `encadear` ~linha 590; funções novas antes de `reabrir`, ~linha 560)

**Interfaces:**
- Consumes: `lerConfigCrm`, `decidirEnvio`, `faltandoParaEnviar`, `nomeDoContato`, `tituloDoCard`, `etiquetaDoVendedor`, `notaDoCard`, `type Candidato` (Tarefa 2); `Crpro`, `enviarLead` (Tarefa 3); tabela `envios_crm` e tipo `envio_crm` (Tarefa 1).
- Produces: item `envio_crm` com `referencia_id = conversa_id` e o `data_ref` da análise. Desfechos: `concluido` (simulado ou enviado), `ignorado` com motivo, `falhou` depois de 3 tentativas.

- [ ] **Passo 1: Imports**

No topo de `app/api/cron/processar-fila/route.ts`, junto dos outros imports de `@/lib`:

```ts
import { decidirEnvio, etiquetaDoVendedor, faltandoParaEnviar, lerConfigCrm, nomeDoContato, notaDoCard, tituloDoCard, type Candidato } from '@/lib/crm';
import { Crpro, enviarLead } from '@/lib/crpro/cliente';
```

- [ ] **Passo 2: O tipo novo na fila**

Troque a linha do `type ItemTipo`:

```ts
type ItemTipo = 'transcricao' | 'analise_conversa' | 'relatorio_vendedor' | 'rollup_unidade' | 'rollup_rede' | 'envio_crm';
```

Em `processarLote`, acrescente `'envio_crm'` ao filtro de candidatos:

```ts
        .in('tipo', ['transcricao', 'analise_conversa', 'relatorio_vendedor', 'rollup_unidade', 'rollup_rede', 'envio_crm'])
```

E no despacho, depois da linha do `rollup_rede`:

```ts
            else if (item.tipo === 'envio_crm') await enviarAoCrmItem(supabase, item.referencia_id, item.data_ref);
```

O `encadear` não precisa de ramo para `envio_crm`: nada depende dele. E `talvezFecharRede` continua sem contá-lo, então o envio ao CRM nunca atrasa o fechamento da rede.

- [ ] **Passo 3: Buscar o candidato e enviar**

Antes de `async function reabrir(`, acrescente:

```ts
type CandidatoCrm = {
    dados: Candidato;
    userId: string;
    unidadeId: string;
    nomeCliente: string | null;
    vendedor: string;
    score: number;
    resumo: string;
    proximaAcao: string;
    profissao: string;
};

/** A conversa, a análise DO DIA e o nome do vendedor — o que o envio ao CRM precisa. */
async function candidatoCrm(supabase: Admin, conversaId: string, dataRef: string): Promise<CandidatoCrm | null> {
    const { data: conversa, error } = await supabase.from('conversas')
        .select('user_id, unidade_id, cliente_telefone, cliente_nome, bloqueada, analises_conversa(tipo_conversa, status, potencial_venda, score_oportunidade, payload)')
        .eq('id', conversaId).eq('analises_conversa.data_ref', dataRef)
        .maybeSingle<{
            user_id: string; unidade_id: string; cliente_telefone: string; cliente_nome: string | null; bloqueada: boolean;
            analises_conversa: { tipo_conversa: string | null; status: string | null; potencial_venda: string | null; score_oportunidade: number | null; payload: Record<string, unknown> | null }[];
        }>();
    if (error) throw error;
    if (!conversa) return null;
    const { data: perfil, error: erroPerfil } = await supabase.from('profiles').select('nome')
        .eq('id', conversa.user_id).maybeSingle<{ nome: string }>();
    if (erroPerfil) throw erroPerfil;
    const analise = conversa.analises_conversa[0] ?? null;
    // Análise anterior ao perfil do cliente não tem profissão no payload.
    const texto = (campo: string) => typeof analise?.payload?.[campo] === 'string' ? analise.payload[campo] as string : '';
    return {
        dados: {
            unidadeId: conversa.unidade_id, bloqueada: conversa.bloqueada, telefone: conversa.cliente_telefone,
            analise: analise && {
                tipo_conversa: analise.tipo_conversa, status: analise.status,
                potencial_venda: analise.potencial_venda, score_oportunidade: analise.score_oportunidade,
            },
        },
        userId: conversa.user_id,
        unidadeId: conversa.unidade_id,
        nomeCliente: conversa.cliente_nome,
        vendedor: perfil?.nome ?? 'Vendedor',
        score: analise?.score_oportunidade ?? 0,
        resumo: texto('resumo'),
        proximaAcao: texto('proxima_acao'),
        profissao: texto('profissao_cliente'),
    };
}

/**
 * Leva o lead quente ao CRPRO — ou, em simulação, só registra que levaria.
 * `envios_crm` garante um card por telefone: o mesmo cliente volta em todo
 * dia que conversa, e pode falar com dois vendedores.
 */
async function enviarAoCrmItem(supabase: Admin, conversaId: string, dataRef: string) {
    const config = lerConfigCrm(process.env);
    const c = await candidatoCrm(supabase, conversaId, dataRef);
    if (!c) throw new IgnorarItem('conversa não encontrada');
    const decisao = decidirEnvio(c.dados, config);
    if (decisao.acao === 'ignorar') throw new IgnorarItem(decisao.motivo);
    const modo = decisao.acao === 'enviar' ? 'envio' : 'simulacao';

    const { data: ja, error: erroJa } = await supabase.from('envios_crm').select('id')
        .eq('telefone', decisao.telefone).eq('modo', modo).maybeSingle();
    if (erroJa) throw erroJa;
    if (ja) throw new IgnorarItem('cliente já está no CRM');

    let ids: { crpro_contato_id: string | null; crpro_card_id: string | null } = { crpro_contato_id: null, crpro_card_id: null };
    if (decisao.acao === 'enviar') {
        const faltam = faltandoParaEnviar(config);
        // Erro, não ignorado: configuração faltando tem de aparecer como falha.
        if (faltam.length) throw new Error(`envio ao CRM sem configuração: ${faltam.join(', ')}`);
        const r = await enviarLead(new Crpro(config.baseUrl, config.apiKey), {
            telefone: decisao.telefone,
            nome: nomeDoContato(c.nomeCliente, decisao.telefone),
            titulo: tituloDoCard(c.nomeCliente, c.profissao, decisao.telefone),
            etiqueta: etiquetaDoVendedor(c.vendedor),
            nota: notaDoCard({ vendedor: c.vendedor, dataRef, score: c.score, resumo: c.resumo, proximaAcao: c.proximaAcao }),
        }, { pipelineId: config.pipelineId, stageId: config.stageId, linha: config.linha });
        ids = { crpro_contato_id: r.contatoId, crpro_card_id: r.cardId };
    }

    // Dois workers com o mesmo cliente ao mesmo tempo: o segundo bate na
    // unique e não grava de novo; no CRPRO o external_ref já o segurou.
    const { error } = await supabase.from('envios_crm').upsert({
        telefone: decisao.telefone, modo, conversa_id: conversaId, user_id: c.userId,
        unidade_id: c.unidadeId, data_ref: dataRef, ...ids,
    }, { onConflict: 'telefone,modo', ignoreDuplicates: true });
    if (error) throw error;
}

/** Lead quente da análise do dia entra na fila do CRM; o resto nem vira item. */
async function talvezEnfileirarCrm(supabase: Admin, conversaId: string, dataRef: string) {
    const config = lerConfigCrm(process.env);
    // Desligado: nem consulta o banco.
    if (!config.unidades.trim()) return;
    const c = await candidatoCrm(supabase, conversaId, dataRef);
    if (c && decidirEnvio(c.dados, config).acao !== 'ignorar') await reabrir(supabase, 'envio_crm', conversaId, dataRef);
}
```

- [ ] **Passo 4: Enfileirar depois da análise**

No `encadear`, o ramo de `analise_conversa` passa a ser:

```ts
    if (tipo === 'analise_conversa') {
        const { data: conversa } = await supabase.from('conversas').select('user_id').eq('id', referenciaId).maybeSingle<{ user_id: string }>();
        if (!conversa) return;
        if (!await vendedorTemAnalisePendente(supabase, conversa.user_id, dataRef)) {
            await reabrir(supabase, 'relatorio_vendedor', conversa.user_id, dataRef);
        }
        // Depois do relatório, e com o próprio catch: o CRM falhar não pode
        // impedir o dia de fechar.
        await talvezEnfileirarCrm(supabase, referenciaId, dataRef).catch((e) => {
            console.error(`processar-fila: falha ao enfileirar envio ao CRM ${referenciaId} ${dataRef}`, e);
        });
    } else if (tipo === 'relatorio_vendedor') {
```

Note: o `encadear` só roda para a análise quando ela mudou (`encadeiaSeMudou`) ou falhou de vez. Análise que caiu no atalho de "transcript igual" não reenfileira: o cliente já foi avaliado com aquele mesmo texto.

- [ ] **Passo 5: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: os três sem erro; `crm.test.ts` e `cliente-crpro.test.ts` entre os que passam.

Se o typecheck reclamar do `.eq('analises_conversa.data_ref', dataRef)` combinado com `maybeSingle<...>()`, troque a análise por uma consulta separada (`supabase.from('analises_conversa').select('tipo_conversa, status, potencial_venda, score_oportunidade, payload').eq('conversa_id', conversaId).eq('data_ref', dataRef).maybeSingle()`) e monte `analise` com ela. O resto da função não muda.

- [ ] **Passo 6: Commit**

```bash
git add app/api/cron/processar-fila/route.ts
git commit -m "feat: análise do dia que dá lead quente vira card no CRPRO"
```

---

### Tarefa 5: Conferência da chave, variáveis e documentação

**Files:**
- Create: `scripts/crpro-checar.ts`
- Modify: `.env.example` (depois do bloco `MEC_DETALHE_UNIDADES`)
- Modify: `docs/03-pipeline-de-analise.md` (seção nova 3.11, no fim)
- Modify: `docs/superpowers/plans/2026-10-03-pedidos-piloto-redemac.md` (seção "Fora deste plano")

**Interfaces:**
- Consumes: `lerConfigCrm` (Tarefa 2).

- [ ] **Passo 1: Script de conferência (só leitura)**

`scripts/crpro-checar.ts`:

```ts
/**
 * Confere a chave do CRPRO sem escrever nada: a chave abre, é da organização
 * certa (o funil configurado está lá, com a etapa), e lê cards.
 *
 *   node --env-file=.env.local scripts/crpro-checar.ts
 *
 * Não prova `contacts:write` nem `deals:write` — isso só a primeira escrita
 * prova. Confira as permissões da chave no painel do CRPRO.
 */
import { lerConfigCrm } from '../lib/crm.ts';

const config = lerConfigCrm(process.env);
if (!config.apiKey) {
    console.error('CRPRO_API_KEY ausente no ambiente');
    process.exit(1);
}

async function ler(caminho: string): Promise<unknown> {
    const r = await fetch(`${config.baseUrl}${caminho}`, {
        headers: { 'x-api-key': config.apiKey }, signal: AbortSignal.timeout(15_000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
        console.error(`GET ${caminho}: ${r.status}`, JSON.stringify(corpo));
        process.exit(1);
    }
    return corpo;
}

type Funil = { id: string; name: string; stages?: { id: string; name: string; is_default_entry_point?: boolean }[] };
const { data: funis = [] } = await ler('/pipelines') as { data?: Funil[] };
for (const f of funis) console.log(`funil ${f.name} (${f.id}): ${(f.stages ?? []).map((s) => `${s.name}${s.is_default_entry_point ? ' [entrada]' : ''}`).join(' → ')}`);

const funil = funis.find((f) => f.id === config.pipelineId);
const etapa = funil?.stages?.find((s) => s.id === config.stageId);
console.log(funil ? `OK funil configurado: ${funil.name}` : 'FALTA o funil CRPRO_PIPELINE_ID nesta organização — a chave é de outra org?');
console.log(etapa ? `OK etapa configurada: ${etapa.name}` : 'FALTA a etapa CRPRO_STAGE_ID neste funil');
if (etapa?.is_default_entry_point) console.log('ATENÇÃO a etapa ainda é de entrada: contato novo ganharia card automático');

await ler('/deals?limit=1');
console.log('OK a chave lê cards (deals:read)');
console.log(config.linha ? `linha configurada: ${config.linha}` : 'FALTA CRPRO_CONNECTED_PHONE');
```

- [ ] **Passo 2: Variáveis no `.env.example`**

Depois do bloco do `MEC_DETALHE_UNIDADES`:

```bash
# Lead quente → CRM CRPRO (plano 2026-10-04). A chave define a organização (Zona Nova2).
# Unidades: vazio = desligado; * = todas; ou ids separados por vírgula.
# Modo: só "envio" envia de verdade; qualquer outro valor só registra em envios_crm.
CRPRO_UNIDADES=
CRPRO_MODO=simulacao
CRPRO_API_KEY=
CRPRO_BASE_URL=https://app.crpro.com.br/api/v1
CRPRO_PIPELINE_ID=cf2f67c9-d72e-424e-aaa1-ea0d9f9a5b7f
CRPRO_STAGE_ID=e674b359-2790-4021-adcf-2f26025b6bf1
# A linha de WhatsApp conectada na Zona Nova2, só dígitos (ex.: 5554999999999).
CRPRO_CONNECTED_PHONE=
```

- [ ] **Passo 3: Documentar a etapa no pipeline**

No fim de `docs/03-pipeline-de-analise.md`:

```markdown
## 3.11 Envio ao CRM (lead quente → CRPRO)

Depois de cada análise que mudou, o `encadear` olha a análise do dia. Se é
negociação em andamento, com potencial alto e nota de oportunidade ≥ 70, de
unidade em `CRPRO_UNIDADES` e de conversa fora de qualquer lista de exclusão,
entra na fila um item `envio_crm` (referência: a conversa).

O item cria ou atualiza o contato no CRPRO (org Zona Nova2), soma a etiqueta
com o nome do vendedor, e cria o card na etapa Lead com
`external_ref = zonanova:<telefone>` e uma nota com o resumo e a próxima
ação. Um telefone, um card: `envios_crm` trava no ZonaNova e o `external_ref`
trava no CRPRO. O card não é movido de novo — o vendedor é dono dele.

`CRPRO_MODO` diferente de `envio` só grava em `envios_crm` com
`modo = 'simulacao'`, sem chamar o CRPRO. O item não conta para o fechamento
da rede.
```

- [ ] **Passo 4: Apontar o plano anterior para este**

Em `docs/superpowers/plans/2026-10-03-pedidos-piloto-redemac.md`, logo abaixo do título `## Fora deste plano: lista quente → CRPRO`, acrescente:

```markdown
> Resolvido em 04/10/2026 pelo plano `2026-10-04-leads-quentes-crpro.md`: opção de card para o vendedor trabalhar (sem disparo), org Zona Nova2, etapa Lead. A validação LGPD (item 2) continua sendo o portão do envio real.
```

- [ ] **Passo 5: Verificar e commit**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

```bash
git add scripts/crpro-checar.ts .env.example docs/03-pipeline-de-analise.md docs/superpowers/plans/2026-10-03-pedidos-piloto-redemac.md
git commit -m "docs: envio do lead quente ao CRPRO no pipeline e conferência da chave"
```

---

### Tarefa 6: Colocar no ar (operacional, sem código)

**Files:** nenhum.

- [ ] **Passo 1: Conferir a chave (só leitura)**

O José coloca no `.env.local` as variáveis da Tarefa 5, com `CRPRO_API_KEY` e `CRPRO_CONNECTED_PHONE`. A chave é colocada por ele, não por agente. Depois:

Run: `node --env-file=.env.local scripts/crpro-checar.ts`
Expected: `OK funil configurado: Vendas Padrão`, `OK etapa configurada: Lead`, **sem** a linha `ATENÇÃO a etapa ainda é de entrada`, e `OK a chave lê cards`. Se aparecer `FALTA o funil`, a chave não é da Zona Nova2.

- [ ] **Passo 2: Migração em produção**

Aplicar a `0023_envio_crm.sql` no Supabase de produção pelo mesmo caminho da 0021 e da 0022. Conferir com:

```sql
select to_regclass('public.envios_crm') is not null as tabela,
       pg_get_constraintdef(oid) like '%envio_crm%' as fila
from pg_constraint where conname = 'fila_processamento_tipo_check';
```

Expected: `tabela = true`, `fila = true`. Só então fazer o deploy do código.

- [ ] **Passo 3: Uma semana em simulação**

Na Vercel: as variáveis da Tarefa 5 com `CRPRO_MODO=simulacao` e `CRPRO_UNIDADES` com as unidades do piloto. Depois de cada fechamento:

```sql
select e.data_ref, p.nome as vendedor, e.telefone, a.score_oportunidade, a.payload->>'resumo' as resumo
from envios_crm e
join profiles p on p.id = e.user_id
join analises_conversa a on a.conversa_id = e.conversa_id and a.data_ref = e.data_ref
where e.modo = 'simulacao'
order by e.data_ref desc, a.score_oportunidade desc;
```

Mostrar a lista ao Silas: são esses os leads que ele quer no CRM? Se vierem leads demais ou de menos, o ajuste é `NOTA_MINIMA` em `lib/crm.ts`, com teste. Anotar na task do ClickUp a quantidade por dia e 3 exemplos.

- [ ] **Passo 4: Envio real**

Só depois do ok da Redemac sobre o uso dos contatos no CRM (LGPD: o aceite em `/conectar` fala em "armazenadas e analisadas para gestão") e com a linha conectada na Zona Nova2: `CRPRO_MODO=envio` na Vercel, começando por uma unidade em `CRPRO_UNIDADES`. No dia seguinte, conferir no CRPRO que os cards estão em Lead, com a etiqueta do vendedor e a nota, e que nenhum cliente tem dois cards.

Nas primeiras semanas de envio real, conferir todo dia os envios que falharam. Um item `envio_crm` que termina `falhou` (CRPRO fora do ar por mais de ~70 min: o backoff é 5/20/45 min) não é tentado de novo, a menos que a análise da conversa mude, e a tela /admin só mostra os últimos 100 itens da fila:

```sql
select referencia_id as conversa_id, data_ref, tentativas, ultimo_erro, processado_em
from fila_processamento
where tipo = 'envio_crm' and status = 'falhou'
order by processado_em desc;

-- Reenfileirar um item depois que o CRPRO voltar:
select zn_reabrir_item('envio_crm', '<conversa_id>', '<data_ref>');
```

## Ordem e dependências

- **1 → 2 → 3 → 4 → 5 → 6.** A 2 e a 3 não dependem da 1 e podem andar em paralelo com ela; a 4 precisa das três.
- A 0023 em produção (Tarefa 6, passo 2) vem antes do deploy do código da Tarefa 4.
- O envio real (Tarefa 6, passo 4) depende de duas coisas fora do código: a linha conectada na Zona Nova2 e o ok de LGPD.

## Fora deste plano

- **Segundo vendedor no mesmo cliente.** Hoje o segundo vendedor que pega um cliente já enviado não ganha etiqueta: o item é ignorado como "já está no CRM". Se o Silas quiser ver os dois vendedores no contato, é um `etiquetar` a mais nesse caminho.
- **Tela no ZonaNova.** O gestor não vê os envios na aplicação; a conferência é por SQL e pelo próprio CRPRO.
- **Dono do card no CRPRO.** O campo `seller` do `POST /deals` só casa com membro da organização no CRPRO. Os vendedores da Redemac não são membros da Zona Nova2, então o vendedor vai só como etiqueta e na nota.
