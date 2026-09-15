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
