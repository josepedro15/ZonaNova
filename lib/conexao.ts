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
