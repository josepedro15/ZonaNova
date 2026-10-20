import { z } from 'zod';

/**
 * Práticas aprovadas da rede: a descoberta semanal que o supervisor aprovou na
 * tela Descobertas passa a ir para a análise de cada conversa, e a IA diz se o
 * vendedor a seguiu ou deixou passar (Silas, 20/10). Não mexe na nota nem no
 * MEC: a aderência continua comparável com o histórico. Sem prática aprovada,
 * o pedido é byte a byte o de antes.
 */

export type TipoDescoberta = 'fora_do_script_deu_certo' | 'no_script_deu_errado' | 'objecao_fora_do_catalogo' | 'minhoca_inventada' | 'correlacao_etapa';

export type PraticaAprovada = { id: string; tipo: TipoDescoberta; hipotese: string; nota: string | null; desde: string };

/**
 * O que a análise grava no payload: a prática pelo id da descoberta, com o
 * texto do dia junto. Vendedor e gestor não leem `descobertas` (RLS da 0002),
 * e a conversa mostra a prática para quem a vê.
 */
export type PraticaNaConversa = { id: string; tipo: TipoDescoberta; texto: string; seguiu: boolean; trecho: string };

/** Prompt que cresce sem fim cansa o modelo: as mais antigas primeiro, até aqui. */
export const MAX_PRATICAS = 12;

export const ROTULO_PRATICA: Record<TipoDescoberta, string> = {
    fora_do_script_deu_certo: 'Funciona',
    no_script_deu_errado: 'Evite',
    objecao_fora_do_catalogo: 'Objeção a contornar',
    minhoca_inventada: 'Reversão que funcionou',
    correlacao_etapa: 'Padrão observado',
};

const codigo = (i: number) => `P${i + 1}`;

export function regraPraticas(praticas: readonly PraticaAprovada[]): string {
    if (!praticas.length) return '';
    const lista = praticas.map((p, i) => `[${codigo(i)}] ${ROTULO_PRATICA[p.tipo] ?? 'Prática'}: ${p.hipotese.trim()}${p.nota ? ` (orientação do supervisor: ${p.nota.trim()})` : ''}`);
    return 'PRÁTICAS APROVADAS PELA REDE: o supervisor aprovou as práticas abaixo, tiradas de conversas reais. Elas NÃO mudam score_atendimento, erros_vendedor nem o MEC. '
        + 'Para cada prática cuja situação APARECEU nesta conversa, registre em praticas_aprovadas: o código, seguiu (true = o vendedor agiu como a prática diz que funciona, ou evitou o que ela manda evitar; '
        + 'false = a situação apareceu e ele não agiu assim) e um trecho literal curto da conversa que mostre isso. Prática cuja situação não apareceu fica fora; sem nenhuma, [].\n'
        + lista.join('\n');
}

export function schemaJsonPraticas(praticas: readonly PraticaAprovada[]): Record<string, unknown> {
    return {
        type: 'array', maxItems: praticas.length,
        items: {
            type: 'object', additionalProperties: false, required: ['pratica', 'seguiu', 'trecho'],
            properties: { pratica: { type: 'string', enum: praticas.map((_, i) => codigo(i)) }, seguiu: { type: 'boolean' }, trecho: { type: 'string' } },
        },
    };
}

export type PraticaDoModelo = { pratica: string; seguiu: boolean; trecho: string };

/** Fora do contrato vira lista vazia: a prática nunca derruba a análise do dia. */
export function schemaPraticas(praticas: readonly PraticaAprovada[]) {
    const codigos = praticas.map((_, i) => codigo(i));
    return z.array(z.object({ pratica: z.string(), seguiu: z.boolean(), trecho: z.string() }))
        .transform((l) => l.filter((p) => codigos.includes(p.pratica)))
        .catch([]);
}

/** O modelo às vezes copia a linha do transcript: `V: "…"` vira só a fala. */
const semPrefixo = (trecho: string) => trecho.trim().replace(/^(V|C):\s*/, '').replace(/^"(.*)"$/s, '$1').trim();

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * O código vira o id da descoberta, e só fica o que a conversa prova: trecho
 * que não está no transcript é inventado. Uma linha por prática.
 */
export function lerPraticas(lista: readonly PraticaDoModelo[], praticas: readonly PraticaAprovada[], transcript: string): PraticaNaConversa[] {
    const texto = normalizar(transcript);
    const vistas = new Set<string>();
    const saida: PraticaNaConversa[] = [];
    for (const p of lista) {
        const pratica = praticas[Number(p.pratica.slice(1)) - 1];
        const limpo = semPrefixo(p.trecho);
        const trecho = normalizar(limpo);
        if (!pratica || vistas.has(pratica.id) || !trecho || !texto.includes(trecho)) continue;
        vistas.add(pratica.id);
        saida.push({ id: pratica.id, tipo: pratica.tipo, texto: pratica.hipotese.trim(), seguiu: p.seguiu, trecho: limpo });
    }
    return saida;
}

/**
 * Quantas conversas seguiram cada prática e quantas a deixaram passar, desde o
 * dia em que ela foi aprovada. A análise refeita de um dia anterior à
 * aprovação não conta.
 */
export function usoDasPraticas(
    praticas: readonly Pick<PraticaAprovada, 'id' | 'desde'>[],
    analises: readonly { data_ref: string; praticas: readonly PraticaNaConversa[] | null }[],
): Map<string, { seguiu: number; deixou: number }> {
    // O dia da aprovação em São Paulo: aprovada às 22h é o dia dela, não o seguinte.
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const desde = new Map(praticas.map((p) => [p.id, dia.format(new Date(p.desde))]));
    const uso = new Map(praticas.map((p) => [p.id, { seguiu: 0, deixou: 0 }]));
    for (const a of analises) for (const p of a.praticas ?? []) {
        const conta = uso.get(p.id);
        if (!conta || a.data_ref < (desde.get(p.id) ?? '')) continue;
        if (p.seguiu) conta.seguiu++; else conta.deixou++;
    }
    return uso;
}

/** As práticas gravadas numa análise; payload antigo ou fora do formato dá []. */
export function praticasDoPayload(valor: unknown): PraticaNaConversa[] {
    if (!Array.isArray(valor)) return [];
    return valor.filter((p): p is PraticaNaConversa => !!p && typeof p === 'object'
        && typeof (p as PraticaNaConversa).id === 'string' && typeof (p as PraticaNaConversa).texto === 'string'
        && typeof (p as PraticaNaConversa).seguiu === 'boolean' && typeof (p as PraticaNaConversa).trecho === 'string');
}
