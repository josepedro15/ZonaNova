/**
 * As contas do painel do vendedor — sem I/O.
 *
 * Tudo aqui sai de duas colunas de `mensagens`: `direcao` e `enviada_em`, mais
 * o `automatica`. Nenhuma depende de análise, e é por isso que estas medidas
 * existem antes da Fase 5: elas respondem "o que eu faço agora", que é a
 * pergunta que a tela precisa responder mesmo sem nota nenhuma.
 *
 * A regra que atravessa as três: **mensagem automática não é resposta.** Quem
 * dispara "recebemos seu contato" não leu nada. Contá-la zeraria a espera do
 * cliente, encurtaria o tempo médio e inflaria a taxa — os três indicadores
 * mentiriam na mesma direção, a que faz o vendedor parecer melhor.
 */

export type Msg = {
    direcao: 'entrada' | 'saida';
    automatica: boolean;
    /** ISO 8601. */
    enviada_em: string;
};

const ehResposta = (m: Msg) => m.direcao === 'saida' && !m.automatica;
const ehCliente = (m: Msg) => m.direcao === 'entrada';

/** Em ordem de envio, sem confiar na ordem que veio do banco. */
function emOrdem(msgs: Msg[]): Msg[] {
    return [...msgs].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
}

/**
 * Há quantos milissegundos o cliente está sem resposta, ou null se não está.
 *
 * Conta desde a PRIMEIRA mensagem do bloco pendente, não a última: o que
 * importa é há quanto tempo ele espera, não quando parou de escrever. Três
 * mensagens às 15h00, 15h02 e 15h05 são cinco minutos de espera adicional, não
 * um recomeço do relógio.
 */
export function esperaDoCliente(msgs: Msg[], agora: Date): number | null {
    const ordenadas = emOrdem(msgs);
    const ultimaResposta = ordenadas.map(ehResposta).lastIndexOf(true);

    // O bloco pendente é tudo que o cliente disse depois da última resposta
    // humana. Sem resposta nenhuma, é tudo que ele disse.
    const pendentes = ordenadas.slice(ultimaResposta + 1).filter(ehCliente);
    if (pendentes.length === 0) return null;

    return agora.getTime() - new Date(pendentes[0].enviada_em).getTime();
}

/**
 * Um tempo de resposta (ms) por bloco do cliente que foi respondido.
 *
 * Medido da primeira mensagem do bloco até a resposta, pelo mesmo motivo
 * acima. Bloco ainda sem resposta fica de fora em vez de entrar como o tempo
 * decorrido até agora: ele ainda não terminou, e contá-lo faria a média piorar
 * sozinha com o passar do dia, sem ninguém ter feito nada.
 */
export function temposDeResposta(msgs: Msg[]): number[] {
    const tempos: number[] = [];
    let inicioDoBloco: string | null = null;

    for (const m of emOrdem(msgs)) {
        if (ehCliente(m)) {
            inicioDoBloco ??= m.enviada_em;
            continue;
        }
        // Automática não fecha o bloco: o cliente continua esperando gente.
        if (ehResposta(m) && inicioDoBloco !== null) {
            tempos.push(new Date(m.enviada_em).getTime() - new Date(inicioDoBloco).getTime());
            inicioDoBloco = null;
        }
    }

    return tempos;
}

/**
 * A conversa foi respondida? `null` quando o cliente nunca falou.
 *
 * O `null` é o ponto: um disparo em massa que ninguém respondeu não é uma
 * falha de atendimento, é uma conversa que nunca começou. Somá-lo como não
 * respondida faria a taxa do vendedor despencar por causa de uma campanha que
 * ele nem escolheu mandar.
 */
export function foiRespondido(msgs: Msg[]): boolean | null {
    const ordenadas = emOrdem(msgs);
    if (!ordenadas.some(ehCliente)) return null;

    const primeiraFala = ordenadas.findIndex(ehCliente);
    return ordenadas.slice(primeiraFala).some(ehResposta);
}

/** Média dos tempos, em minutos arredondados. `null` sem nenhum tempo medido. */
export function respostaMediaEmMinutos(tempos: number[]): number | null {
    if (tempos.length === 0) return null;
    const media = tempos.reduce((s, t) => s + t, 0) / tempos.length;
    return Math.round(media / 60000);
}

/** "4h12", "18min", "agora" — a espera como a tela a escreve. */
export function esperaEmTexto(ms: number): string {
    const minutos = Math.floor(ms / 60000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `${minutos}min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`;
}

/**
 * O telefone como gente lê. Entra em E.164 sem o `+`, como a UAZAPI entrega.
 *
 * Só formata o que é reconhecidamente brasileiro (55 + DDD + 8 ou 9 dígitos).
 * Qualquer outra coisa sai como veio: enfiar parênteses de DDD num número
 * estrangeiro não o torna mais legível, torna-o errado.
 */
export function telefoneBonito(numero: string): string {
    const d = numero.replace(/\D/g, '');
    if (!d.startsWith('55')) return numero;

    const semPais = d.slice(2);
    const ddd = semPais.slice(0, 2);
    const resto = semPais.slice(2);

    if (resto.length === 9) return `(${ddd}) ${resto[0]} ${resto.slice(1, 5)}-${resto.slice(5)}`;
    if (resto.length === 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
    return numero;
}
