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
    /** Só a conta da resposta lê, para reconhecer o "obrigado" que não pede nada. */
    tipo?: string;
    conteudo?: string | null;
};

const ehResposta = (m: Msg) => m.direcao === 'saida' && !m.automatica;
// A ausência automática da empresa do cliente também não é ele falando.
const ehCliente = (m: Msg) => m.direcao === 'entrada' && !m.automatica;

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
 * Onde começa a lista "Esperando você". O piloto pediu, em 06/10/2026, para
 * ela começar limpa: a conexão importa meses de histórico, e o cliente que
 * ficou sem resposta lá atrás não é fila de hoje.
 */
export const INICIO_DA_LISTA_DE_ESPERA = new Date('2026-10-06T00:00:00-03:00');

/**
 * A espera de quem entra na lista "Esperando você", ou null se não entra.
 *
 * Entra quem está esperando e falou pela última vez a partir do `corte`. O
 * corte olha a ÚLTIMA fala do cliente, não a primeira do bloco: quem escreveu
 * ontem e voltou a cobrar hoje está na fila de hoje — e a espera continua
 * contando desde ontem, como em `esperaDoCliente`.
 */
export function esperaNaLista(msgs: Msg[], agora: Date, corte: Date = INICIO_DA_LISTA_DE_ESPERA): number | null {
    const espera = esperaDoCliente(msgs, agora);
    if (espera === null) return null;
    const ultimaDoCliente = emOrdem(msgs).filter(ehCliente).at(-1)!;
    return new Date(ultimaDoCliente.enviada_em).getTime() >= corte.getTime() ? espera : null;
}

/**
 * Alguma marca (dispensa, venda presencial; ISO 8601) é posterior à última
 * fala do cliente? Então a conversa sai da fila de espera até ele escrever de
 * novo. Sem fala do cliente, qualquer marca vale.
 */
export function marcadaDepoisDoCliente(msgs: Msg[], ...marcas: (string | null | undefined)[]): boolean {
    const ultimaDoCliente = emOrdem(msgs).filter(ehCliente).at(-1);
    // Por instante, não por texto: o banco devolve "+00:00" e milissegundos
    // que o `toISOString` do servidor escreve diferente.
    const fala = ultimaDoCliente ? Date.parse(ultimaDoCliente.enviada_em) : -Infinity;
    return marcas.some((marca) => !!marca && Date.parse(marca) >= fala);
}

/**
 * O expediente em que o relógio da resposta corre, por dia da semana (0 =
 * domingo), em horas de Brasília: seg–sex 8h–18h, sábado 8h–12h. O almoço
 * conta — não premia quem some nele. Decidido com o piloto em 08/10/2026.
 * Feriado não está aqui.
 */
export const EXPEDIENTE: readonly ([number, number] | null)[] = [null, [8, 18], [8, 18], [8, 18], [8, 18], [8, 18], [8, 12]];

/** Brasília é UTC−3 o ano todo desde 2019 (sem horário de verão). */
const FUSO_MS = -3 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Quantos ms de expediente há entre dois instantes. */
export function msDeExpediente(de: Date, ate: Date): number {
    const ini = de.getTime(), fim = ate.getTime();
    if (!(fim > ini)) return 0;
    let total = 0;
    // Meia-noite de Brasília do dia de `de`, como instante.
    for (let dia = Math.floor((ini + FUSO_MS) / DIA_MS) * DIA_MS - FUSO_MS; dia < fim; dia += DIA_MS) {
        const horario = EXPEDIENTE[new Date(dia + FUSO_MS).getUTCDay()];
        if (!horario) continue;
        const abre = Math.max(ini, dia + horario[0] * HORA_MS);
        const fecha = Math.min(fim, dia + horario[1] * HORA_MS);
        if (fecha > abre) total += fecha - abre;
    }
    return total;
}

/** Palavras de quem só confirma ou agradece. Fora daqui, a fala pede algo. */
const CONFIRMACAO = new Set(('ok okay okk blz beleza obrigado obrigada obrigadao obg brigado brigada grato grata valeu vlw ' +
    'show top perfeito combinado certo certinho otimo isso isto sim ta to bom bem joia maravilha entendi fechado ' +
    'de nada dinada muito pela atencao entao ah ahh e a').split(' '));

/**
 * A fala do cliente é só confirmação — "Obrigado", "Ok", 👍, reação,
 * figurinha — e não pede resposta? Em 07/10, dois terços dos blocos "sem
 * resposta" no fim do dia eram isso. Foto, áudio e documento sem texto podem
 * ser pedido e continuam contando; sem conteúdo lido, também (como antes).
 */
export function ehSoConfirmacao(m: Msg): boolean {
    const texto = m.conteudo?.trim();
    if (!texto) return false;
    if (/^\[(reagiu com .*|reação|figurinha)\]$/.test(texto)) return true;
    if (m.tipo && m.tipo !== 'texto') return false;
    const palavras = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    // Letra esticada ("obrigadaa", "bemm") sem estragar "isso". Só emoji ou
    // pontuação ("👍🏻", ".") também é confirmação.
    return palavras.every((p) => CONFIRMACAO.has(p) || CONFIRMACAO.has(p.replace(/([a-z])\1+/g, '$1')));
}

/**
 * Abaixo disto de expediente, um bloco sem resposta ainda não diz nada: quem
 * escreveu às 17:55 não foi ignorado, o dia acabou. Fica fora da conta.
 */
export const TOLERANCIA_BLOCO_ABERTO_MS = 15 * 60 * 1000;

/** Um bloco de falas do cliente e o que aconteceu com ele. */
type Bloco = { respondido: boolean; ms: number };

/**
 * Cada bloco do cliente, medido da PRIMEIRA mensagem do bloco (pelo mesmo
 * motivo da espera) até a resposta humana, em ms de expediente.
 *
 * O bloco que fica sem resposta até `fim` conta como não respondido, com a
 * espera até `fim`. Antes ele era descartado, e o vendedor que respondeu de
 * manhã e largou a cliente das 14h saía com 100% e um minuto (Marco, 07/10).
 * O relatório fechado passa o fim do dia; o painel, o "agora".
 */
function blocosDoCliente(msgs: Msg[], fim: Date): Bloco[] {
    const blocos: Bloco[] = [];
    let inicioDoBloco: Date | null = null;

    for (const m of emOrdem(msgs)) {
        if (ehCliente(m)) {
            // "Obrigado" não abre bloco; dentro de um pedido, também não o fecha.
            if (!ehSoConfirmacao(m)) inicioDoBloco ??= new Date(m.enviada_em);
            continue;
        }
        // Automática não fecha o bloco: o cliente continua esperando gente.
        if (ehResposta(m) && inicioDoBloco !== null) {
            blocos.push({ respondido: true, ms: msDeExpediente(inicioDoBloco, new Date(m.enviada_em)) });
            inicioDoBloco = null;
        }
    }
    if (inicioDoBloco !== null) {
        const ms = msDeExpediente(inicioDoBloco, fim);
        if (ms >= TOLERANCIA_BLOCO_ABERTO_MS) blocos.push({ respondido: false, ms });
    }
    return blocos;
}

/**
 * Os tempos de resposta (ms de expediente), um por bloco. Bloco que não somou
 * expediente nenhum (escreveu e foi respondido de madrugada) não tem tempo a
 * medir: entrar como zero puxaria a média para baixo sem ninguém ter atendido
 * mais rápido.
 */
export function temposDeResposta(msgs: Msg[], fim: Date): number[] {
    return blocosDoCliente(msgs, fim).filter((b) => b.ms > 0).map((b) => b.ms);
}

/**
 * Cada bloco do cliente foi respondido? A taxa é por bloco: a conversa em que
 * o vendedor respondeu de manhã e largou a tarde não é "respondida".
 *
 * Sem fala do cliente não há bloco: um disparo em massa que ninguém respondeu
 * não é uma falha de atendimento, é uma conversa que nunca começou.
 */
export function respostasPorBloco(msgs: Msg[], fim: Date): boolean[] {
    return blocosDoCliente(msgs, fim).map((b) => b.respondido);
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

/** Celular ou tablet pelo User-Agent. Na dúvida, computador. */
export function ehCelular(userAgent: string | null | undefined): boolean {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? '');
}

/** Cookie da escolha, no computador, entre WhatsApp Web e o app instalado. */
export const COOKIE_WHATSAPP_APP = 'zn_whatsapp_app';

/** Onde a pessoa responde: celular (wa.me), WhatsApp Web ou o app do computador. */
export type Aparelho = 'celular' | 'web' | 'app';

export function aparelhoDe(userAgent: string | null | undefined, escolha: string | undefined): Aparelho {
    if (ehCelular(userAgent)) return 'celular';
    return escolha === 'app' ? 'app' : 'web';
}

export const linkResponder = (telefone: string, aparelho: Aparelho) => linkWhatsapp(telefone, aparelho === 'celular', aparelho === 'app');

/**
 * Para onde "Responder" leva. No celular, `wa.me` abre o app na conversa; no
 * computador ele para numa página intermediária, então vai direto ao WhatsApp
 * Web — ou, para quem escolheu no Perfil, ao app instalado (`whatsapp://`):
 * o app da Microsoft Store abria pelo link do Web, mas sem ir à conversa.
 * Contato `@lid` não tem número: null, e quem chama decide o destino.
 */
export function linkWhatsapp(telefone: string, celular: boolean, appNoComputador = false): string | null {
    if (semTelefone(telefone)) return null;
    const d = telefone.replace(/\D/g, '');
    if (celular) return `https://wa.me/${d}`;
    return appNoComputador ? `whatsapp://send?phone=${d}` : `https://web.whatsapp.com/send?phone=${d}`;
}

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
 * Os números de um fechamento (unidade a partir dos vendedores, rede a partir
 * das unidades): contagens somam, médias ponderadas por leads (mínimo 1).
 * Tempo de resposta sai inteiro e nota/taxa com 2 casas, como as colunas: uma
 * média 734,5 s numa coluna integer fazia o banco recusar o relatório da loja
 * inteira, em silêncio, sempre que havia mais de um vendedor.
 */
export function numerosDoFechamento(linhas: readonly Record<string, unknown>[]) {
    const ponderada = (campo: string) => {
        const validas = linhas.filter((l) => l[campo] !== null && l[campo] !== undefined);
        const peso = (l: Record<string, unknown>) => Math.max(1, Number(l.leads_atendidos ?? 1));
        const total = validas.reduce((s, l) => s + peso(l), 0);
        return total ? validas.reduce((s, l) => s + Number(l[campo]) * peso(l), 0) / total : null;
    };
    const duasCasas = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
    const tempo = ponderada('tempo_medio_resposta_s');
    const soma = (campo: string) => linhas.reduce((s, x) => s + Number(x[campo] ?? 0), 0);
    return {
        score_geral: duasCasas(ponderada('score_geral')),
        leads_atendidos: soma('leads_atendidos'),
        conversoes_confirmadas: soma('conversoes_confirmadas'),
        oportunidades_perdidas: soma('oportunidades_perdidas'),
        tempo_medio_resposta_s: tempo === null ? null : Math.round(tempo),
        taxa_resposta: duasCasas(ponderada('taxa_resposta')),
    };
}

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
