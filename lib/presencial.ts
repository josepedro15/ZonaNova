/**
 * "Fechado presencialmente" e "Resolvido" — sem I/O.
 *
 * Nos Pisos a negociação costuma fechar na loja, depois da conversa: a análise
 * do WhatsApp vê "em andamento" e a venda nunca conta. O vendedor marca a
 * conversa, e a análise do dia marcado passa a ser uma negociação com venda
 * feita — é assim que ela entra nas conversões do relatório, some do "Retomar
 * contato" e aparece no filtro de /conversas sem regra paralela em cada tela.
 *
 * Pós-venda (entrega atrasada, troca) não é venda: a venda já contou no dia
 * em que fechou. Para ele a marca é "Resolvido", que deixa a análise do dia
 * como encerrada (Silas, 14/10/2026: vendedores marcavam "Fechado
 * presencialmente" para tirar o suporte da fila, e a venda contava duas vezes).
 *
 * O que a IA tinha dito fica guardado no payload: desfazer a marca devolve a
 * análise como era.
 */

export const MARCA_PRESENCIAL = 'fechada_presencial';
const ANTES = 'antes_presencial';
export const MARCA_RESOLVIDA = 'resolvida';
const ANTES_RESOLVIDA = 'antes_resolvida';

type Payload = Record<string, unknown>;
export type AnalisePresencial = { tipo_conversa: string | null; status: string | null; payload: Payload | null };
type Marcada = { tipo_conversa: string; status: string; payload: Payload };

/** Aplica a marca guardando o que a IA disse. Aplicar duas vezes não perde o original. */
function comMarca(a: AnalisePresencial, marca: string, chaveAntes: string, nova: { tipo_conversa: string; status: string }): Marcada {
    const payload = a.payload ?? {};
    const antes = payload[chaveAntes] ?? { tipo_conversa: a.tipo_conversa, status: a.status };
    return { ...nova, payload: { ...payload, [marca]: true, [chaveAntes]: antes } };
}

/** Tira a marca e devolve o que a IA disse. Sem a marca, devolve o que recebeu. */
function semMarca(a: AnalisePresencial, marca: string, chaveAntes: string): AnalisePresencial {
    const payload = a.payload ?? {};
    const antes = payload[chaveAntes] as { tipo_conversa?: string | null; status?: string | null } | undefined;
    if (!payload[marca] && !antes) return a;
    const resto = { ...payload };
    delete resto[marca];
    delete resto[chaveAntes];
    // Nulo guardado é nulo de verdade (análise sem tipo): não cai no `??`.
    return antes
        ? { tipo_conversa: antes.tipo_conversa ?? null, status: antes.status ?? null, payload: resto }
        : { ...a, payload: resto };
}

/** A análise com a venda presencial. */
export function comVendaPresencial(a: AnalisePresencial): Marcada {
    return comMarca(a, MARCA_PRESENCIAL, ANTES, { tipo_conversa: 'negociacao', status: 'venda_feita' });
}

/** A análise como a IA a deixou. */
export function semVendaPresencial(a: AnalisePresencial): AnalisePresencial {
    return semMarca(a, MARCA_PRESENCIAL, ANTES);
}

/**
 * A análise com o atendimento resolvido: encerrada, no tipo que a IA deu.
 * Venda que a IA viu no mesmo dia continua venda — resolver o pós-venda não
 * apaga uma compra nova.
 */
export function comResolvida(a: AnalisePresencial): Marcada {
    return comMarca(a, MARCA_RESOLVIDA, ANTES_RESOLVIDA, {
        tipo_conversa: a.tipo_conversa ?? 'suporte',
        status: a.status === 'venda_feita' ? 'venda_feita' : 'encerrada',
    });
}

export function semResolvida(a: AnalisePresencial): AnalisePresencial {
    return semMarca(a, MARCA_RESOLVIDA, ANTES_RESOLVIDA);
}

/**
 * Qual marca a conversa oferece: "Resolvido" quando a última análise é
 * suporte, "Fechado presencialmente" nos outros casos (negociação, social ou
 * conversa ainda sem análise, que pode ser compra nova).
 */
export function marcaDeDesfecho(tipoDaUltimaAnalise: string | null | undefined): 'presencial' | 'resolvida' {
    return tipoDaUltimaAnalise === 'suporte' ? 'resolvida' : 'presencial';
}

/**
 * A marca de desfecho mais recente da conversa, para a tela dizer "fechada em
 * 09/10" quando o cliente voltou a escrever depois dela.
 */
export function ultimaMarca(c: { fechada_presencial_em?: string | null; resolvida_em?: string | null }): { rotulo: string; em: string } | null {
    const marcas = [
        c.fechada_presencial_em ? { rotulo: 'Fechada presencialmente', em: c.fechada_presencial_em } : null,
        c.resolvida_em ? { rotulo: 'Resolvida', em: c.resolvida_em } : null,
    ].filter((m): m is { rotulo: string; em: string } => !!m);
    return marcas.sort((a, b) => Date.parse(b.em) - Date.parse(a.em))[0] ?? null;
}

/**
 * O dia em que a marca conta: o da última conversa no WhatsApp — a última
 * análise, ou o dia da última fala do cliente se ela ainda não foi analisada
 * (marcada pela lista "Esperando você" antes da rodada do meio-dia). Sem
 * nenhum dos dois, hoje. Datas AAAA-MM-DD.
 */
export function diaDaVendaPresencial(ultimaAnalise: string | null, ultimaFalaDoCliente: string | null, hoje: string): string {
    const dias = [ultimaAnalise, ultimaFalaDoCliente].filter((d): d is string => !!d).sort();
    return dias.at(-1) ?? hoje;
}
