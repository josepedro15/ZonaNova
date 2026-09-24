# MEC estruturado — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda análise de negociação passa a devolver o MEC em campos fechados, com trecho de prova: as 7 informações da sondagem, perguntas abertas e fechadas, frases proibidas, a objeção pelo catálogo com Cachorro/Papagaio/Minhoca, preço e gerência, e a técnica de fechamento. Esses campos são gravados em `mec_observacoes`, somados por dia e mostrados nas telas do MEC.

**Architecture:** As regras e os schemas ficam em funções puras em `lib/mec.ts`, feitas com TDD. Os códigos vêm do playbook vigente no banco, então o schema é montado em tempo de execução. O worker pede o bloco `mec_detalhe` na mesma chamada da análise, só para as unidades ligadas em `MEC_DETALHE_UNIDADES`. Grava uma linha por sinal observado e soma tudo no fechamento diário. As telas leem `mec_observacoes` e usam as mesmas funções para somar.

**Tech Stack:** Next 16 (App Router), Supabase (Postgres, RLS), OpenAI Responses API em modo `json_schema strict`, Zod 4, `node --test` com TS nativo (Node 25).

**Spec:** `docs/superpowers/specs/2026-09-24-mec-estruturado-design.md`

## Global Constraints

- Branch `redesign/redemac`. Nunca faça `git add` dos `docs/0*.md` que já estavam modificados (são do usuário). Nada de `git add -A` ou `git add .`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Os códigos dos itens (`sondagem_a`…`sondagem_g`, `algo_mais`, `preco_alto`, `concorrente`, `confianca`, `pensar`, `internet`, `entrega_hoje`, `permuta`, `marca_pedreiro`, `direto`, `opcoes`) vêm de `playbook_itens.chave`, nunca escritos à mão fora de fixture de teste.
- `fora_do_catalogo` (objeção) e `outra` (técnica de fechamento) são os únicos códigos fixos.
- O detalhe só existe em `tipo_conversa = 'negociacao'`.
- Zero invenção: `capturada: true` sem trecho conta como **não** capturada.
- Ausência aparece como ausência ("sem conversa com sondagem aplicável", "—"), nunca como zero.
- Não mudar a nota de atendimento nem a regra de aderência (`aplicadas ÷ aplicáveis`).
- Imports dentro de `lib/` usam extensão `.ts`. Telas importam `@/lib/...` e `@/components/ui`.
- Telas usam só `components/ui` e tokens: sem hex, alvos de toque ≥ 44px (`min-h-11`), cor sempre com texto ou seta.
- **Ações de produção precisam de autorização explícita do usuário antes:** aplicar migration no Supabase de produção, mudar variável de ambiente na Vercel, fazer deploy e reprocessar dias. Isso vale só para o roteiro do piloto (Task 11, Step 4).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/mec.ts` + `tests/unidade/mec.test.ts` | tipos, interruptor por unidade, schemas (JSON e Zod), normalização em observações, resumo, contagem de objeções, concordância |
| `lib/analise.ts` | `montarSchemaAnalise(itens)`: o schema da análise com ou sem `mec_detalhe` |
| `lib/openai-analise.ts` | `analisarConversa` recebe `itens` e soma as regras do detalhe ao prompt |
| `supabase/migrations/0021_mec_estruturado.sql` | tabela `mec_observacoes` + RLS e grants; `aderencia_diaria.sondagem_itens` numeric; `aderencia_diaria.detalhe` |
| `tests/rls.sql` | isolamento de `mec_observacoes` |
| `app/api/cron/processar-fila/route.ts` | playbook com códigos, gravação das observações, resumo diário |
| `lib/mec-dados.ts` | carrega o playbook (rótulos e seções provisórias) para as telas |
| `app/(app)/conversas/[id]/checklist-mec.tsx` + `page.tsx` | checklist por etapa na conversa |
| `app/(app)/meu-mec/page.tsx` | Meu MEC reescrito |
| `app/(app)/equipe/mec/page.tsx` | Aderência da equipe reescrita, com matriz vendedor × sondagem |
| `app/(app)/equipe/visao-unidade.tsx` | Objeções da semana pelo código do catálogo |
| `app/(app)/mec/page.tsx` | MEC estruturado por loja (supervisor) |
| `scripts/mec-calibracao.mjs` | unidade piloto, exportar planilha, comparar concordância |

---

### Task 1: `lib/mec.ts` — tipos, interruptor e schemas (TDD)

**Files:**
- Create: `lib/mec.ts`
- Test: `tests/unidade/mec.test.ts`

**Interfaces:**
- Produces:
  - `type TipoItem = 'informacao' | 'frase_proibida' | 'objecao' | 'tecnica' | 'regra'`
  - `type ItemPlaybook = { chave: string; tipo: TipoItem; rotulo: string; etapa: string }`
  - `const FORA_DO_CATALOGO = 'fora_do_catalogo'`
  - `chavesDoTipo(itens: readonly ItemPlaybook[], tipo: TipoItem): string[]`
  - `detalheLigado(unidadeId: string, config: string | undefined): boolean`
  - `etapaProvisoria(descricao: string | null | undefined): boolean`
  - `schemaJsonDetalhe(itens): Record<string, unknown>` (JSON Schema strict)
  - `schemaDetalhe(itens)` (Zod) e `type DetalheMec`
  - `REGRAS_DETALHE_MEC: string` (texto que entra no prompt)

- [ ] **Step 1: Escrever os testes**

`tests/unidade/mec.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    chavesDoTipo, detalheLigado, etapaProvisoria, schemaDetalhe, schemaJsonDetalhe, FORA_DO_CATALOGO, type ItemPlaybook,
} from '../../lib/mec.ts';

export const SONDAGEM = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((l) => `sondagem_${l}`);
export const ITENS: ItemPlaybook[] = [
    ...SONDAGEM.map((chave) => ({ chave, tipo: 'informacao' as const, rotulo: `Info ${chave}`, etapa: 'sondagem' })),
    { chave: 'algo_mais', tipo: 'frase_proibida', rotulo: 'Algo mais?', etapa: 'solucao_completa' },
    { chave: 'preco_alto', tipo: 'objecao', rotulo: 'Preço alto', etapa: 'contorno_objecoes' },
    { chave: 'pensar', tipo: 'objecao', rotulo: 'Vou pensar', etapa: 'contorno_objecoes' },
    { chave: 'direto', tipo: 'tecnica', rotulo: 'Fechamento direto', etapa: 'fechamento' },
    { chave: 'opcoes', tipo: 'tecnica', rotulo: 'Limitação de opções', etapa: 'fechamento' },
];
export const DETALHE = {
    sondagem: {
        aplicavel: true,
        itens: SONDAGEM.map((chave, i) => ({ chave, capturada: i < 3, trecho: i < 3 ? `trecho ${i}` : null })),
        perguntas_abertas: 2, perguntas_fechadas: 3,
    },
    solucao_completa: {
        complementares_oferecidos: [{ produto: 'rolo', trecho: 'leva o rolo junto' }],
        prazo_informado: true, condicao_informada: false,
        frases_proibidas: [{ chave: 'algo_mais', trecho: 'algo mais?' }],
    },
    objecoes: [
        { codigo: 'preco_alto', descricao: 'achou caro', trecho: 'tá caro', cachorro: true, papagaio: true, minhoca: true,
          ordem_correta: true, concordou_ou_criticou: false, minhoca_do_catalogo: true },
        { codigo: FORA_DO_CATALOGO, descricao: 'sem lugar para o caminhão', trecho: 'não tem onde parar', cachorro: false,
          papagaio: false, minhoca: true, ordem_correta: true, concordou_ou_criticou: true, minhoca_do_catalogo: false },
    ],
    preco: { desconto_mencionado: true, trecho_desconto: 'faço 5%', mencionou_gerencia: false, orcamento_concorrente: false, conferiu_orcamento: null },
    fechamento: { tentou: true, tecnica: 'opcoes', trecho: 'entrego ou vocês retiram?', final_positivo: true },
};

test('chaves do playbook por tipo', () => {
    assert.deepEqual(chavesDoTipo(ITENS, 'objecao'), ['preco_alto', 'pensar']);
    assert.equal(chavesDoTipo(ITENS, 'informacao').length, 7);
});

test('interruptor por unidade: vazio desliga, * liga tudo, lista liga só as listadas', () => {
    assert.equal(detalheLigado('u1', undefined), false);
    assert.equal(detalheLigado('u1', '  '), false);
    assert.equal(detalheLigado('u1', '*'), true);
    assert.equal(detalheLigado('u1', 'u0, u1'), true);
    assert.equal(detalheLigado('u2', 'u0,u1'), false);
});

test('seção provisória do Book é detectada pela descrição da etapa', () => {
    assert.equal(etapaProvisoria('Aplicar cachorro... Seção provisória do Book.'), true);
    assert.equal(etapaProvisoria('Cumprimentar e manter tom cordial.'), false);
    assert.equal(etapaProvisoria(null), false);
});

test('JSON Schema leva os códigos do playbook como enum', () => {
    const s = schemaJsonDetalhe(ITENS) as any;
    const itensSondagem = s.properties.sondagem.properties.itens;
    assert.equal(itensSondagem.minItems, 7);
    assert.equal(itensSondagem.maxItems, 7);
    assert.deepEqual(itensSondagem.items.properties.chave.enum, SONDAGEM);
    assert.deepEqual(s.properties.objecoes.items.properties.codigo.enum, ['preco_alto', 'pensar', FORA_DO_CATALOGO]);
    assert.deepEqual(s.properties.fechamento.properties.tecnica.enum, ['direto', 'opcoes', 'outra', null]);
    assert.equal(s.additionalProperties, false);
});

test('Zod aceita um detalhe válido', () => {
    assert.doesNotThrow(() => schemaDetalhe(ITENS).parse(DETALHE));
});

test('Zod rejeita objeção fora do enum e sondagem incompleta ou repetida', () => {
    const z = schemaDetalhe(ITENS);
    assert.throws(() => z.parse({ ...DETALHE, objecoes: [{ ...DETALHE.objecoes[0], codigo: 'inventada' }] }));
    assert.throws(() => z.parse({ ...DETALHE, sondagem: { ...DETALHE.sondagem, itens: DETALHE.sondagem.itens.slice(1) } }));
    const repetida = DETALHE.sondagem.itens.map((i) => ({ ...i, chave: 'sondagem_a' }));
    assert.throws(() => z.parse({ ...DETALHE, sondagem: { ...DETALHE.sondagem, itens: repetida } }));
});

test('playbook sem frase proibida: nenhuma frase é aceita', () => {
    const semFrase = ITENS.filter((i) => i.tipo !== 'frase_proibida');
    assert.equal((schemaJsonDetalhe(semFrase) as any).properties.solucao_completa.properties.frases_proibidas.maxItems, 0);
    assert.throws(() => schemaDetalhe(semFrase).parse(DETALHE));
});
```

- [ ] **Step 2: Ver falhar**

Run: `node --test tests/unidade/mec.test.ts`
Expected: FAIL, `Cannot find module '.../lib/mec.ts'`.

- [ ] **Step 3: Implementar a primeira parte de `lib/mec.ts`**

```ts
import { z } from 'zod';

/**
 * MEC estruturado (spec docs/superpowers/specs/2026-09-24-mec-estruturado-design.md).
 * Os códigos vêm do playbook vigente no banco (`playbook_itens.chave`): quando o
 * Book mudar, a análise acompanha sem deploy. Tudo aqui é puro e testado.
 */

export type TipoItem = 'informacao' | 'frase_proibida' | 'objecao' | 'tecnica' | 'regra';
export type ItemPlaybook = { chave: string; tipo: TipoItem; rotulo: string; etapa: string };

export const FORA_DO_CATALOGO = 'fora_do_catalogo';
const OUTRA = 'outra';

export function chavesDoTipo(itens: readonly ItemPlaybook[], tipo: TipoItem): string[] {
    return itens.filter((i) => i.tipo === tipo).map((i) => i.chave);
}

/** `MEC_DETALHE_UNIDADES`: vazio desliga; `*` liga tudo; senão ids separados por vírgula (piloto). */
export function detalheLigado(unidadeId: string, config: string | undefined): boolean {
    const valor = (config ?? '').trim();
    if (!valor) return false;
    if (valor === '*') return true;
    return valor.split(',').map((s) => s.trim()).includes(unidadeId);
}

/** O Book 1 marca contorno e preço como provisórios; o seed escreve isso na descrição da etapa. */
export function etapaProvisoria(descricao: string | null | undefined): boolean {
    return /provis[óo]ri/i.test(descricao ?? '');
}

const textoOuNulo = { type: ['string', 'null'] } as const;
const enumOuTexto = (chaves: string[]) => (chaves.length ? { type: 'string', enum: chaves } : { type: 'string' });

/** JSON Schema (modo strict da OpenAI) do bloco mec_detalhe, com os enums do playbook. */
export function schemaJsonDetalhe(itens: readonly ItemPlaybook[]): Record<string, unknown> {
    const informacoes = chavesDoTipo(itens, 'informacao');
    const frases = chavesDoTipo(itens, 'frase_proibida');
    const objecoes = [...chavesDoTipo(itens, 'objecao'), FORA_DO_CATALOGO];
    const tecnicas = [...chavesDoTipo(itens, 'tecnica'), OUTRA];
    const itemFrase = {
        type: 'object', additionalProperties: false, required: ['chave', 'trecho'],
        properties: { chave: enumOuTexto(frases), trecho: { type: 'string' } },
    };
    return {
        type: 'object', additionalProperties: false,
        required: ['sondagem', 'solucao_completa', 'objecoes', 'preco', 'fechamento'],
        properties: {
            sondagem: {
                type: 'object', additionalProperties: false,
                required: ['aplicavel', 'itens', 'perguntas_abertas', 'perguntas_fechadas'],
                properties: {
                    aplicavel: { type: 'boolean' },
                    itens: {
                        type: 'array', minItems: informacoes.length, maxItems: informacoes.length,
                        items: {
                            type: 'object', additionalProperties: false, required: ['chave', 'capturada', 'trecho'],
                            properties: { chave: enumOuTexto(informacoes), capturada: { type: 'boolean' }, trecho: textoOuNulo },
                        },
                    },
                    perguntas_abertas: { type: 'integer', minimum: 0 },
                    perguntas_fechadas: { type: 'integer', minimum: 0 },
                },
            },
            solucao_completa: {
                type: 'object', additionalProperties: false,
                required: ['complementares_oferecidos', 'prazo_informado', 'condicao_informada', 'frases_proibidas'],
                properties: {
                    complementares_oferecidos: {
                        type: 'array', items: {
                            type: 'object', additionalProperties: false, required: ['produto', 'trecho'],
                            properties: { produto: { type: 'string' }, trecho: { type: 'string' } },
                        },
                    },
                    prazo_informado: { type: 'boolean' },
                    condicao_informada: { type: 'boolean' },
                    frases_proibidas: frases.length ? { type: 'array', items: itemFrase } : { type: 'array', maxItems: 0, items: itemFrase },
                },
            },
            objecoes: {
                type: 'array', items: {
                    type: 'object', additionalProperties: false,
                    required: ['codigo', 'descricao', 'trecho', 'cachorro', 'papagaio', 'minhoca', 'ordem_correta', 'concordou_ou_criticou', 'minhoca_do_catalogo'],
                    properties: {
                        codigo: { type: 'string', enum: objecoes }, descricao: { type: 'string' }, trecho: { type: 'string' },
                        cachorro: { type: 'boolean' }, papagaio: { type: 'boolean' }, minhoca: { type: 'boolean' },
                        ordem_correta: { type: 'boolean' }, concordou_ou_criticou: { type: 'boolean' },
                        minhoca_do_catalogo: { type: ['boolean', 'null'] },
                    },
                },
            },
            preco: {
                type: 'object', additionalProperties: false,
                required: ['desconto_mencionado', 'trecho_desconto', 'mencionou_gerencia', 'orcamento_concorrente', 'conferiu_orcamento'],
                properties: {
                    desconto_mencionado: { type: 'boolean' }, trecho_desconto: textoOuNulo,
                    mencionou_gerencia: { type: 'boolean' }, orcamento_concorrente: { type: 'boolean' },
                    conferiu_orcamento: { type: ['boolean', 'null'] },
                },
            },
            fechamento: {
                type: 'object', additionalProperties: false,
                required: ['tentou', 'tecnica', 'trecho', 'final_positivo'],
                properties: {
                    tentou: { type: 'boolean' },
                    tecnica: { type: ['string', 'null'], enum: [...tecnicas, null] },
                    trecho: textoOuNulo,
                    final_positivo: { type: 'boolean' },
                },
            },
        },
    };
}

const enumZ = (chaves: string[]) => (chaves.length ? z.enum(chaves as [string, ...string[]]) : z.string());

/** O mesmo contrato em Zod: a resposta da OpenAI passa por aqui antes de ser gravada. */
export function schemaDetalhe(itens: readonly ItemPlaybook[]) {
    const informacoes = chavesDoTipo(itens, 'informacao');
    const frases = chavesDoTipo(itens, 'frase_proibida');
    const objecoes = [...chavesDoTipo(itens, 'objecao'), FORA_DO_CATALOGO];
    const tecnicas = [...chavesDoTipo(itens, 'tecnica'), OUTRA];
    const frase = z.object({ chave: enumZ(frases), trecho: z.string() });
    return z.object({
        sondagem: z.object({
            aplicavel: z.boolean(),
            itens: z.array(z.object({ chave: enumZ(informacoes), capturada: z.boolean(), trecho: z.string().nullable() }))
                .length(informacoes.length)
                .refine((xs) => new Set(xs.map((x) => x.chave)).size === xs.length, 'cada informação da sondagem aparece uma vez'),
            perguntas_abertas: z.number().int().min(0),
            perguntas_fechadas: z.number().int().min(0),
        }),
        solucao_completa: z.object({
            complementares_oferecidos: z.array(z.object({ produto: z.string(), trecho: z.string() })),
            prazo_informado: z.boolean(),
            condicao_informada: z.boolean(),
            frases_proibidas: frases.length ? z.array(frase) : z.array(frase).max(0),
        }),
        objecoes: z.array(z.object({
            codigo: z.enum(objecoes as [string, ...string[]]), descricao: z.string(), trecho: z.string(),
            cachorro: z.boolean(), papagaio: z.boolean(), minhoca: z.boolean(),
            ordem_correta: z.boolean(), concordou_ou_criticou: z.boolean(), minhoca_do_catalogo: z.boolean().nullable(),
        })),
        preco: z.object({
            desconto_mencionado: z.boolean(), trecho_desconto: z.string().nullable(),
            mencionou_gerencia: z.boolean(), orcamento_concorrente: z.boolean(), conferiu_orcamento: z.boolean().nullable(),
        }),
        fechamento: z.object({
            tentou: z.boolean(), tecnica: z.enum(tecnicas as [string, ...string[]]).nullable(),
            trecho: z.string().nullable(), final_positivo: z.boolean(),
        }),
    });
}

export type DetalheMec = z.infer<ReturnType<typeof schemaDetalhe>>;

/** Regras do detalhe que se somam às REGRAS INEGOCIÁVEIS da análise (spec §4). */
export const REGRAS_DETALHE_MEC = `DETALHE DO MEC (campo mec_detalhe):
- Preencha só se tipo_conversa = negociacao; senão devolva mec_detalhe = null.
- Use exatamente os códigos entre colchetes do MEC VIGENTE.
- Sondagem: uma entrada para cada uma das informações do Book. "capturada" = a informação está na conversa, perguntada pelo vendedor ou contada pelo cliente sem pergunta. capturada = true exige trecho literal.
- Pergunta aberta pede relato ("como está a obra?"); fechada pede sim/não ou escolha ("é pra área externa?"). Conte só perguntas do vendedor.
- Frase proibida: cada ocorrência literal dita pelo vendedor; mensagem [automática] não conta.
- Objeção fora do catálogo vira fora_do_catalogo com a descrição; nunca force o código mais próximo.
- ordem_correta considera só os passos presentes (cachorro, depois papagaio, depois minhoca).
- Contorno de objeções e estratégia de preço são seções provisórias do Book: meça só o que o texto diz, sem critério extra.
- Não invente: sem trecho, a resposta é false ou null.`;
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/unidade/mec.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mec.ts tests/unidade/mec.test.ts
git commit -m "feat: schema do MEC estruturado montado a partir do playbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/mec.ts` — observações, resumo, objeções e concordância (TDD)

**Files:**
- Modify: `lib/mec.ts` (acrescentar no fim)
- Test: `tests/unidade/mec.test.ts` (acrescentar no fim)

**Interfaces:**
- Consumes: `DetalheMec`, `FORA_DO_CATALOGO` (Task 1); `type ContagemObjecao` de `./derivacoes.ts`.
- Produces:
  - `type Sinal = 'sondagem_item' | 'pergunta_aberta' | 'pergunta_fechada' | 'complementar' | 'prazo' | 'condicao' | 'frase_proibida' | 'objecao' | 'desconto' | 'gerencia' | 'orcamento_concorrente' | 'fechamento' | 'final_positivo'`
  - `type Observacao = { etapa: string; sinal: Sinal; item_chave: string | null; valor: boolean | null; detalhe: Record<string, unknown>; trecho: string | null }`
  - `type LinhaObservacao = Observacao & { conversa_id: string }`
  - `observacoesDoDetalhe(d: DetalheMec): Observacao[]`
  - `type ResumoMec = { sondagem_itens: number | null; frases_proibidas: number; detalhe: DetalheDia }`
  - `type DetalheDia = { conversas: number; conversas_com_sondagem: number; sondagem_por_item: Record<string, number>; perguntas_abertas_pct: number | null; objecoes: Record<string, number>; fora_do_catalogo: number; contorno_completo_pct: number | null; concordou_ou_criticou: number; desconto_mencionado: number; fechamento: Record<string, number>; final_positivo_pct: number | null }`
  - `resumirObservacoes(linhas: readonly LinhaObservacao[], sondagemAplicavel: ReadonlySet<string>): ResumoMec`
  - `contarObjecoesPorCodigo(linhas: readonly { item_chave: string | null }[], rotulos: ReadonlyMap<string, string>, quantas?: number): ContagemObjecao[]`
  - `normalizarCelula(v: string): string`, `concordancia(pares: readonly { ia: string; humano: string }[]): number | null`

- [ ] **Step 1: Acrescentar os testes** (no fim de `tests/unidade/mec.test.ts`; acrescente ao import de `../../lib/mec.ts` os nomes `concordancia, contarObjecoesPorCodigo, normalizarCelula, observacoesDoDetalhe, resumirObservacoes, type DetalheMec, type LinhaObservacao`)

```ts
const comConversa = (conversa_id: string, d: DetalheMec): LinhaObservacao[] =>
    observacoesDoDetalhe(d).map((o) => ({ ...o, conversa_id }));

const variar = (mudancas: Partial<typeof DETALHE>) => ({ ...DETALHE, ...mudancas }) as DetalheMec;

test('um detalhe vira uma linha por sinal', () => {
    const o = observacoesDoDetalhe(DETALHE as DetalheMec);
    // 7 sondagem + 2 perguntas + 1 complementar + prazo + condição + 1 frase + 2 objeções + 3 preço + 2 fechamento
    assert.equal(o.length, 20);
    assert.deepEqual(o.filter((x) => x.sinal === 'sondagem_item' && x.valor).map((x) => x.item_chave), SONDAGEM.slice(0, 3));
    const fecha = o.find((x) => x.sinal === 'fechamento')!;
    assert.deepEqual([fecha.item_chave, fecha.valor, fecha.etapa], ['opcoes', true, 'fechamento']);
    assert.equal(o.find((x) => x.sinal === 'pergunta_aberta')!.detalhe.contagem, 2);
});

// Zero invenção: sem trecho, não conta.
test('capturada sem trecho conta como não capturada', () => {
    const d = variar({ sondagem: { ...DETALHE.sondagem, itens: SONDAGEM.map((chave) => ({ chave, capturada: true, trecho: '  ' })) } });
    assert.equal(observacoesDoDetalhe(d).filter((x) => x.sinal === 'sondagem_item' && x.valor).length, 0);
});

test('fechamento não tentado fica sem código', () => {
    const d = variar({ fechamento: { tentou: false, tecnica: null, trecho: null, final_positivo: false } });
    const fecha = observacoesDoDetalhe(d).find((x) => x.sinal === 'fechamento')!;
    assert.deepEqual([fecha.item_chave, fecha.valor], [null, false]);
});

test('resumo do dia: sondagem média, por item, perguntas, frases, objeções e fechamento', () => {
    const c2 = variar({
        sondagem: { ...DETALHE.sondagem, itens: SONDAGEM.map((chave, i) => ({ chave, capturada: i < 5, trecho: i < 5 ? 't' : null })) },
        solucao_completa: { ...DETALHE.solucao_completa, frases_proibidas: [] },
        objecoes: [],
        preco: { ...DETALHE.preco, desconto_mencionado: false, trecho_desconto: null },
        fechamento: { tentou: false, tecnica: null, trecho: null, final_positivo: false },
    });
    const r = resumirObservacoes([...comConversa('c1', DETALHE as DetalheMec), ...comConversa('c2', c2)], new Set(['c1', 'c2']));
    assert.equal(r.sondagem_itens, 4);
    assert.deepEqual(r.detalhe.sondagem_por_item, {
        sondagem_a: 100, sondagem_b: 100, sondagem_c: 100, sondagem_d: 50, sondagem_e: 50, sondagem_f: 0, sondagem_g: 0,
    });
    assert.equal(r.detalhe.perguntas_abertas_pct, 40);
    assert.equal(r.frases_proibidas, 1);
    assert.deepEqual(r.detalhe.objecoes, { preco_alto: 1 });
    assert.equal(r.detalhe.fora_do_catalogo, 1);
    assert.equal(r.detalhe.contorno_completo_pct, 50);
    assert.equal(r.detalhe.concordou_ou_criticou, 1);
    assert.equal(r.detalhe.desconto_mencionado, 1);
    assert.deepEqual(r.detalhe.fechamento, { opcoes: 1, nenhum: 1 });
    assert.equal(r.detalhe.final_positivo_pct, 50);
    assert.deepEqual([r.detalhe.conversas, r.detalhe.conversas_com_sondagem], [2, 2]);
});

test('sondagem só conta nas conversas em que cabia', () => {
    const r = resumirObservacoes([...comConversa('c1', DETALHE as DetalheMec), ...comConversa('c3', DETALHE as DetalheMec)], new Set(['c1']));
    assert.equal(r.sondagem_itens, 3);
    assert.equal(r.detalhe.conversas_com_sondagem, 1);
});

test('sem nada para medir, o resumo é ausência e não zero', () => {
    const r = resumirObservacoes([], new Set());
    assert.equal(r.sondagem_itens, null);
    assert.equal(r.detalhe.perguntas_abertas_pct, null);
    assert.equal(r.detalhe.contorno_completo_pct, null);
    assert.equal(r.detalhe.final_positivo_pct, null);
    assert.deepEqual(r.detalhe.sondagem_por_item, {});
});

test('objeções por código do catálogo, com rótulo e fora do catálogo', () => {
    const rotulos = new Map([['preco_alto', 'Preço alto'], ['pensar', 'Vou pensar']]);
    const r = contarObjecoesPorCodigo(
        [{ item_chave: 'pensar' }, { item_chave: 'preco_alto' }, { item_chave: 'pensar' }, { item_chave: FORA_DO_CATALOGO }],
        rotulos,
    );
    assert.deepEqual(r, [
        { objecao: 'Vou pensar', total: 2 },
        { objecao: 'Fora do catálogo', total: 1 },
        { objecao: 'Preço alto', total: 1 },
    ]);
});

test('célula da planilha: maiúsculas, espaços e ordem não importam', () => {
    assert.equal(normalizarCelula(' Pensar | preco_alto '), 'pensar|preco_alto');
    assert.equal(normalizarCelula('preco_alto|pensar'), 'pensar|preco_alto');
});

test('concordância ignora célula que o humano deixou vazia', () => {
    assert.equal(concordancia([
        { ia: 'sim', humano: 'SIM' }, { ia: 'nao', humano: 'sim' },
        { ia: 'preco_alto|pensar', humano: 'pensar | preco_alto' }, { ia: 'sim', humano: '' },
    ]), 67);
    assert.equal(concordancia([{ ia: 'sim', humano: '' }]), null);
});
```

- [ ] **Step 2: Ver falhar**

Run: `node --test tests/unidade/mec.test.ts`
Expected: FAIL, `does not provide an export named 'concordancia'`.

- [ ] **Step 3: Implementar** (no fim de `lib/mec.ts`; no topo, acrescente `import type { ContagemObjecao } from './derivacoes.ts';`)

```ts
export type Sinal =
    | 'sondagem_item' | 'pergunta_aberta' | 'pergunta_fechada' | 'complementar' | 'prazo' | 'condicao'
    | 'frase_proibida' | 'objecao' | 'desconto' | 'gerencia' | 'orcamento_concorrente' | 'fechamento' | 'final_positivo';

export type Observacao = {
    etapa: string; sinal: Sinal; item_chave: string | null; valor: boolean | null;
    detalhe: Record<string, unknown>; trecho: string | null;
};
export type LinhaObservacao = Observacao & { conversa_id: string };

const comTrecho = (t: string | null | undefined): string | null => (t && t.trim() ? t.trim() : null);

/** Uma linha por sinal observado: é o que vai para `mec_observacoes`. */
export function observacoesDoDetalhe(d: DetalheMec): Observacao[] {
    const o: Observacao[] = [];
    const linha = (etapa: string, sinal: Sinal, item_chave: string | null, valor: boolean | null, detalhe: Record<string, unknown> = {}, trecho: string | null = null) =>
        o.push({ etapa, sinal, item_chave, valor, detalhe, trecho });

    for (const i of d.sondagem.itens) {
        const trecho = comTrecho(i.trecho);
        // "capturada" sem prova não conta: regra de zero invenção (spec §11).
        linha('sondagem', 'sondagem_item', i.chave, i.capturada && trecho !== null, {}, trecho);
    }
    linha('sondagem', 'pergunta_aberta', null, null, { contagem: d.sondagem.perguntas_abertas });
    linha('sondagem', 'pergunta_fechada', null, null, { contagem: d.sondagem.perguntas_fechadas });

    const s = d.solucao_completa;
    for (const c of s.complementares_oferecidos) linha('solucao_completa', 'complementar', null, true, { produto: c.produto }, comTrecho(c.trecho));
    linha('solucao_completa', 'prazo', null, s.prazo_informado);
    linha('solucao_completa', 'condicao', null, s.condicao_informada);
    for (const f of s.frases_proibidas) linha('solucao_completa', 'frase_proibida', f.chave, true, {}, comTrecho(f.trecho));

    for (const x of d.objecoes) {
        linha('contorno_objecoes', 'objecao', x.codigo, true, {
            descricao: x.descricao, cachorro: x.cachorro, papagaio: x.papagaio, minhoca: x.minhoca,
            ordem_correta: x.ordem_correta, concordou_ou_criticou: x.concordou_ou_criticou, minhoca_do_catalogo: x.minhoca_do_catalogo,
        }, comTrecho(x.trecho));
    }

    const p = d.preco;
    linha('estrategia_preco', 'desconto', null, p.desconto_mencionado, {}, comTrecho(p.trecho_desconto));
    linha('estrategia_preco', 'gerencia', null, p.mencionou_gerencia);
    linha('estrategia_preco', 'orcamento_concorrente', null, p.orcamento_concorrente, { conferiu: p.conferiu_orcamento });

    const f = d.fechamento;
    linha('fechamento', 'fechamento', f.tentou ? (f.tecnica ?? OUTRA) : null, f.tentou, {}, comTrecho(f.trecho));
    linha('fechamento', 'final_positivo', null, f.final_positivo);
    return o;
}

export type DetalheDia = {
    conversas: number; conversas_com_sondagem: number;
    sondagem_por_item: Record<string, number>; perguntas_abertas_pct: number | null;
    objecoes: Record<string, number>; fora_do_catalogo: number;
    contorno_completo_pct: number | null; concordou_ou_criticou: number;
    desconto_mencionado: number; fechamento: Record<string, number>; final_positivo_pct: number | null;
};
export type ResumoMec = { sondagem_itens: number | null; frases_proibidas: number; detalhe: DetalheDia };

const pct = (parte: number, total: number): number | null => (total ? Math.round((parte / total) * 100) : null);
const somar = (mapa: Record<string, number>, chave: string) => { mapa[chave] = (mapa[chave] ?? 0) + 1; };

/**
 * Resume as observações de um período (dia, vendedor, loja). A sondagem só
 * conta nas conversas em que ela cabia E que têm o detalhe gravado: um dia
 * misto (parte analisada antes do detalhe existir) não puxa a média para baixo.
 */
export function resumirObservacoes(linhas: readonly LinhaObservacao[], sondagemAplicavel: ReadonlySet<string>): ResumoMec {
    const itensSondagem = linhas.filter((l) => l.sinal === 'sondagem_item' && sondagemAplicavel.has(l.conversa_id));
    const comSondagem = new Set(itensSondagem.map((l) => l.conversa_id));
    const capturadas = itensSondagem.filter((l) => l.valor === true);
    const porItem: Record<string, number> = {};
    for (const chave of new Set(itensSondagem.map((l) => l.item_chave ?? ''))) {
        porItem[chave] = pct(capturadas.filter((l) => l.item_chave === chave).length, comSondagem.size) ?? 0;
    }
    const contagem = (sinal: Sinal) => linhas.filter((l) => l.sinal === sinal).reduce((s, l) => s + Number(l.detalhe.contagem ?? 0), 0);
    const abertas = contagem('pergunta_aberta');
    const fechadas = contagem('pergunta_fechada');

    const objecoes = linhas.filter((l) => l.sinal === 'objecao');
    const porCodigo: Record<string, number> = {};
    for (const o of objecoes) if (o.item_chave && o.item_chave !== FORA_DO_CATALOGO) somar(porCodigo, o.item_chave);
    const completo = objecoes.filter((o) => o.detalhe.cachorro === true && o.detalhe.papagaio === true && o.detalhe.minhoca === true && o.detalhe.ordem_correta === true);

    const fechamentos = linhas.filter((l) => l.sinal === 'fechamento');
    const porFechamento: Record<string, number> = {};
    for (const f of fechamentos) somar(porFechamento, f.valor ? (f.item_chave ?? OUTRA) : 'nenhum');
    const finais = linhas.filter((l) => l.sinal === 'final_positivo');

    return {
        sondagem_itens: comSondagem.size ? Math.round((capturadas.length / comSondagem.size) * 10) / 10 : null,
        frases_proibidas: linhas.filter((l) => l.sinal === 'frase_proibida').length,
        detalhe: {
            conversas: new Set(linhas.map((l) => l.conversa_id)).size,
            conversas_com_sondagem: comSondagem.size,
            sondagem_por_item: porItem,
            perguntas_abertas_pct: pct(abertas, abertas + fechadas),
            objecoes: porCodigo,
            fora_do_catalogo: objecoes.filter((o) => o.item_chave === FORA_DO_CATALOGO).length,
            contorno_completo_pct: pct(completo.length, objecoes.length),
            concordou_ou_criticou: objecoes.filter((o) => o.detalhe.concordou_ou_criticou === true).length,
            desconto_mencionado: linhas.filter((l) => l.sinal === 'desconto' && l.valor === true).length,
            fechamento: porFechamento,
            final_positivo_pct: pct(finais.filter((l) => l.valor === true).length, finais.length),
        },
    };
}

/** "Objeções da semana" pelo código do catálogo, com o rótulo do Book. */
export function contarObjecoesPorCodigo(
    linhas: readonly { item_chave: string | null }[], rotulos: ReadonlyMap<string, string>, quantas = 4,
): ContagemObjecao[] {
    const contagem = new Map<string, number>();
    for (const l of linhas) if (l.item_chave) contagem.set(l.item_chave, (contagem.get(l.item_chave) ?? 0) + 1);
    return [...contagem.entries()]
        .map(([chave, total]) => ({ objecao: chave === FORA_DO_CATALOGO ? 'Fora do catálogo' : rotulos.get(chave) ?? chave, total }))
        .sort((a, b) => b.total - a.total || a.objecao.localeCompare(b.objecao, 'pt-BR'))
        .slice(0, quantas);
}

/** Célula da planilha de calibração: minúscula, sem espaço, lista `a|b` em ordem. */
export function normalizarCelula(v: string): string {
    return v.toLocaleLowerCase('pt-BR').split('|').map((s) => s.trim()).filter(Boolean).sort().join('|');
}

/** % de concordância IA × humano; célula que o humano não preencheu não conta. */
export function concordancia(pares: readonly { ia: string; humano: string }[]): number | null {
    const medidos = pares.filter((p) => normalizarCelula(p.humano) !== '');
    return pct(medidos.filter((p) => normalizarCelula(p.ia) === normalizarCelula(p.humano)).length, medidos.length);
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/unidade/mec.test.ts && npm run test:unidade && npm run typecheck`
Expected: tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mec.ts tests/unidade/mec.test.ts
git commit -m "feat: observações do MEC, resumo diário e concordância

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration `0021_mec_estruturado.sql` + teste de RLS

**Files:**
- Create: `supabase/migrations/0021_mec_estruturado.sql`
- Modify: `tests/rls.sql` (bloco novo antes da linha final de `reset role;` do bloco de contestações, depois do teste "supervisor ativo lê a contestação")

**Interfaces:**
- Produces: tabela `public.mec_observacoes (id, conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, sinal, item_chave, valor, detalhe, trecho, created_at)`; `aderencia_diaria.sondagem_itens numeric(3,1)`; `aderencia_diaria.detalhe jsonb not null default '{}'`.

- [ ] **Step 1: Escrever a migration**

```sql
-- =============================================================================
-- MEC estruturado (spec docs/superpowers/specs/2026-09-24-mec-estruturado-design.md §5).
-- Uma linha por sinal observado numa negociação: as 7 informações da sondagem,
-- perguntas abertas/fechadas, frases proibidas, objeção pelo catálogo, preço e
-- fechamento. Fonte das agregações do MEC.
-- =============================================================================

create table if not exists public.mec_observacoes (
    id           uuid primary key default gen_random_uuid(),
    conversa_id  uuid not null references public.conversas(id) on delete cascade,
    user_id      uuid not null references public.profiles(id) on delete cascade,
    unidade_id   uuid not null references public.unidades(id) on delete restrict,
    data_ref     date not null,
    playbook_id  uuid not null references public.playbooks(id) on delete restrict,
    etapa        text not null,
    sinal        text not null check (sinal in (
                     'sondagem_item', 'pergunta_aberta', 'pergunta_fechada', 'complementar', 'prazo', 'condicao',
                     'frase_proibida', 'objecao', 'desconto', 'gerencia', 'orcamento_concorrente',
                     'fechamento', 'final_positivo')),
    item_chave   text,
    valor        boolean,
    detalhe      jsonb not null default '{}'::jsonb,
    trecho       text,
    created_at   timestamptz not null default now()
);

create index if not exists ix_mec_obs_conversa on public.mec_observacoes (conversa_id, data_ref);
create index if not exists ix_mec_obs_user     on public.mec_observacoes (user_id, data_ref);
create index if not exists ix_mec_obs_unidade  on public.mec_observacoes (unidade_id, data_ref);
create index if not exists ix_mec_obs_sinal    on public.mec_observacoes (sinal, item_chave, data_ref);

-- Mesmo escopo de aderencia_conversa: o próprio vendedor e quem vê a unidade.
alter table public.mec_observacoes enable row level security;
drop policy if exists p_mec_observacoes_select on public.mec_observacoes;
create policy p_mec_observacoes_select on public.mec_observacoes
    for select to authenticated
    using (
        public.zn_ativo()
        and (user_id = auth.uid() or unidade_id in (select public.zn_unidades_visiveis()))
    );

-- Tabela nova nasce com ALL para anon/authenticated no Supabase (ver 0003):
-- só leitura, e só pela RLS. Quem escreve é o worker (service role).
revoke all on public.mec_observacoes from anon, authenticated;
grant select on public.mec_observacoes to authenticated;

-- Média de informações capturadas por conversa: 3,4 não cabe em smallint.
alter table public.aderencia_diaria alter column sondagem_itens type numeric(3,1);
alter table public.aderencia_diaria add column if not exists detalhe jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Acrescentar o teste de isolamento em `tests/rls.sql`**

Logo depois da linha `select pg_temp.ok('supervisor ativo lê a contestação', …);` e antes do `reset role;` seguinte, insira:

```sql
reset role;
-- mec_observacoes: mesmo escopo de aderencia_conversa (conversa de Bento).
insert into public.mec_observacoes (conversa_id, user_id, unidade_id, data_ref, playbook_id, etapa, sinal, item_chave, valor, trecho)
values ('cccccccc-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-0000-0000-0000-000000000002', current_date, 'dddddddd-0000-0000-0000-000000000001',
        'sondagem', 'sondagem_item', 'sondagem_a', true, 'o que está construindo?');

set role authenticated;
select pg_temp.como('44444444-4444-4444-4444-444444444444');
select pg_temp.ok('vendedor do Centro NÃO lê observação do MEC de Bento',
       (select count(*) from mec_observacoes), 0);
select pg_temp.como('22222222-2222-2222-2222-222222222222');
select pg_temp.ok('gestor do Centro NÃO lê observação do MEC de Bento',
       (select count(*) from mec_observacoes), 0);
select pg_temp.como('33333333-3333-3333-3333-333333333333');
select pg_temp.ok('gestor de Bento lê a observação do MEC da unidade dele',
       (select count(*) from mec_observacoes), 1);
select pg_temp.como('11111111-1111-1111-1111-111111111111');
select pg_temp.ok('supervisor lê a observação do MEC',
       (select count(*) from mec_observacoes), 1);
```

- [ ] **Step 3: Rodar o teste de RLS local**

Run: `npm run test:rls`
Expected: todas as linhas `PASSOU`, inclusive as 4 novas e as duas da "GUARDA DE PRIVILÉGIOS" (`anon sem privilégio nenhum`, `authenticated escreve só nas tabelas previstas`).
Se o Postgres local não existir nesta máquina (`scripts/db-local.sh` pede o Postgres do Homebrew), registre `DONE_WITH_CONCERNS` com a saída do erro. Não pule a escrita do teste.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0021_mec_estruturado.sql tests/rls.sql
git commit -m "feat: tabela mec_observacoes com RLS e detalhe no resumo diário do MEC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schema da análise com `mec_detalhe` e prompt

**Files:**
- Modify: `lib/analise.ts` (import no topo; função nova depois de `schemaJsonAnalise`)
- Modify: `lib/openai-analise.ts` (`analisarConversa`)
- Test: `tests/unidade/mec.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `schemaJsonDetalhe`, `schemaDetalhe`, `DetalheMec`, `ItemPlaybook`, `REGRAS_DETALHE_MEC` (Task 1).
- Produces:
  - `type ResultadoComDetalhe = ResultadoAnalise & { mec_detalhe?: DetalheMec | null }`
  - `montarSchemaAnalise(itens: readonly ItemPlaybook[] | null): { zod: z.ZodType<ResultadoComDetalhe>; json: Record<string, unknown> }`
  - `analisarConversa({ transcript, doutrina, itens }: { transcript: string; doutrina: string; itens: readonly ItemPlaybook[] | null }): Promise<{ resultado: ResultadoComDetalhe; modelo: string; entrada: number; saida: number }>`

- [ ] **Step 1: Acrescentar os testes** (no fim de `tests/unidade/mec.test.ts`; acrescente `import { montarSchemaAnalise } from '../../lib/analise.ts';` no topo)

```ts
test('sem itens, o schema da análise é o de sempre', () => {
    const { json } = montarSchemaAnalise(null) as { json: any };
    assert.equal(json.properties.mec_detalhe, undefined);
    assert.equal(json.required.includes('mec_detalhe'), false);
});

test('com itens, mec_detalhe é obrigatório e pode ser null', () => {
    const { json, zod } = montarSchemaAnalise(ITENS) as { json: any; zod: any };
    assert.equal(json.required.includes('mec_detalhe'), true);
    assert.deepEqual(json.properties.mec_detalhe.anyOf[1], { type: 'null' });
    assert.equal(zod.shape.mec_detalhe.safeParse(null).success, true);
    assert.equal(zod.shape.mec_detalhe.safeParse(DETALHE).success, true);
});
```

- [ ] **Step 2: Ver falhar**

Run: `node --test tests/unidade/mec.test.ts`
Expected: FAIL, `does not provide an export named 'montarSchemaAnalise'`.

- [ ] **Step 3: Implementar em `lib/analise.ts`**

No topo, depois de `import { z } from 'zod';`:
```ts
import { schemaDetalhe, schemaJsonDetalhe, type DetalheMec, type ItemPlaybook } from './mec.ts';
```
Depois do `} as const;` que fecha `schemaJsonAnalise`:
```ts
export type ResultadoComDetalhe = ResultadoAnalise & { mec_detalhe?: DetalheMec | null };

/**
 * O schema da análise para um playbook. Sem itens (sem playbook vigente, ou
 * unidade fora do piloto), é exatamente o de sempre; com itens, ganha o bloco
 * obrigatório `mec_detalhe` (null fora de negociação), com os enums do Book.
 */
export function montarSchemaAnalise(itens: readonly ItemPlaybook[] | null): { zod: z.ZodType<ResultadoComDetalhe>; json: Record<string, unknown> } {
    if (!itens) return { zod: schemaAnalise as unknown as z.ZodType<ResultadoComDetalhe>, json: schemaJsonAnalise as unknown as Record<string, unknown> };
    return {
        zod: schemaAnalise.extend({ mec_detalhe: schemaDetalhe(itens).nullable() }) as unknown as z.ZodType<ResultadoComDetalhe>,
        json: {
            ...schemaJsonAnalise,
            required: [...schemaJsonAnalise.required, 'mec_detalhe'],
            properties: { ...schemaJsonAnalise.properties, mec_detalhe: { anyOf: [schemaJsonDetalhe(itens), { type: 'null' }] } },
        },
    };
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/unidade/mec.test.ts`
Expected: PASS.

- [ ] **Step 5: `lib/openai-analise.ts` — receber `itens`**

1. Troque o import de `@/lib/analise` por:
```ts
import { montarSchemaAnalise, type ResultadoComDetalhe } from '@/lib/analise';
import { REGRAS_DETALHE_MEC, type ItemPlaybook } from '@/lib/mec';
```
(`schemaAnalise`, `schemaJsonAnalise` e `ResultadoAnalise` deixam de ser importados aqui. Confira com `grep -n "schemaAnalise\|schemaJsonAnalise\|ResultadoAnalise" lib/openai-analise.ts` que não sobrou uso.)

2. Troque a assinatura e o corpo de `analisarConversa` assim:
   - assinatura: `export async function analisarConversa({ transcript, doutrina, itens }: { transcript: string; doutrina: string; itens: readonly ItemPlaybook[] | null }): Promise<{ resultado: ResultadoComDetalhe; modelo: string; entrada: number; saida: number }>`
   - primeira linha do corpo: `const schema = montarSchemaAnalise(itens);`
   - nas `instructions`, troque o final `MEC VIGENTE:\n${doutrina}` por `MEC VIGENTE:\n${doutrina}${itens ? `\n\n${REGRAS_DETALHE_MEC}` : ''}`
   - no `text.format`, troque `schema: schemaJsonAnalise` por `schema: schema.json`
   - no retorno, troque `schemaAnalise.parse(JSON.parse(textoDaResposta(corpo)))` por `schema.zod.parse(JSON.parse(textoDaResposta(corpo)))`

- [ ] **Step 6: Manter o worker compilando**

Em `app/api/cron/processar-fila/route.ts`, na chamada de `analisarConversa`, acrescente `itens: null`:
`analisarConversa({ transcript, doutrina: doutrina.texto, itens: null })`. Isso preserva o comportamento atual (sem detalhe); a Task 5 troca pelo valor real.

- [ ] **Step 7: Checar**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add lib/analise.ts lib/openai-analise.ts tests/unidade/mec.test.ts app/api/cron/processar-fila/route.ts
git commit -m "feat: análise pede mec_detalhe quando o playbook tem itens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Worker — playbook com códigos, gravação e resumo diário

**Files:**
- Modify: `app/api/cron/processar-fila/route.ts` (`doutrinaMec` ~271-285, `analisarItem` ~311-367, `consolidarAderenciaDiaria` ~419-436)
- Modify: `.env.example` (documentar `MEC_DETALHE_UNIDADES`)

**Interfaces:**
- Consumes: `detalheLigado`, `observacoesDoDetalhe`, `resumirObservacoes`, `ItemPlaybook`, `TipoItem`, `DetalheMec`, `LinhaObservacao` (`@/lib/mec`); `analisarConversa({ …, itens })` (Task 4).
- Produces: linhas em `mec_observacoes`; `aderencia_diaria.sondagem_itens/frases_proibidas/detalhe` preenchidos.

- [ ] **Step 1: Imports**

Acrescente depois do import de `@/lib/analise`:
```ts
import { detalheLigado, observacoesDoDetalhe, resumirObservacoes, type DetalheMec, type ItemPlaybook, type LinhaObservacao, type TipoItem } from '@/lib/mec';
```

- [ ] **Step 2: `doutrinaMec` devolve também os itens, e o texto leva os códigos**

Substitua a função inteira por:
```ts
async function doutrinaMec(supabase: Admin): Promise<{ texto: string; playbookId: string | null; itens: ItemPlaybook[] }> {
    const { data: playbook } = await supabase.from('playbooks').select('id,nome,versao').is('vigente_ate', null)
        .maybeSingle<{ id: string; nome: string; versao: string }>();
    if (!playbook) return { playbookId: null, itens: [], texto: 'Avalie acolhida, sondagem, solução completa, contorno de objeções, estratégia de preço, fechamento e acompanhamento conforme aplicabilidade.' };
    const { data: etapas } = await supabase.from('playbook_etapas').select('id,chave,nome,descricao,criterios,ordem').eq('playbook_id', playbook.id).order('ordem');
    const ids = (etapas ?? []).map((e) => e.id as string);
    const { data: itensBanco } = ids.length ? await supabase.from('playbook_itens').select('etapa_id,chave,tipo,rotulo,detalhe,ordem').in('etapa_id', ids).order('ordem') : { data: [] };
    const chaveDaEtapa = new Map((etapas ?? []).map((e) => [e.id as string, e.chave as string]));
    const itens: ItemPlaybook[] = (itensBanco ?? []).map((i) => ({
        chave: i.chave as string, tipo: i.tipo as TipoItem, rotulo: i.rotulo as string, etapa: chaveDaEtapa.get(i.etapa_id as string) ?? '',
    }));
    return {
        playbookId: playbook.id,
        itens,
        texto: `${playbook.nome} (${playbook.versao})\n${(etapas ?? []).map((e) => {
            // O código entre colchetes é o que o mec_detalhe devolve.
            const seus = (itensBanco ?? []).filter((i) => i.etapa_id === e.id).map((i) => `- [${i.chave}] ${i.rotulo}${i.detalhe ? `: ${i.detalhe}` : ''}`).join('\n');
            return `${e.nome}: ${e.descricao}\n${seus}`;
        }).join('\n\n')}`,
    };
}
```

- [ ] **Step 3: Função de gravação** (logo antes de `async function analisarItem`)

```ts
/**
 * Grava o detalhe do MEC de uma conversa num dia. Reanálise troca o detalhe
 * inteiro: apaga o que havia e grava o novo (ou nada, se a conversa deixou de
 * ser negociação ou a unidade está fora do piloto).
 */
async function gravarObservacoes(
    supabase: Admin,
    alvo: { conversaId: string; userId: string; unidadeId: string; dataRef: string; playbookId: string | null },
    detalhe: DetalheMec | null,
) {
    const { error: erroApagar } = await supabase.from('mec_observacoes').delete()
        .eq('conversa_id', alvo.conversaId).eq('data_ref', alvo.dataRef);
    if (erroApagar) throw erroApagar;
    if (!detalhe || !alvo.playbookId) return;
    const { error } = await supabase.from('mec_observacoes').insert(observacoesDoDetalhe(detalhe).map((o) => ({
        conversa_id: alvo.conversaId, user_id: alvo.userId, unidade_id: alvo.unidadeId,
        data_ref: alvo.dataRef, playbook_id: alvo.playbookId, ...o,
    })));
    if (error) throw error;
}
```

- [ ] **Step 4: `analisarItem` pede e grava o detalhe**

Troque:
```ts
    const doutrina = await doutrinaMec(supabase);
    const { resultado, modelo, entrada, saida } = await analisarConversa({ transcript, doutrina: doutrina.texto, itens: null });
```
por:
```ts
    const doutrina = await doutrinaMec(supabase);
    // Piloto por unidade (spec §7): fora da lista, a análise é exatamente a de antes.
    const itensDetalhe = doutrina.playbookId && detalheLigado(unidadeId, process.env.MEC_DETALHE_UNIDADES) ? doutrina.itens : null;
    const { resultado, modelo, entrada, saida } = await analisarConversa({ transcript, doutrina: doutrina.texto, itens: itensDetalhe });
```
Depois do bloco `if (doutrina.playbookId && resultado.tipo_conversa === 'negociacao') { … aderencia_conversa … }` e antes do `return true;`, acrescente:
```ts
    await gravarObservacoes(
        supabase,
        { conversaId, userId: conversa.user_id, unidadeId, dataRef, playbookId: doutrina.playbookId },
        resultado.tipo_conversa === 'negociacao' ? resultado.mec_detalhe ?? null : null,
    );
```

- [ ] **Step 5: `consolidarAderenciaDiaria` preenche as colunas do detalhe**

Substitua a função inteira por:
```ts
async function consolidarAderenciaDiaria(supabase: Admin, userId: string, unidadeId: string, dataRef: string) {
    const [{ data: linhas }, { data: observacoes, error }] = await Promise.all([
        supabase.from('aderencia_conversa').select('conversa_id,playbook_id,etapa,aplicavel,aplicado,itens')
            .eq('user_id', userId).eq('data_ref', dataRef),
        supabase.from('mec_observacoes').select('conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .eq('user_id', userId).eq('data_ref', dataRef).returns<LinhaObservacao[]>(),
    ]);
    if (error) throw error;
    if (!linhas?.length) return;
    const aplicaveis = linhas.filter((l) => l.aplicavel);
    const etapas = [...new Set(aplicaveis.map((l) => String(l.etapa)))];
    const porEtapa = Object.fromEntries(etapas.map((etapa) => {
        const nota = aderenciaPercentual(aplicaveis.filter((l) => l.etapa === etapa));
        return [etapa, nota === null ? null : Math.round(nota)];
    }));
    // Detalhe do MEC (spec §5.2): só existe para conversas analisadas com ele.
    const sondagemAplicavel = new Set(aplicaveis.filter((l) => l.etapa === 'sondagem').map((l) => String(l.conversa_id)));
    const resumo = observacoes?.length ? resumirObservacoes(observacoes, sondagemAplicavel) : null;
    await supabase.from('aderencia_diaria').upsert({
        user_id: userId, unidade_id: unidadeId, data_ref: dataRef, playbook_id: linhas[0].playbook_id,
        aderencia_geral: aderenciaPercentual(aplicaveis),
        por_etapa: porEtapa,
        sondagem_itens: resumo?.sondagem_itens ?? null,
        frases_proibidas: resumo?.frases_proibidas ?? 0,
        detalhe: resumo?.detalhe ?? {},
    }, { onConflict: 'user_id,data_ref' });
}
```

- [ ] **Step 6: Documentar a variável em `.env.example`**

Acrescente no fim:
```
# MEC estruturado (spec 2026-09-24): liga o detalhe do MEC na análise.
# Vazio = desligado; * = todas as unidades; ou ids de unidade separados por vírgula (piloto).
MEC_DETALHE_UNIDADES=
```

- [ ] **Step 7: Checar**

Run: `npm run typecheck && npm run lint && npm run test:unidade && npm run build`
Expected: tudo verde. Com `MEC_DETALHE_UNIDADES` vazia, o comportamento do worker é idêntico ao atual, exceto que o texto do MEC no prompt passa a trazer os códigos entre colchetes, e o delete em `mec_observacoes` não apaga nada.

- [ ] **Step 8: Commit**

```bash
git add app/api/cron/processar-fila/route.ts .env.example
git commit -m "feat: worker grava o MEC estruturado e resume por dia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Checklist do MEC na conversa

**Files:**
- Create: `lib/mec-dados.ts`
- Create: `app/(app)/conversas/[id]/checklist-mec.tsx`
- Modify: `app/(app)/conversas/[id]/page.tsx`

**Interfaces:**
- Consumes: `etapaProvisoria`, `ItemPlaybook`, `TipoItem`, `Sinal`, `FORA_DO_CATALOGO` (`@/lib/mec`); `SELO` (`@/components/ui`).
- Produces:
  - `carregarPlaybook(supabase, id: string | null): Promise<DadosPlaybook | null>`, com `type DadosPlaybook = { id: string; itens: ItemPlaybook[]; rotulos: Map<string, string>; provisorias: Set<string> }`
  - `ChecklistMec({ etapa, obs, rotulos, provisoria })` e `type ObsTela`

- [ ] **Step 1: `lib/mec-dados.ts`**

```ts
import 'server-only';
import type { contextoApp } from '@/lib/contexto-app';
import { etapaProvisoria, type ItemPlaybook, type TipoItem } from '@/lib/mec';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];

export type DadosPlaybook = { id: string; itens: ItemPlaybook[]; rotulos: Map<string, string>; provisorias: Set<string> };

/** Playbook por id, ou o vigente quando `id` é null. `null` quando não existe. */
export async function carregarPlaybook(supabase: Supabase, id: string | null): Promise<DadosPlaybook | null> {
    let consulta = supabase.from('playbooks').select('id');
    consulta = id ? consulta.eq('id', id) : consulta.is('vigente_ate', null);
    const { data: pb } = await consulta.maybeSingle<{ id: string }>();
    if (!pb) return null;
    const { data: etapas } = await supabase.from('playbook_etapas').select('id,chave,descricao').eq('playbook_id', pb.id)
        .returns<{ id: string; chave: string; descricao: string | null }[]>();
    const ids = (etapas ?? []).map((e) => e.id);
    const { data: itens } = ids.length
        ? await supabase.from('playbook_itens').select('etapa_id,chave,tipo,rotulo').in('etapa_id', ids).order('ordem')
            .returns<{ etapa_id: string; chave: string; tipo: TipoItem; rotulo: string }[]>()
        : { data: [] as { etapa_id: string; chave: string; tipo: TipoItem; rotulo: string }[] };
    const chaveDaEtapa = new Map((etapas ?? []).map((e) => [e.id, e.chave]));
    const lista: ItemPlaybook[] = (itens ?? []).map((i) => ({ chave: i.chave, tipo: i.tipo, rotulo: i.rotulo, etapa: chaveDaEtapa.get(i.etapa_id) ?? '' }));
    return {
        id: pb.id,
        itens: lista,
        rotulos: new Map(lista.map((i) => [i.chave, i.rotulo])),
        provisorias: new Set((etapas ?? []).filter((e) => etapaProvisoria(e.descricao)).map((e) => e.chave)),
    };
}
```

- [ ] **Step 2: `app/(app)/conversas/[id]/checklist-mec.tsx`**

```tsx
import type { ReactNode } from 'react';
import { SELO } from '@/components/ui';
import { FORA_DO_CATALOGO, type Sinal } from '@/lib/mec';

export type ObsTela = {
    etapa: string; sinal: Sinal; item_chave: string | null; valor: boolean | null;
    detalhe: Record<string, unknown>; trecho: string | null;
};

function Marca({ ok }: { ok: boolean | null }) {
    if (ok === null) return <span aria-hidden="true" className="w-3 shrink-0 text-tinta-3">—</span>;
    return ok
        ? <span aria-hidden="true" className="w-3 shrink-0 font-bold text-bom-texto">✓</span>
        : <span aria-hidden="true" className="w-3 shrink-0 font-bold text-risco-texto">✕</span>;
}

function Linha({ ok, trecho, children }: { ok: boolean | null; trecho?: string | null; children: ReactNode }) {
    return (
        <li className="flex flex-col gap-0.5">
            <span className="flex items-start gap-2 text-[12.5px] leading-snug">
                <Marca ok={ok} />
                <span>{children}{ok !== null && <span className="sr-only">{ok ? ' — sim' : ' — não'}</span>}</span>
            </span>
            {trecho && <span className="pl-5 text-[11.5px] italic text-tinta-3">&ldquo;{trecho}&rdquo;</span>}
        </li>
    );
}

function Passo({ nome, ok }: { nome: string; ok: boolean }) {
    return <span className={`inline-flex items-center gap-1 text-[11.5px] ${ok ? 'font-semibold text-bom-texto' : 'text-tinta-3'}`}><span aria-hidden="true">{ok ? '●' : '○'}</span>{nome}{!ok && <span className="sr-only"> (faltou)</span>}</span>;
}

/** O que a IA observou em cada etapa, item a item (spec §6). Sem observação, não renderiza. */
export function ChecklistMec({ etapa, obs, rotulos, provisoria }: {
    etapa: string; obs: ObsTela[]; rotulos: ReadonlyMap<string, string>; provisoria: boolean;
}) {
    if (!obs.length) return null;
    const rotulo = (chave: string | null) => (chave ? rotulos.get(chave) ?? chave : '');
    const um = (s: Sinal) => obs.find((o) => o.sinal === s);
    const varios = (s: Sinal) => obs.filter((o) => o.sinal === s);

    let conteudo: ReactNode = null;
    if (etapa === 'sondagem') {
        const itens = varios('sondagem_item');
        const abertas = Number(um('pergunta_aberta')?.detalhe.contagem ?? 0);
        const fechadas = Number(um('pergunta_fechada')?.detalhe.contagem ?? 0);
        conteudo = (
            <>
                <p className="text-[12px] text-tinta-2">
                    {itens.filter((i) => i.valor).length} de {itens.length} informações · {abertas} pergunta{abertas === 1 ? '' : 's'} aberta{abertas === 1 ? '' : 's'}, {fechadas} fechada{fechadas === 1 ? '' : 's'}
                </p>
                <ul className="flex flex-col gap-1">
                    {itens.map((i) => <Linha key={i.item_chave} ok={i.valor} trecho={i.valor ? i.trecho : null}>{rotulo(i.item_chave)}</Linha>)}
                </ul>
            </>
        );
    } else if (etapa === 'solucao_completa') {
        const complementares = varios('complementar').map((c) => String(c.detalhe.produto ?? '')).filter(Boolean);
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={complementares.length > 0}>{complementares.length ? `Ofereceu: ${complementares.join(', ')}` : 'Nenhum complementar oferecido'}</Linha>
                <Linha ok={um('prazo')?.valor ?? null}>Informou prazo de entrega ou retirada</Linha>
                <Linha ok={um('condicao')?.valor ?? null}>Informou condição de pagamento</Linha>
                {varios('frase_proibida').map((f, k) => (
                    <Linha key={k} ok={false} trecho={f.trecho}>Disse &ldquo;{rotulo(f.item_chave)}&rdquo;, que o Book pede para evitar</Linha>
                ))}
            </ul>
        );
    } else if (etapa === 'contorno_objecoes') {
        conteudo = (
            <ul className="flex flex-col gap-2">
                {varios('objecao').map((o, k) => {
                    const d = o.detalhe;
                    return (
                        <li key={k} className="flex flex-col gap-1 rounded-md bg-fundo px-2.5 py-2">
                            <span className="text-[12.5px] font-semibold">{o.item_chave === FORA_DO_CATALOGO ? `Fora do catálogo: ${String(d.descricao ?? '')}` : rotulo(o.item_chave)}</span>
                            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                                <Passo nome="Cachorro" ok={d.cachorro === true} />
                                <Passo nome="Papagaio" ok={d.papagaio === true} />
                                <Passo nome="Minhoca" ok={d.minhoca === true} />
                                {d.ordem_correta === false && <span className="text-[11.5px] font-semibold text-atencao-texto">fora de ordem</span>}
                            </span>
                            {d.concordou_ou_criticou === true && <span className="text-[11.5px] font-semibold text-risco-texto">Concordou com a objeção ou a criticou</span>}
                            {o.trecho && <span className="text-[11.5px] italic text-tinta-3">&ldquo;{o.trecho}&rdquo;</span>}
                        </li>
                    );
                })}
            </ul>
        );
    } else if (etapa === 'estrategia_preco') {
        const desconto = um('desconto');
        const orcamento = um('orcamento_concorrente');
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={null} trecho={desconto?.valor ? desconto.trecho : null}>{desconto?.valor ? 'Mencionou desconto' : 'Não mencionou desconto'}</Linha>
                <Linha ok={um('gerencia')?.valor ?? null}>Envolveu a gerência</Linha>
                {orcamento?.valor && <Linha ok={(orcamento.detalhe.conferiu as boolean | null | undefined) ?? null}>Conferiu itens, prazo e frete do orçamento concorrente</Linha>}
            </ul>
        );
    } else if (etapa === 'fechamento') {
        const f = um('fechamento');
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={f?.valor ?? null} trecho={f?.trecho}>
                    {f?.valor ? `Tentou fechar: ${!f.item_chave || f.item_chave === 'outra' ? 'outra técnica' : rotulo(f.item_chave)}` : 'Não fez pergunta de fechamento'}
                </Linha>
                <Linha ok={um('final_positivo')?.valor ?? null}>Mensagem final positiva</Linha>
            </ul>
        );
    }
    if (!conteudo) return null;
    return (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-linha-2 p-2.5">
            {provisoria && <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.atencao}`}>Seção do Book em revisão</span>}
            {conteudo}
        </div>
    );
}
```

- [ ] **Step 3: Ligar na página da conversa**

Em `app/(app)/conversas/[id]/page.tsx`:
1. Imports: `import { carregarPlaybook } from '@/lib/mec-dados';` e `import { ChecklistMec, type ObsTela } from './checklist-mec';`
2. No tipo `Marcacao`, acrescente `playbook_id: string;`, e no `select` de `aderencia_conversa` acrescente `playbook_id` (fica `'id,etapa,aplicavel,aplicado,justificativa,itens,playbook_id'`).
3. Depois da consulta de `contestacoes`, acrescente:
```ts
    // Detalhe estruturado do MEC (spec 2026-09-24): só existe para análises feitas com ele.
    const [{ data: observacoes }, pb] = analise && aderencia?.length
        ? await Promise.all([
            supabase.from('mec_observacoes').select('etapa,sinal,item_chave,valor,detalhe,trecho')
                .eq('conversa_id', id).eq('data_ref', analise.data_ref).returns<ObsTela[]>(),
            carregarPlaybook(supabase, aderencia[0].playbook_id),
        ])
        : [{ data: [] as ObsTela[] }, null];
```
4. No bloco de cada etapa do MEC, a lista de chips `listaDeTextos(a.itens)` só aparece quando **não** houver observação da etapa. Logo depois dela, entra o checklist. Troque o trecho `{listaDeTextos(a.itens).length > 0 && ( … )}` por:
```tsx
                                                            {!(observacoes ?? []).some((o) => o.etapa === a.etapa) && listaDeTextos(a.itens).length > 0 && (
                                                                <ul aria-label="Itens observados nesta etapa" className="mt-1 flex flex-wrap gap-1">
                                                                    {listaDeTextos(a.itens).map((item) => <li key={item} className="rounded-md bg-superficie-2 px-2 py-0.5 text-[11.5px] text-tinta-2">{item}</li>)}
                                                                </ul>
                                                            )}
                                                            <ChecklistMec etapa={a.etapa} obs={(observacoes ?? []).filter((o) => o.etapa === a.etapa)}
                                                                          rotulos={pb?.rotulos ?? new Map()} provisoria={pb?.provisorias.has(a.etapa) ?? false} />
```

- [ ] **Step 4: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verde. Uma conversa sem observações renderiza como antes.

- [ ] **Step 5: Commit**

```bash
git add lib/mec-dados.ts "app/(app)/conversas/[id]/checklist-mec.tsx" "app/(app)/conversas/[id]/page.tsx"
git commit -m "feat: checklist do MEC item a item na conversa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Meu MEC reescrito

**Files:**
- Modify: `app/(app)/meu-mec/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `resumirObservacoes`, `LinhaObservacao` (`@/lib/mec`); `carregarPlaybook` (`@/lib/mec-dados`); `paginar`; `diaMenos`, `ETAPAS`, `NOMES_ETAPA`; `tomFaixa`; componentes `Barra, CabecalhoPagina, Cartao, EstadoVazio, Kpi, Numero, Pagina, RotuloSecao, SELO, Shell`.

- [ ] **Step 1: Reescrever `app/(app)/meu-mec/page.tsx`**

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { Barra, CabecalhoPagina, Cartao, EstadoVazio, Kpi, Numero, Pagina, RotuloSecao, SELO, Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos, ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { tomFaixa } from '@/lib/visual';
import { resumirObservacoes, type LinhaObservacao } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

export const dynamic = 'force-dynamic';

const JANELA = 14;
type Dia = { data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };

export default async function MeuMecPage() {
    const { supabase, perfil } = await contextoApp();
    const desde = diaMenos(dataHoje(), JANELA);
    const [{ data: dias }, observacoes, { data: sondagens }, pb] = await Promise.all([
        supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa').eq('user_id', perfil.id)
            .order('data_ref', { ascending: false }).limit(1).returns<Dia[]>(),
        paginar<LinhaObservacao>((de, ate) => supabase.from('mec_observacoes')
            .select('conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .eq('user_id', perfil.id).gte('data_ref', desde).order('id').range(de, ate)),
        supabase.from('aderencia_conversa').select('conversa_id').eq('user_id', perfil.id)
            .eq('etapa', 'sondagem').eq('aplicavel', true).gte('data_ref', desde).returns<{ conversa_id: string }[]>(),
        carregarPlaybook(supabase, null),
    ]);
    const dia = dias?.[0];
    const { data: marcacoes } = dia
        ? await supabase.from('aderencia_conversa').select('conversa_id,etapa,aplicavel,aplicado,justificativa,conversas!inner(cliente_nome,bloqueada)')
            .eq('user_id', perfil.id).eq('conversas.bloqueada', false).eq('data_ref', dia.data_ref).order('created_at', { ascending: false })
        : { data: [] };
    const exemplo = new Map<string, Record<string, unknown>>();
    for (const m of marcacoes ?? []) if (m.aplicavel && !exemplo.has(m.etapa as string)) exemplo.set(m.etapa as string, m as Record<string, unknown>);

    const resumo = observacoes.length ? resumirObservacoes(observacoes, new Set((sondagens ?? []).map((s) => s.conversa_id))) : null;
    const rotulo = (chave: string) => pb?.rotulos.get(chave) ?? chave;
    const porItem = Object.entries(resumo?.detalhe.sondagem_por_item ?? {}).sort((a, b) => a[1] - b[1]);
    const frases = observacoes.filter((o) => o.sinal === 'frase_proibida');
    const fechamento = Object.entries(resumo?.detalhe.fechamento ?? {}).sort((a, b) => b[1] - a[1]);
    const totalFechamento = fechamento.reduce((s, [, n]) => s + n, 0);
    const totalObjecoes = Object.values(resumo?.detalhe.objecoes ?? {}).reduce((s, n) => s + n, 0) + (resumo?.detalhe.fora_do_catalogo ?? 0);
    const unidadePct = (v: number | null | undefined) => (v === null || v === undefined ? undefined : '%');

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/meu-mec">
            <Pagina>
                <CabecalhoPagina sobre={`Últimos ${JANELA} dias · a conta só considera o que cabia em cada negociação`} titulo="Meu MEC" />

                {!resumo ? (
                    <EstadoVazio titulo="Ainda sem o detalhe do MEC">
                        O detalhe por item (sondagem, objeções, fechamento) aparece depois das próximas negociações analisadas.
                    </EstadoVazio>
                ) : (
                    <>
                        <div className="grid gap-5 xl:grid-cols-12 xl:items-start">
                            <Cartao className="flex flex-col gap-3 xl:col-span-7">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <h2 className="display text-lg font-bold">Sondagem</h2>
                                        <p className="text-[12.5px] text-tinta-3">Das informações que o Book pede, quantas você teve em mãos por conversa</p>
                                    </div>
                                    <span className="flex items-baseline gap-1.5">
                                        <Numero valor={resumo.sondagem_itens === null ? '—' : String(resumo.sondagem_itens).replace('.', ',')} />
                                        <span className="text-sm text-tinta-3">de {porItem.length || 7}</span>
                                    </span>
                                </div>
                                {porItem.length ? (
                                    <ul className="flex flex-col gap-2.5">
                                        {porItem.map(([chave, pct], i) => (
                                            <li key={chave} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_44px] items-center gap-3 text-[13px]">
                                                <span className={i === 0 ? 'font-semibold' : ''}>
                                                    {rotulo(chave)}
                                                    {i === 0 && <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.atencao}`}>mais esquecida</span>}
                                                </span>
                                                <Barra pct={pct} tom={tomFaixa(pct, 35, 60)} rotulo={rotulo(chave)} />
                                                <span className="num text-right font-semibold">{pct}%</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Nenhuma negociação em que a sondagem cabia.</p>}
                            </Cartao>
                            <div className="grid grid-cols-2 gap-3 xl:col-span-5">
                                <Kpi rotulo="Perguntas abertas" valor={resumo.detalhe.perguntas_abertas_pct ?? '—'} unidade={unidadePct(resumo.detalhe.perguntas_abertas_pct)}
                                     legenda="das perguntas que você fez" />
                                <Kpi rotulo="“Algo mais?” e parecidas" valor={resumo.frases_proibidas}
                                     legenda={resumo.frases_proibidas ? 'o Book pede oferecer produto específico' : 'nenhuma vez no período'} />
                                <Kpi rotulo="Contorno completo" valor={resumo.detalhe.contorno_completo_pct ?? '—'} unidade={unidadePct(resumo.detalhe.contorno_completo_pct)}
                                     legenda={totalObjecoes ? `em ${totalObjecoes} objeç${totalObjecoes === 1 ? 'ão' : 'ões'}` : 'nenhuma objeção no período'} />
                                <Kpi rotulo="Final positivo" valor={resumo.detalhe.final_positivo_pct ?? '—'} unidade={unidadePct(resumo.detalhe.final_positivo_pct)}
                                     legenda={`em ${resumo.detalhe.conversas} negociaç${resumo.detalhe.conversas === 1 ? 'ão' : 'ões'}`} />
                            </div>
                        </div>
                        <div className="grid gap-5 lg:grid-cols-2">
                            <Cartao className="flex flex-col gap-3">
                                <h2 className="display text-lg font-bold">Como você fecha</h2>
                                {totalFechamento ? (
                                    <ul className="flex flex-col gap-2">
                                        {fechamento.map(([chave, n]) => (
                                            <li key={chave} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_40px] items-center gap-3 text-[13px]">
                                                <span>{chave === 'nenhum' ? 'Não tentou fechar' : chave === 'outra' ? 'Outra técnica' : rotulo(chave)}</span>
                                                <Barra pct={(n / totalFechamento) * 100} tom={chave === 'nenhum' ? 'risco' : 'azul'} rotulo={chave} />
                                                <span className="num text-right">{n}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Sem negociação no período.</p>}
                            </Cartao>
                            <Cartao className="flex flex-col gap-3">
                                <h2 className="display text-lg font-bold">Frases para evitar</h2>
                                {frases.length ? (
                                    <ul className="flex flex-col gap-1.5">
                                        {frases.slice(0, 4).map((f, k) => <li key={k} className="text-[13px] italic text-tinta-2">&ldquo;{f.trecho ?? rotulo(f.item_chave ?? '')}&rdquo;</li>)}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Nenhuma no período.</p>}
                                <p className="text-xs text-tinta-3">No lugar, ofereça um produto específico, como o Book sugere: &ldquo;Incluí o pincel tal que tu vai precisar&rdquo;.</p>
                            </Cartao>
                        </div>
                    </>
                )}

                <RotuloSecao complemento={dia ? 'último relatório' : undefined}>Por etapa</RotuloSecao>
                {dia ? (
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {ETAPAS.map((chave) => {
                            const bruto = dia.por_etapa?.[chave];
                            const pct = bruto == null ? null : Math.round(Number(bruto));
                            const m = exemplo.get(chave);
                            const conversa = m?.conversas as { cliente_nome: string | null } | null | undefined;
                            return (
                                <Cartao key={chave} className="flex flex-col gap-2.5">
                                    <div className="flex items-baseline justify-between">
                                        <h3 className="display text-base font-bold">{NOMES_ETAPA[chave]}</h3>
                                        <Numero valor={pct ?? '—'} unidade={pct === null ? undefined : '%'} tamanho="md" />
                                    </div>
                                    <Barra pct={pct} tom={pct === null ? 'neutro' : tomFaixa(pct, 35, 50)} rotulo={NOMES_ETAPA[chave]} />
                                    {m ? (
                                        <div className="flex flex-col gap-1 border-t border-linha-2 pt-2">
                                            <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-tinta-3">Exemplo recente · {String(m.aplicado).replaceAll('_', ' ')}</span>
                                            <p className="text-[12.5px] leading-relaxed text-tinta-2">{String(m.justificativa)}</p>
                                            <Link href={`/conversas/${m.conversa_id}` as Route} className="flex min-h-11 items-center text-[12.5px] font-semibold text-azul">
                                                Ver conversa{conversa?.cliente_nome ? ` com ${conversa.cliente_nome}` : ''} →
                                            </Link>
                                        </div>
                                    ) : pct === null && <p className="text-[12px] text-tinta-3">Não houve situação em que esta etapa coubesse.</p>}
                                </Cartao>
                            );
                        })}
                    </div>
                ) : (
                    <EstadoVazio titulo="Sem relatório do MEC ainda">A aderência aparece depois do primeiro relatório analisado.</EstadoVazio>
                )}
            </Pagina>
        </Shell>
    );
}
```

- [ ] **Step 2: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/meu-mec/page.tsx"
git commit -m "feat: Meu MEC com sondagem item a item, frases, contorno e fechamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Aderência da equipe e Objeções por código

**Files:**
- Modify: `app/(app)/equipe/mec/page.tsx` (arquivo inteiro)
- Modify: `app/(app)/equipe/visao-unidade.tsx` (Objeções da semana)

**Interfaces:**
- Consumes: `resumirObservacoes`, `contarObjecoesPorCodigo`, `LinhaObservacao` (`@/lib/mec`); `carregarPlaybook`; `paginar`; componentes.

- [ ] **Step 1: Reescrever `app/(app)/equipe/mec/page.tsx`**

```tsx
import { CabecalhoPagina, Cartao, Pagina, SELO, Shell, Tabela, TEXTO } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos, ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { tomFaixa, type Tom } from '@/lib/visual';
import { chavesDoTipo, resumirObservacoes, type LinhaObservacao } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

export const dynamic = 'force-dynamic';

const JANELA = 14;
type Dia = { user_id: string; data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };
const VEREDITO: Record<string, Tom> = { pendente: 'atencao', procedente: 'bom', improcedente: 'neutro' };

function Celula({ pct }: { pct: number | null | undefined }) {
    if (pct === null || pct === undefined) return <span className="text-tinta-3">—</span>;
    const tom = tomFaixa(pct, 35, 60);
    return <span className={`num font-semibold ${tom === 'azul' ? 'text-tinta' : TEXTO[tom]}`}>{pct}%</span>;
}

export default async function MecEquipe() {
    const { supabase, perfil } = await contextoApp();
    const desde = diaMenos(dataHoje(), JANELA);
    const [{ data: pessoas }, { data: dias }, { data: contestacoes }, observacoes, sondagens, pb] = await Promise.all([
        supabase.from('profiles').select('id,nome').eq('role', 'vendedor').eq('status', 'ativo').order('nome').returns<{ id: string; nome: string }[]>(),
        supabase.from('aderencia_diaria').select('user_id,data_ref,aderencia_geral,por_etapa').order('data_ref', { ascending: false }).limit(500).returns<Dia[]>(),
        supabase.from('aderencia_contestacoes').select('id,motivo,veredito,created_at,aderencia_conversa(etapa,conversa_id,conversas(cliente_nome))')
            .order('created_at', { ascending: false }).limit(30),
        paginar<LinhaObservacao & { user_id: string }>((de, ate) => supabase.from('mec_observacoes')
            .select('user_id,conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .eq('sinal', 'sondagem_item').gte('data_ref', desde).order('id').range(de, ate)),
        paginar<{ conversa_id: string }>((de, ate) => supabase.from('aderencia_conversa').select('conversa_id')
            .eq('etapa', 'sondagem').eq('aplicavel', true).gte('data_ref', desde).order('id').range(de, ate)),
        carregarPlaybook(supabase, null),
    ]);
    const ultimo = new Map<string, Dia>();
    for (const d of dias ?? []) if (!ultimo.has(d.user_id)) ultimo.set(d.user_id, d);
    const equipe = pessoas ?? [];
    const aplicavel = new Set(sondagens.map((s) => s.conversa_id));
    const informacoes = pb ? chavesDoTipo(pb.itens, 'informacao') : [];
    const porVendedor = new Map(equipe.map((p) => [p.id, resumirObservacoes(observacoes.filter((o) => o.user_id === p.id), aplicavel)]));
    const daEquipe = resumirObservacoes(observacoes, aplicavel);
    const colunaFraca = Object.entries(daEquipe.detalhe.sondagem_por_item).sort((a, b) => a[1] - b[1])[0]?.[0];
    const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/equipe/mec">
            <Pagina>
                <CabecalhoPagina titulo="Aderência ao MEC"
                                 sobre="Cada % considera só etapas aplicáveis e verificáveis; “—” é o que não se aplicou, não nota ruim" />

                <Tabela titulo="Por etapa" acao={<span className="text-[12.5px] text-tinta-3">último dia de cada vendedor</span>}
                        vazio="Nenhum vendedor com MEC ainda."
                        colunas={['Vendedor', ...ETAPAS.map((e) => NOMES_ETAPA[e]), 'Geral']}
                        grade={`minmax(0,1.6fr) repeat(${ETAPAS.length + 1},minmax(0,0.8fr))`} larguraMin={980}
                        linhas={equipe.map((p) => {
                            const d = ultimo.get(p.id);
                            return {
                                chave: p.id, href: `/equipe/${p.id}`, atenuada: !d,
                                celulas: [
                                    <span key="n" className="font-semibold">{p.nome}{d && <span className="block text-xs font-normal text-tinta-3">{diaMes(d.data_ref)}</span>}</span>,
                                    ...ETAPAS.map((e) => <Celula key={e} pct={d?.por_etapa?.[e] == null ? null : Math.round(Number(d.por_etapa[e]))} />),
                                    <Celula key="g" pct={d?.aderencia_geral == null ? null : Math.round(Number(d.aderencia_geral))} />,
                                ],
                            };
                        })} />

                <Tabela titulo="Sondagem por informação"
                        acao={<span className="text-[12.5px] text-tinta-3">últimos {JANELA} dias · coluna fraca = treino coletivo; linha fraca = conversa individual</span>}
                        vazio="Ainda sem o detalhe da sondagem nas negociações."
                        colunas={['Vendedor', ...informacoes.map((c) => pb?.rotulos.get(c) ?? c), 'Média']}
                        grade={`minmax(0,1.6fr) repeat(${informacoes.length + 1},minmax(0,0.9fr))`} larguraMin={1060}
                        linhas={daEquipe.detalhe.conversas_com_sondagem === 0 ? [] : equipe.map((p) => {
                            const r = porVendedor.get(p.id)!;
                            return {
                                chave: p.id, atenuada: r.detalhe.conversas_com_sondagem === 0,
                                celulas: [
                                    <span key="n" className="font-semibold">{p.nome}<span className="block text-xs font-normal text-tinta-3">{r.detalhe.conversas_com_sondagem} conversas</span></span>,
                                    ...informacoes.map((c) => (
                                        <span key={c} className={c === colunaFraca ? `rounded px-1.5 py-0.5 ${SELO.atencao}` : ''}>
                                            <Celula pct={r.detalhe.conversas_com_sondagem ? r.detalhe.sondagem_por_item[c] ?? 0 : null} />
                                        </span>
                                    )),
                                    <span key="m" className="num font-semibold">{r.sondagem_itens === null ? '—' : `${String(r.sondagem_itens).replace('.', ',')} de ${informacoes.length}`}</span>,
                                ],
                            };
                        })} />
                {colunaFraca && (
                    <p className="-mt-2 text-[12.5px] text-tinta-2">
                        Informação menos capturada pela equipe: <strong>{pb?.rotulos.get(colunaFraca) ?? colunaFraca}</strong> ({daEquipe.detalhe.sondagem_por_item[colunaFraca]}%).
                    </p>
                )}

                <Cartao className="flex flex-col gap-2">
                    <h2 className="display text-lg font-bold">Contestações da equipe</h2>
                    <p className="text-[12.5px] text-tinta-3">Quem revisa é o supervisor. Aqui você acompanha o veredito.</p>
                    {(contestacoes ?? []).length === 0 ? <p className="py-2 text-sm text-tinta-3">Nenhuma contestação.</p> : (
                        <ul className="flex flex-col">
                            {(contestacoes ?? []).map((c) => {
                                const a = c.aderencia_conversa as unknown as { etapa: string; conversa_id: string; conversas: { cliente_nome: string | null } | null } | null;
                                const veredito = String(c.veredito);
                                return (
                                    <li key={c.id as string} className="border-t border-linha-2">
                                        <a href={a ? `/conversas/${a.conversa_id}` : '#'} className="flex min-h-11 items-start justify-between gap-3 py-2.5 text-[13px]">
                                            <span>
                                                <strong>{a ? NOMES_ETAPA[a.etapa as keyof typeof NOMES_ETAPA] ?? a.etapa : 'Etapa'}</strong>
                                                {a?.conversas?.cliente_nome ? ` · ${a.conversas.cliente_nome}` : ''}
                                                <span className="mt-0.5 block text-tinta-2">{c.motivo as string}</span>
                                            </span>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${SELO[VEREDITO[veredito] ?? 'neutro']}`}>{veredito}</span>
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Cartao>
            </Pagina>
        </Shell>
    );
}
```

- [ ] **Step 2: Objeções da semana por código em `app/(app)/equipe/visao-unidade.tsx`**

1. Imports: acrescente `import { contarObjecoesPorCodigo } from '@/lib/mec';` e `import { carregarPlaybook } from '@/lib/mec-dados';`.
2. Junto das outras consultas montadas com `let q…`, acrescente:
```ts
    let qObjecoes = supabase.from('mec_observacoes').select('item_chave').eq('sinal', 'objecao')
        .gte('data_ref', diaMenos(hoje, 7)).limit(2000);
```
e dentro de `if (unidadeIds) { … }` acrescente `qObjecoes = qObjecoes.in('unidade_id', unidadeIds);`.
3. No `Promise.all`, acrescente ao fim da lista desestruturada `{ data: objecoesCodigo }, pb` e, ao fim dos valores, `qObjecoes.returns<{ item_chave: string | null }[]>(), carregarPlaybook(supabase, null)`.
4. Troque a linha `const objecoes = contarObjecoes((analises ?? []).map((a) => a.payload));` por:
```ts
    // Pelo código do catálogo quando já há detalhe do MEC; senão, pelo texto livre de antes.
    const objecoes = objecoesCodigo?.length
        ? contarObjecoesPorCodigo(objecoesCodigo, pb?.rotulos ?? new Map())
        : contarObjecoes((analises ?? []).map((a) => a.payload));
```

- [ ] **Step 3: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/equipe/mec/page.tsx" "app/(app)/equipe/visao-unidade.tsx"
git commit -m "feat: matriz vendedor × sondagem e objeções da semana pelo catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: MEC estruturado por loja (supervisor)

**Files:**
- Modify: `app/(app)/mec/page.tsx`

**Interfaces:**
- Consumes: `resumirObservacoes`, `LinhaObservacao`; `carregarPlaybook`; `paginar`; `diaMenos`; `Tabela`, `Cartao`.

- [ ] **Step 1: Acrescentar dados e seção**

1. Imports: acrescente `import { Tabela } from '@/components/ui';`, `import { dataHoje } from '@/lib/contexto-app';` (junte ao import existente de `@/lib/contexto-app`), `import { diaMenos } from '@/lib/derivacoes';`, `import { resumirObservacoes, type LinhaObservacao } from '@/lib/mec';` e `import { carregarPlaybook } from '@/lib/mec-dados';`.
2. Antes do `Promise.all` existente, declare `const desde = diaMenos(dataHoje(), 14);`. Acrescente ao `Promise.all` (e à desestruturação) estes três itens:
```ts
        paginar<LinhaObservacao & { unidade_id: string }>((de, ate) => supabase.from('mec_observacoes')
            .select('unidade_id,conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .in('sinal', ['sondagem_item', 'objecao', 'fechamento']).gte('data_ref', desde).order('id').range(de, ate)),
        paginar<{ conversa_id: string }>((de, ate) => supabase.from('aderencia_conversa').select('conversa_id')
            .eq('etapa', 'sondagem').eq('aplicavel', true).gte('data_ref', desde).order('id').range(de, ate)),
        carregarPlaybook(supabase, null),
```
nomeados `observacoes`, `sondagens` e `pb`.
3. Depois dos cálculos existentes:
```ts
    const aplicavel = new Set(sondagens.map((s) => s.conversa_id));
    const porLoja = (unidades ?? []).map((u) => ({ u, r: resumirObservacoes(observacoes.filter((o) => o.unidade_id === u.id), aplicavel) }));
    const rotuloFech = (chave: string) => (chave === 'nenhum' ? 'não tentou' : chave === 'outra' ? 'outra' : (pb?.rotulos.get(chave) ?? chave).toLowerCase());
```
4. Logo depois da `<section>` de "Por unidade e etapa", acrescente:
```tsx
            <div className="mt-5">
                <Tabela titulo="MEC estruturado por loja" acao={<span className="text-[12.5px] text-tinta-3">últimos 14 dias</span>}
                        vazio="Ainda sem o detalhe do MEC nas negociações."
                        colunas={['Loja', 'Sondagem', 'Contorno completo', 'Fechamento']}
                        grade="minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,2fr)" larguraMin={760}
                        linhas={porLoja.every(({ r }) => r.detalhe.conversas === 0) ? [] : porLoja.map(({ u, r }) => {
                            const fech = Object.entries(r.detalhe.fechamento).sort((a, b) => b[1] - a[1]);
                            const total = fech.reduce((s, [, n]) => s + n, 0);
                            return {
                                chave: u.id as string, href: `/unidades/${u.id}`, atenuada: r.detalhe.conversas === 0,
                                celulas: [
                                    <span key="n" className="font-semibold">{u.nome as string}</span>,
                                    <span key="s" className="num">{r.sondagem_itens === null ? '—' : `${String(r.sondagem_itens).replace('.', ',')} de 7`}</span>,
                                    <span key="c" className="num">{r.detalhe.contorno_completo_pct === null ? '—' : `${r.detalhe.contorno_completo_pct}%`}</span>,
                                    <span key="f" className="text-[12.5px] text-tinta-2">{total ? fech.map(([k, n]) => `${rotuloFech(k)} ${Math.round((n / total) * 100)}%`).join(' · ') : '—'}</span>,
                                ],
                            };
                        })} />
            </div>
```
(O "de 7" fica fixo porque o Book 1 tem 7 informações. Quando o playbook mudar, troque por `chavesDoTipo(pb.itens, 'informacao').length`.)

- [ ] **Step 2: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/mec/page.tsx"
git commit -m "feat: supervisor vê sondagem, contorno e fechamento por loja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Script de calibração do piloto

**Files:**
- Create: `scripts/mec-calibracao.mjs`
- Modify: `package.json` (script `mec:calibracao`)

**Interfaces:**
- Consumes: `normalizarCelula`, `concordancia` de `../lib/mec.ts` (Node 25 importa `.ts` direto).

- [ ] **Step 1: Escrever o script**

```js
#!/usr/bin/env node
// =============================================================================
// Calibração do MEC estruturado (spec 2026-09-24 §8). Três comandos:
//
//   npm run mec:calibracao -- unidade-piloto
//       unidades por volume de negociação nos últimos 14 dias (a primeira é a piloto)
//   npm run mec:calibracao -- exportar <unidade_id> [quantas=20] > calibracao.csv
//       planilha com a marcação da IA e colunas vazias para o gestor
//   npm run mec:calibracao -- comparar calibracao.csv
//       concordância IA × gestor por coluna e geral (critério: ≥ 85%)
//
// Usa a service role: roda na máquina de quem opera, nunca numa tela.
// =============================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { concordancia } from '../lib/mec.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zona-nova.vercel.app';
if (!url || !chave) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY — rode com --env-file=.env.local');
    process.exit(1);
}
const db = createClient(url, chave, { auth: { persistSession: false } });
const [comando, ...args] = process.argv.slice(2);
const SEP = ';';
const hoje = new Date();
const diasAtras = (n) => new Date(hoje.getTime() - n * 86_400_000).toISOString().slice(0, 10);

async function unidadePiloto() {
    const { data, error } = await db.from('analises_conversa').select('unidade_id')
        .eq('tipo_conversa', 'negociacao').gte('data_ref', diasAtras(14)).limit(50_000);
    if (error) throw error;
    const contagem = new Map();
    for (const a of data) contagem.set(a.unidade_id, (contagem.get(a.unidade_id) ?? 0) + 1);
    const { data: unidades } = await db.from('unidades').select('id,nome');
    const nome = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
    for (const [id, n] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${id}\t${nome.get(id) ?? ''}`);
}

async function exportar(unidadeId, quantas = 20) {
    if (!unidadeId) throw new Error('uso: exportar <unidade_id> [quantas]');
    const { data: obs, error } = await db.from('mec_observacoes')
        .select('conversa_id,data_ref,sinal,item_chave,valor').eq('unidade_id', unidadeId)
        .in('sinal', ['sondagem_item', 'objecao', 'fechamento']).order('data_ref', { ascending: false }).limit(20_000);
    if (error) throw error;
    const porConversa = new Map();
    for (const o of obs) {
        const k = `${o.conversa_id}|${o.data_ref}`;
        if (!porConversa.has(k)) porConversa.set(k, []);
        porConversa.get(k).push(o);
    }
    const escolhidas = [...porConversa.entries()].slice(0, Number(quantas));
    const informacoes = [...new Set(obs.filter((o) => o.sinal === 'sondagem_item').map((o) => o.item_chave))].sort();
    const cab = ['conversa_id', 'data_ref', 'link', ...informacoes.flatMap((c) => [`ia_${c}`, `gestor_${c}`]), 'ia_objecoes', 'gestor_objecoes', 'ia_fechamento', 'gestor_fechamento'];
    console.log(cab.join(SEP));
    for (const [k, linhas] of escolhidas) {
        const [conversaId, dataRef] = k.split('|');
        const item = (c) => (linhas.find((l) => l.sinal === 'sondagem_item' && l.item_chave === c)?.valor ? 'sim' : 'nao');
        const objecoes = linhas.filter((l) => l.sinal === 'objecao').map((l) => l.item_chave).join('|');
        const f = linhas.find((l) => l.sinal === 'fechamento');
        const fechamento = f?.valor ? (f.item_chave ?? 'outra') : 'nenhum';
        console.log([conversaId, dataRef, `${appUrl}/conversas/${conversaId}`, ...informacoes.flatMap((c) => [item(c), '']), objecoes, '', fechamento, ''].join(SEP));
    }
    console.error(`${escolhidas.length} conversas exportadas. O gestor preenche as colunas gestor_* com sim/nao, códigos separados por | ou nenhum.`);
}

function comparar(arquivo) {
    if (!arquivo) throw new Error('uso: comparar <arquivo.csv>');
    const [cab, ...linhas] = readFileSync(arquivo, 'utf8').trim().split(/\r?\n/).map((l) => l.split(SEP));
    const pares = cab.map((c, i) => [c, i]).filter(([c]) => c.startsWith('ia_'))
        .map(([c, i]) => ({ campo: c.slice(3), ia: i, humano: cab.indexOf(`gestor_${c.slice(3)}`) }));
    const todos = [];
    for (const p of pares) {
        const valores = linhas.map((l) => ({ ia: l[p.ia] ?? '', humano: l[p.humano] ?? '' }));
        todos.push(...valores);
        const c = concordancia(valores);
        console.log(`${String(c ?? '—').padStart(4)}%  ${p.campo}`);
    }
    const geral = concordancia(todos);
    console.log(`\nGeral: ${geral ?? '—'}% — ${geral !== null && geral >= 85 ? 'PASSOU (≥ 85%)' : 'NÃO PASSOU: ajuste o prompt antes de ligar para a rede'}`);
}

try {
    if (comando === 'unidade-piloto') await unidadePiloto();
    else if (comando === 'exportar') await exportar(args[0], args[1]);
    else if (comando === 'comparar') comparar(args[0]);
    else { console.error('comandos: unidade-piloto | exportar <unidade_id> [quantas] | comparar <arquivo.csv>'); process.exit(1); }
} catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
}
```

- [ ] **Step 2: Script no `package.json`**

Em `"scripts"`, acrescente:
```json
    "mec:calibracao": "node --env-file=.env.local scripts/mec-calibracao.mjs",
```

- [ ] **Step 3: Testar o `comparar` com um arquivo local**

```bash
printf 'conversa_id;data_ref;link;ia_sondagem_a;gestor_sondagem_a;ia_objecoes;gestor_objecoes\nx;2026-09-24;l;sim;sim;preco_alto|pensar;pensar|preco_alto\ny;2026-09-24;l;nao;sim;;\n' > /tmp/calib-teste.csv
node --env-file=.env.local scripts/mec-calibracao.mjs comparar /tmp/calib-teste.csv
```
Expected: `sondagem_a` 50%, `objecoes` 100% (a linha y tem objeção vazia nos dois e não conta) e `Geral: 67% — NÃO PASSOU…`.
Não rode `unidade-piloto` nem `exportar` agora: eles leem o banco de produção. Isso fica para o piloto (Task 11).

- [ ] **Step 4: Commit**

```bash
git add scripts/mec-calibracao.mjs package.json
git commit -m "feat: script de calibração do MEC estruturado (piloto)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificação, documentação e roteiro do piloto

**Files:**
- Modify: `docs/02-modelo-de-dados.md` (§2.7-A: a tabela nova)

O `docs/07-aderencia-mec.md` tem alterações do usuário ainda não commitadas: **não edite**. O doc 02 não está entre os modificados.

- [ ] **Step 1: Suíte inteira**

Run: `npm run typecheck && npm run lint && npm run test:unidade && npm run build`
Expected: verde. Cole a saída no relatório.

- [ ] **Step 2: Documentar em `docs/02-modelo-de-dados.md`**

No fim da §2.7-A, acrescente:
```markdown
### `mec_observacoes` (0021)

Uma linha por sinal que a IA observou numa negociação: cada informação da
sondagem (`sondagem_item`), perguntas abertas/fechadas (contagem em
`detalhe`), complementar, prazo, condição, frase proibida, objeção (código do
catálogo ou `fora_do_catalogo`, com os passos do contorno em `detalhe`),
desconto, gerência, orçamento concorrente, fechamento (código da técnica ou
`outra`) e mensagem final positiva. `item_chave` é o `playbook_itens.chave`.
Mesma RLS de `aderencia_conversa`. O resumo do dia vai para
`aderencia_diaria.sondagem_itens` (média de informações por conversa em que a
sondagem cabia), `frases_proibidas` e `detalhe` (jsonb). Spec:
`docs/superpowers/specs/2026-09-24-mec-estruturado-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/02-modelo-de-dados.md
git commit -m "docs: mec_observacoes no modelo de dados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Roteiro do piloto — PARAR E PEDIR AUTORIZAÇÃO ao usuário antes de cada item**

Nada abaixo é executado por um subagente. O controlador apresenta ao usuário e só age com autorização explícita, item por item:
1. Aplicar `supabase/migrations/0021_mec_estruturado.sql` no Supabase de produção, pelo mesmo processo das migrations anteriores.
2. Descobrir a unidade piloto: `npm run mec:calibracao -- unidade-piloto` (a primeira linha é a de maior volume de negociação).
3. Na Vercel, definir `MEC_DETALHE_UNIDADES=<id da unidade piloto>` e publicar.
4. Depois de um fechamento diário (00h30), gerar a planilha: `npm run mec:calibracao -- exportar <id> 20 > calibracao.csv`, e entregar ao gestor que conhece o Book.
5. Com a planilha preenchida: `npm run mec:calibracao -- comparar calibracao.csv`. Se passar de 85%, segue; abaixo disso, ajustar `REGRAS_DETALHE_MEC` e repetir o passo 4.
6. Ligar para a rede: `MEC_DETALHE_UNIDADES=*`, e publicar.
7. Reprocessar os últimos 14 dias pelo admin (`reprocessarDia`, um dia por vez), acompanhando o custo no painel.
```
