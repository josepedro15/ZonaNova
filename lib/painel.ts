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

/**
 * Só as mensagens enviadas a partir de `comeco`. As métricas "de hoje" não
 * podem herdar a madrugada nem os dias anteriores da mesma conversa: um
 * cliente que escreveu às 22h de ontem e foi respondido às 8h viraria dez
 * horas de "tempo de resposta de hoje". É o mesmo corte que o relatório
 * fechado aplica, o que deixa os dois números comparáveis.
 */
export function desde<M extends Msg>(msgs: M[], comeco: Date): M[] {
    const limite = comeco.getTime();
    return msgs.filter((m) => new Date(m.enviada_em).getTime() >= limite);
}

/** Média dos tempos, em minutos arredondados. `null` sem nenhum tempo medido. */
export function respostaMediaEmMinutos(tempos: number[]): number | null {
    if (tempos.length === 0) return null;
    const media = tempos.reduce((s, t) => s + t, 0) / tempos.length;
    return Math.round(media / 60000);
}

/**
 * "18min", "4h 12min", "1d 3h", "agora" — a espera como a tela a escreve.
 *
 * Nunca "4h12": ao lado de "14h45" na lista de conversas, isso se lê como
 * horário, e "22h37 parado" parecia a hora em que o cliente parou.
 */
export function esperaEmTexto(ms: number): string {
    const minutos = Math.floor(ms / 60000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `${minutos}min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) {
        const resto = minutos % 60;
        return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
    }
    const dias = Math.floor(horas / 24);
    const restoHoras = horas % 24;
    return restoHoras === 0 ? `${dias}d` : `${dias}d ${restoHoras}h`;
}

/** Prefixo de conversa cujo contato só chegou como `@lid`, sem telefone. */
export const PREFIXO_LID = 'lid:';

export const semTelefone = (numero: string) => numero.startsWith(PREFIXO_LID);

/**
 * O que a pessoa digitou, no formato que o webhook grava: E.164 sem o `+`.
 *
 * Número brasileiro digitado sem o país (DDD + 8 ou 9 dígitos) ganha o 55 —
 * é assim que quase todo mundo escreve, e sem ele o bloqueio nunca casava.
 */
export function telefoneE164(digitado: string): string {
    const d = digitado.replace(/\D/g, '');
    // Com país, um número brasileiro tem 12 ou 13 dígitos; 10 ou 11 é sempre
    // DDD + número — inclusive DDD 55 (Santa Maria), que parece o país.
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

/**
 * As grafias do mesmo celular brasileiro, com e sem o nono dígito.
 *
 * O WhatsApp ainda identifica muitos celulares antigos sem o 9 (JID de 12
 * dígitos), enquanto a pessoa digita com ele. Sem as duas formas, bloquear
 * "(54) 9 9812-4471" não pegava o contato que chega como 555498124471.
 */
export function variantesTelefone(e164: string): string[] {
    if (semTelefone(e164)) return [e164];
    const d = e164.replace(/\D/g, '');
    if (!d.startsWith('55')) return [d];
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    if (resto.length === 9 && resto[0] === '9') return [d, `55${ddd}${resto.slice(1)}`];
    if (resto.length === 8 && /^[6-9]/.test(resto)) return [d, `55${ddd}9${resto}`];
    return [d];
}

/**
 * O telefone como gente lê. Entra em E.164 sem o `+`, como a UAZAPI entrega.
 *
 * Só formata o que é reconhecidamente brasileiro (55 + DDD + 8 ou 9 dígitos).
 * Qualquer outra coisa sai como veio: enfiar parênteses de DDD num número
 * estrangeiro não o torna mais legível, torna-o errado.
 */
export function telefoneBonito(numero: string): string {
    if (semTelefone(numero)) return 'Contato sem número visível';
    const d = numero.replace(/\D/g, '');
    if (!d.startsWith('55')) return numero;

    const semPais = d.slice(2);
    const ddd = semPais.slice(0, 2);
    const resto = semPais.slice(2);

    if (resto.length === 9) return `(${ddd}) ${resto[0]} ${resto.slice(1, 5)}-${resto.slice(5)}`;
    if (resto.length === 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
    return numero;
}

/**
 * O primeiro nome para a saudação. Cadastro digitado todo em minúsculas ou
 * maiúsculas ("jose", "JOSÉ") vira "Jose"/"José"; o que já tem capitalização
 * própria ("McArthur") fica como está.
 */
export function primeiroNome(nome: string | null | undefined): string {
    const primeiro = (nome ?? '').trim().split(/\s+/)[0] ?? '';
    const uniforme = primeiro === primeiro.toLowerCase() || primeiro === primeiro.toUpperCase();
    if (!uniforme) return primeiro;
    return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
}

/**
 * Os `n` dias corridos terminando em `ultimo` (AAAA-MM-DD), do mais antigo ao
 * mais recente. O gráfico desenha um lugar por dia: dia sem relatório vira
 * lacuna visível em vez de sumir e encostar os vizinhos.
 */
export function diasAte(ultimo: string, n: number): string[] {
    const fim = Date.parse(`${ultimo}T12:00:00Z`);
    return Array.from({ length: n }, (_, i) =>
        new Date(fim - (n - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
}

export type LinhaDia = {
    data_ref: string;
    score_geral: number | null;
    leads_atendidos: number | null;
    conversoes_confirmadas: number | null;
    oportunidades_perdidas: number | null;
    tempo_medio_resposta_s: number | null;
    taxa_resposta: number | null;
};

/**
 * Junta num dia só as linhas de várias unidades. Contagens somam; médias são
 * ponderadas por leads atendidos (mínimo 1), a mesma regra do rollup da rede —
 * uma unidade com 2 leads não pode pesar o mesmo que outra com 200.
 */
export function juntarPorDia(linhas: LinhaDia[]): LinhaDia[] {
    const dias = new Map<string, LinhaDia[]>();
    for (const l of linhas) dias.set(l.data_ref, [...(dias.get(l.data_ref) ?? []), l]);
    const media = (xs: LinhaDia[], campo: 'score_geral' | 'tempo_medio_resposta_s' | 'taxa_resposta') => {
        const validas = xs.filter((x) => x[campo] != null);
        const peso = (x: LinhaDia) => Math.max(1, Number(x.leads_atendidos ?? 0));
        const total = validas.reduce((s, x) => s + peso(x), 0);
        return total ? validas.reduce((s, x) => s + Number(x[campo]) * peso(x), 0) / total : null;
    };
    const soma = (xs: LinhaDia[], campo: 'leads_atendidos' | 'conversoes_confirmadas' | 'oportunidades_perdidas') =>
        xs.reduce((s, x) => s + Number(x[campo] ?? 0), 0);
    return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data_ref, xs]) => ({
        data_ref,
        score_geral: media(xs, 'score_geral'),
        leads_atendidos: soma(xs, 'leads_atendidos'),
        conversoes_confirmadas: soma(xs, 'conversoes_confirmadas'),
        oportunidades_perdidas: soma(xs, 'oportunidades_perdidas'),
        tempo_medio_resposta_s: media(xs, 'tempo_medio_resposta_s'),
        taxa_resposta: media(xs, 'taxa_resposta'),
    }));
}
