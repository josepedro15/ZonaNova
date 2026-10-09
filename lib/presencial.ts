/**
 * "Fechado presencialmente" — sem I/O.
 *
 * Nos Pisos a negociação costuma fechar na loja, depois da conversa: a análise
 * do WhatsApp vê "em andamento" e a venda nunca conta. O vendedor marca a
 * conversa, e a análise do dia marcado passa a ser uma negociação com venda
 * feita — é assim que ela entra nas conversões do relatório, some do "Retomar
 * contato" e aparece no filtro de /conversas sem regra paralela em cada tela.
 *
 * O que a IA tinha dito fica guardado no payload: desfazer a marca devolve a
 * análise como era.
 */

export const MARCA_PRESENCIAL = 'fechada_presencial';
const ANTES = 'antes_presencial';

type Payload = Record<string, unknown>;
export type AnalisePresencial = { tipo_conversa: string | null; status: string | null; payload: Payload | null };

/** A análise com a venda presencial. Aplicar duas vezes não perde o original. */
export function comVendaPresencial(a: AnalisePresencial): { tipo_conversa: string; status: string; payload: Payload } {
    const payload = a.payload ?? {};
    const antes = payload[ANTES] ?? { tipo_conversa: a.tipo_conversa, status: a.status };
    return { tipo_conversa: 'negociacao', status: 'venda_feita', payload: { ...payload, [MARCA_PRESENCIAL]: true, [ANTES]: antes } };
}

/** A análise como a IA a deixou. Sem a marca, devolve o que recebeu. */
export function semVendaPresencial(a: AnalisePresencial): AnalisePresencial {
    const payload = a.payload ?? {};
    const antes = payload[ANTES] as { tipo_conversa?: string | null; status?: string | null } | undefined;
    if (!payload[MARCA_PRESENCIAL] && !antes) return a;
    const resto = { ...payload };
    delete resto[MARCA_PRESENCIAL];
    delete resto[ANTES];
    // Nulo guardado é nulo de verdade (análise sem tipo): não cai no `??`.
    return antes
        ? { tipo_conversa: antes.tipo_conversa ?? null, status: antes.status ?? null, payload: resto }
        : { ...a, payload: resto };
}

/**
 * O dia em que a venda presencial conta: o da última negociação no WhatsApp —
 * a última análise, ou o dia da última fala do cliente se ela ainda não foi
 * analisada (marcada pela lista "Esperando você" antes da rodada do
 * meio-dia). Sem nenhum dos dois, hoje. Datas AAAA-MM-DD.
 */
export function diaDaVendaPresencial(ultimaAnalise: string | null, ultimaFalaDoCliente: string | null, hoje: string): string {
    const dias = [ultimaAnalise, ultimaFalaDoCliente].filter((d): d is string => !!d).sort();
    return dias.at(-1) ?? hoje;
}
