/**
 * Regras de retry da fila (doc 3 §3.4), separadas do I/O para poderem ser
 * testadas. O worker só aplica o que se decide aqui.
 */

/** Tentativas 1, 2 e 3 repetem. Na 4ª, falha definitiva. */
export const MAX_TENTATIVAS = 3;

/**
 * Backoff exponencial a partir de 5 minutos, que é o intervalo do cron —
 * adiar menos que isso não adia nada.
 *
 * 1ª falha → 5 min, 2ª → 20 min, 3ª → 45 min. Depois, desiste.
 */
export function proximaTentativa(tentativas: number, agora = new Date()): Date {
    const minutos = 5 * tentativas * tentativas;
    return new Date(agora.getTime() + minutos * 60_000);
}

/** O que sobra depois de uma falha: tentar de novo mais tarde, ou desistir. */
export type DesfechoFalha =
    | { status: 'pendente'; proximaTentativaEm: Date; tentativas: number }
    | { status: 'falhou'; tentativas: number };

/**
 * O que fazer com um item que acabou de falhar. `tentativasAnteriores` é o que
 * está gravado ANTES desta execução.
 */
export function aposFalha(tentativasAnteriores: number, agora = new Date()): DesfechoFalha {
    const tentativas = tentativasAnteriores + 1;
    if (tentativas >= MAX_TENTATIVAS + 1) return { status: 'falhou', tentativas };
    return { status: 'pendente', proximaTentativaEm: proximaTentativa(tentativas, agora), tentativas };
}

/**
 * `aposFalha` para o worker, que sabe se a falha foi resposta incompleta da
 * OpenAI (`max_output_tokens` estourado).
 *
 * Na análise de conversa, incompleta desiste na hora: o que estoura é a
 * conversa grande demais, e repetir dá o mesmo corte e paga de novo. No
 * relatório do vendedor, não: a entrada é pequena e o estouro é o modelo
 * desandando de vez em quando (06/10: a consolidação de 03/10 bateu nos 2000
 * tokens e, repetida dez vezes, saiu normal em todas). Ali vale o backoff
 * comum.
 */
export function aposFalhaDoItem(tipo: string, incompleta: boolean, tentativasAnteriores: number, agora = new Date()): DesfechoFalha {
    if (incompleta && tipo !== 'relatorio_vendedor') return { status: 'falhou', tentativas: tentativasAnteriores + 1 };
    return aposFalha(tentativasAnteriores, agora);
}
