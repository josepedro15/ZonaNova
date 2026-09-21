/**
 * Se o vendedor precisa passar pela tela de conectar — a decisão, sem I/O.
 *
 * Estava inline no proxy como `!conexao || status === 'desconectada'`, e essa
 * lista deixava passar dois dos quatro estados da coluna. `caida` era o pior:
 * é a instância que saiu do ar depois de ter estado nela, o estado que o
 * `checar-conexoes` existe para descobrir porque o vendedor não percebe
 * sozinho — e o proxy mandava justamente essa pessoa para o dashboard.
 *
 * Por isso a regra é afirmativa: só `conectada` dispensa a tela. Estado novo na
 * coluna entra reprovando, que é o lado barato de errar — mandar alguém
 * conectado para o /conectar custa um clique; deixar um número fora do ar
 * passar custa um dia inteiro de conversa que ninguém leu.
 */
export function precisaConectar(status: string | null): boolean {
    return status !== 'conectada';
}

export type ConexaoGravada = { status: string; numero: string | null };
/** O que a UAZAPI respondeu. `owner` é o número, que só ela sabe. */
export type ConexaoReal = { status: string; owner?: string | null };

/**
 * O que a checagem periódica precisa gravar — ou null, se nada mudou.
 *
 * Antes isto era um `if (destino !== c.status)` dentro da rota, e o número ia
 * de carona dentro dele. O guarda existe para o `ultimo_evento_em` continuar
 * significando "quando algo aconteceu" e não "quando o cron passou" — isso
 * está certo. O acidente era o número herdar a mesma condição: uma instância
 * que sobe `conectada` na primeira tentativa e fica assim nunca mudava de
 * status, e portanto nunca gravava o número.
 *
 * Por isso as duas mudanças são apuradas em separado. Quem aplica decide que
 * só a de status mexe no `ultimo_evento_em`.
 */
export function mudancasDaChecagem(
    gravado: ConexaoGravada,
    real: ConexaoReal,
): { status?: string; numero?: string } | null {
    const traduzido = real.status === 'connected' ? 'conectada'
        : real.status === 'connecting' ? 'aguardando_qr'
        : 'caida';

    // Cair é ter estado no ar antes. Quem nunca ligou continua `desconectada`:
    // a tela do gestor alerta número caído, e alertar quem nunca conectou é
    // ruído que ensina a ignorar o alerta.
    const destino = traduzido === 'caida' && gravado.status === 'desconectada'
        ? 'desconectada'
        : traduzido;

    const mudancas: { status?: string; numero?: string } = {};
    if (destino !== gravado.status) mudancas.status = destino;
    // `real.owner` ausente não apaga o que já se sabe — resposta incompleta da
    // UAZAPI não é notícia de que o número sumiu.
    if (real.owner && real.owner !== gravado.numero) mudancas.numero = real.owner;

    return Object.keys(mudancas).length > 0 ? mudancas : null;
}
