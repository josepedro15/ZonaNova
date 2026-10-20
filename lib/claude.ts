import type Anthropic from '@anthropic-ai/sdk';

/**
 * A análise por conversa no Claude Haiku 5.5, sem rede nem `server-only`: o
 * worker (lib/openai-analise.ts) e a calibração em scripts/ usam as mesmas
 * regras. Estudo e critério de troca em docs/13-estudo-modelo-gpt41mini-vs-haiku55.md.
 */

export const MODELO_CLAUDE = 'claude-haiku-5-5';

export type EsforcoClaude = 'low' | 'medium' | 'high';

/** `ANALISE_PROVEDOR=anthropic` liga o Claude; vazio ou outro valor = OpenAI. */
export function analiseNoClaude(provedor = process.env.ANALISE_PROVEDOR): boolean {
    return provedor?.trim().toLowerCase() === 'anthropic';
}

/**
 * `ANTHROPIC_EFFORT`. O padrão do Haiku 5.5 é `medium`; aqui é `low`, o mais
 * barato, até a calibração dizer se `medium` acerta mais.
 */
export function esforcoClaude(valor = process.env.ANTHROPIC_EFFORT): EsforcoClaude {
    const v = valor?.trim().toLowerCase();
    return v === 'medium' || v === 'high' ? v : 'low';
}

/**
 * Resposta cortada no meio (`status: incomplete` na OpenAI, `stop_reason:
 * max_tokens` no Claude). O worker trata como falha definitiva em vez de pagar
 * mais três tentativas que tendem a cortar no mesmo ponto.
 */
export class RespostaIncompleta extends Error {}

/** Restrições que a saída estruturada do Claude não garante na geração. */
const NAO_SUPORTADAS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems'];

/**
 * O schema da OpenAI sem o que o Claude recusa: limites de número, de texto e
 * de tamanho de lista (só `minItems` 0 ou 1 passa). Os limites tirados daqui
 * voltam na leitura, por `ajustarAoSchema`, e o Zod confere o resto.
 */
export function schemaParaClaude(schema: unknown): unknown {
    if (Array.isArray(schema)) return schema.map(schemaParaClaude);
    if (!schema || typeof schema !== 'object') return schema;
    const saida: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(schema)) {
        if (NAO_SUPORTADAS.includes(chave)) continue;
        if (chave === 'minItems' && typeof valor === 'number' && valor > 1) continue;
        // `enum` e `required` são listas de valores, não de schemas.
        saida[chave] = chave === 'enum' || chave === 'required' ? valor : schemaParaClaude(valor);
    }
    return saida;
}

type Schema = Record<string, unknown>;

/**
 * O MEC vai ao Claude como objeto com uma chave obrigatória por etapa, e não
 * como lista de 7: sem o `minItems: 7`, que ele não aceita, o Haiku às vezes
 * pulava etapas e a análise era recusada (prévia de 15/10, 3 de 44). Com
 * `required`, as 7 vêm sempre. `paraLista` devolve a lista que o resto do
 * sistema grava, na ordem do schema; lista que já veio como lista passa igual.
 */
export function mecPorEtapa(json: Schema): { schema: Schema; paraLista: (valor: unknown) => unknown } {
    const props = json.properties as Record<string, Schema> | undefined;
    const item = props?.mec?.items as Schema | undefined;
    const etapas = ((item?.properties as Record<string, Schema> | undefined)?.etapa?.enum ?? []) as string[];
    if (!props || !item || !etapas.length) return { schema: json, paraLista: (v) => v };
    const camposDoItem = Object.fromEntries(Object.entries(item.properties as Record<string, Schema>).filter(([k]) => k !== 'etapa'));
    const semEtapa = { ...item, required: (item.required as string[]).filter((k) => k !== 'etapa'), properties: camposDoItem };
    // A etapa é definida uma vez e referenciada: 7 cópias inteiras estouram o
    // limite de tamanho do schema compilado ("compiled grammar is too large").
    const mec = { type: 'object', additionalProperties: false, required: etapas, properties: Object.fromEntries(etapas.map((e) => [e, { $ref: '#/$defs/etapa_mec' }])) };
    return {
        schema: { ...json, $defs: { ...(json.$defs as object | undefined), etapa_mec: semEtapa }, properties: { ...props, mec } },
        paraLista: (valor) => {
            if (!valor || typeof valor !== 'object') return valor;
            const r = valor as Record<string, unknown>;
            if (!r.mec || typeof r.mec !== 'object' || Array.isArray(r.mec)) return valor;
            const porEtapa = r.mec as Record<string, unknown>;
            return { ...r, mec: etapas.filter((e) => e in porEtapa).map((e) => ({ etapa: e, ...(porEtapa[e] as object) })) };
        },
    };
}

function casaComTipo(valor: unknown, tipo: unknown): boolean {
    const tipos = Array.isArray(tipo) ? tipo : [tipo];
    if (valor === null) return tipos.includes('null');
    if (Array.isArray(valor)) return tipos.includes('array');
    if (typeof valor === 'number') return tipos.includes('number') || tipos.includes('integer');
    return tipos.includes(typeof valor);
}

/**
 * Põe a resposta do Claude dentro dos limites que `schemaParaClaude` tirou:
 * número fora da faixa vai para a borda (nota 105 → 100), inteiro é
 * arredondado e lista longa demais é cortada. O corte é a defesa contra o
 * loop de itens repetidos de 06/10, que antes era o `maxItems`. Lista curta
 * demais (o MEC sem as 7 etapas) não tem conserto: fica para o Zod recusar.
 */
export function ajustarAoSchema(valor: unknown, schema: unknown): unknown {
    if (!schema || typeof schema !== 'object') return valor;
    const s = schema as Record<string, unknown>;
    if (Array.isArray(s.anyOf)) {
        const ramo = (s.anyOf as Record<string, unknown>[]).find((r) => casaComTipo(valor, r.type));
        return ramo ? ajustarAoSchema(valor, ramo) : valor;
    }
    if (typeof valor === 'number') {
        let n = s.type === 'integer' || (Array.isArray(s.type) && s.type.includes('integer')) ? Math.round(valor) : valor;
        if (typeof s.minimum === 'number') n = Math.max(n, s.minimum);
        if (typeof s.maximum === 'number') n = Math.min(n, s.maximum);
        return n;
    }
    if (Array.isArray(valor)) {
        const lista = typeof s.maxItems === 'number' ? valor.slice(0, s.maxItems) : valor;
        return lista.map((item) => ajustarAoSchema(item, s.items));
    }
    if (valor && typeof valor === 'object' && s.properties && typeof s.properties === 'object') {
        const props = s.properties as Record<string, unknown>;
        return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, k in props ? ajustarAoSchema(v, props[k]) : v]));
    }
    return valor;
}

/**
 * O JSON da resposta. O Haiku 5.5 pensa antes de responder, então a resposta
 * pode começar com blocos `thinking`: o texto é lido pelo tipo, nunca pela
 * posição. Recusa dos filtros de segurança não tem fallback no servidor e
 * vira falha do item.
 */
export function textoDaMensagemClaude(mensagem: Pick<Anthropic.Message, 'content' | 'stop_reason' | 'stop_details'>): string {
    if (mensagem.stop_reason === 'max_tokens') throw new RespostaIncompleta('Claude devolveu resposta incompleta: max_tokens');
    if (mensagem.stop_reason === 'refusal') {
        throw new Error(`Claude recusou a análise (${mensagem.stop_details?.category ?? 'sem categoria'})`);
    }
    const texto = mensagem.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    if (!texto.trim()) throw new Error('Claude não devolveu texto estruturado');
    return texto;
}

/**
 * Tokens de entrada para o custo: a Anthropic separa a parte fresca do cache
 * lido e do escrito, e o total é a soma. O cache lido custa 0,1× e fica
 * cobrado como entrada cheia, então o custo gravado sai um pouco acima.
 */
export function entradaClaude(uso: Pick<Anthropic.Usage, 'input_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>): number {
    return uso.input_tokens + (uso.cache_read_input_tokens ?? 0) + (uso.cache_creation_input_tokens ?? 0);
}
