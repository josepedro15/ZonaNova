/**
 * Quem está do outro lado da conversa.
 *
 * A lista de contatos internos é manual, e o que ninguém cadastrou entrava na
 * análise como atendimento: a conversa do gestor com a agência punha "custo
 * alto da campanha" nas objeções da matriz. A análise passa a dizer se o
 * contato é cliente, alguém da rede, fornecedor/parceiro ou pessoal. Ela só
 * SUGERE: quem cadastra é o gestor, no Perfil. Até lá, a conversa com
 * suspeita forte fica fora das objeções e do relatório do vendedor.
 */

export const NATUREZAS = ['cliente', 'colega_ou_loja', 'fornecedor_ou_parceiro', 'pessoal'] as const;
export type Natureza = (typeof NATUREZAS)[number];

/** Quem pede o quê no dia: decidido antes da natureza (REGRA_NATUREZA). */
export const QUEM_PEDE = ['contato_pede_a_loja', 'vendedor_pede_ao_contato', 'ninguem_pede'] as const;

/** Confiança mínima para sugerir e para tirar das contas. Calibrada em docs/11-natureza-contato-calibracao.md. */
export const LIMIAR_NATUREZA = 80;

/**
 * Abaixo disto, "cliente" quer dizer que a conversa não mostra quem é o
 * contato: não conta como negociação (lib/analise.ts, ajustarResultado). Na
 * auditoria de 07/10, todo cliente abaixo de 50 era link, robô, motorista ou
 * credencial — nenhum cliente de verdade.
 */
export const LIMIAR_CLIENTE = 50;

export const ROTULO_NATUREZA: Record<Exclude<Natureza, 'cliente'>, string> = {
    colega_ou_loja: 'Colega ou loja da rede',
    fornecedor_ou_parceiro: 'Fornecedor ou parceiro',
    pessoal: 'Pessoal',
};

export const REGRA_NATUREZA = '- quem_pede: decida ANTES de tudo quem pede o quê no dia. contato_pede_a_loja = o contato quer comprar ou trata de compra ou conta dele (preço, produto, orçamento, pedido, entrega, pagamento). '
    + 'vendedor_pede_ao_contato = é o VENDEDOR quem precisa de algo do contato para conseguir vender ou entregar a OUTRA pessoa: se pode vender, se tem estoque, se o fornecedor tem, quando chega, preço de custo, buscar ou levar material, liberar ou passar nota ("Posso vender 20?", "tô com uma venda de 20 telhas, será que teria?", "consegue me avisar quando chegar?", "o Maicon me pediu uma botina", "a cliente pediu para entregar amanhã"). '
    + 'Não contam: pergunta de sondagem ao cliente (medida, cor, endereço, foto), pedido de pagamento ou comprovante, aviso ao próprio cliente sobre a entrega DELE — aí o vendedor está atendendo. '
    + 'ninguem_pede = só saudação, aviso, link, figurinha, propaganda ou robô. '
    + '- assuntos_do_dia: logo depois, liste os assuntos do dia (regra ASSUNTOS E STATUS abaixo). Conversa em que todo assunto é interno não é de cliente. '
    + '- natureza_contato: decida logo depois quem é o contato (o C:). O prefixo C: quer dizer só "o outro lado", não prova que é cliente: pelo WhatsApp do vendedor também falam colegas, setores da loja, motoristas, fornecedores e família. Siga esta ordem e pare na primeira que servir: '
    + '1) colega_ou_loja = alguém da própria Zona Nova falando de trabalho: outro vendedor, gerente, depósito, estoque, CD, expedição, motorista ou entregador da loja, orçamentista, caixa, crediário, financeiro, compras, marketing, e-commerce, outra loja da rede. Basta UM destes sinais, mesmo que o assunto seja entrega ou nota: '
    + 'o contato fala do cliente DA LOJA ou do vendedor em terceira pessoa ("o cliente disse que está pago", "vou chamar o cliente", "tem cliente no balcão", "teu cliente", "entrega tua de Fulano", "endereço do teu cliente", "pedir pra aquele cliente", "Cliente Fulano", "nota de Fulano"); '
    + 'o vendedor fala com o contato sobre "o cliente" ou "a cliente" em terceira pessoa ("a cliente pediu para entregar amanhã"); '
    + 'o contato pede ao vendedor tirar, separar, cadastrar ou faturar pedido ("tira pra nós", "tira CD"); '
    + 'o contato fala do estoque, da nota, da carga ou da entrega como quem é da casa ("aqui na matriz", "já tá no CD", "pode vender, chegou ontem", "vou passar a nota pro retiro", "passei pro Fulano procurar", "vamos comprar", "de encomenda"). Com um sinal desses, confiança 80 ou mais. '
    + '2) fornecedor_ou_parceiro = quem vende ou presta serviço PARA a loja: fornecedor, fabricante, representante, agência de marketing e quem trabalha nela, Meta/Facebook Ads, transportadora contratada, banco, contador, sistema. Quem manda à loja lista de produtos com preço e estoque DELE ou oferece produto ("hoje tenho", "preço promocional", "tabela nova") é fornecedor, não cliente fazendo pedido. '
    + 'Com vendedor_pede_ao_contato, o contato quase sempre é 1 ou 2, com confiança 80 ou mais. '
    + '3) pessoal = família, amigo, pedido de emprego ou currículo, ou assunto particular do vendedor, sem compra. '
    + '4) cliente = só se nada acima serviu: quem compra ou pode comprar da loja para si, para a própria obra ou empresa — consumidor, pedreiro, arquiteto, empreiteiro, empresa —, inclusive falando da compra DELE em pós-venda, entrega, cobrança, reclamação ou papo social. Profissional que fala do cliente DELE ("meu cliente", "o dono da obra", "o cliente gostou do piso") continua cliente, e quem manda alguém dele buscar ("o Adair tá lá no depósito", "meu pedreiro vai pegar") também. '
    + 'Não decida pela transcrição de um nome ou cargo solto num áudio ("Olá, gestão"): a transcrição erra nomes; olhe o assunto. '
    + 'confianca_natureza (0–100) é o quanto a conversa PROVA a escolha. Conversa curta ou só mídia, sem sinal de quem é o contato, fica cliente com confiança baixa (abaixo de 50). evidencia_natureza é o trecho literal curto que mostra a natureza ("" se não houver).';

type ComNatureza = { natureza_contato?: unknown; confianca_natureza?: unknown; natureza_descartada?: unknown };

/**
 * Marca gravada no payload quando o gestor diz "É cliente" a uma sugestão.
 * A análise seguinte da mesma conversa herda a marca: a sugestão não volta.
 */
export const DESCARTADA = 'natureza_descartada';

/** A natureza que a análise deu, se for confiável e não for cliente. Payload antigo, sem o campo, é cliente. */
export function naturezaSuspeita(payload: unknown): Exclude<Natureza, 'cliente'> | null {
    if (!payload || typeof payload !== 'object') return null;
    const { natureza_contato: natureza, confianca_natureza: confianca, natureza_descartada: descartada } = payload as ComNatureza;
    if (descartada === true || descartada === 'true') return null;
    if (natureza === 'cliente' || !NATUREZAS.includes(natureza as Natureza)) return null;
    const n = Number(confianca);
    return Number.isFinite(n) && n >= LIMIAR_NATUREZA ? natureza as Exclude<Natureza, 'cliente'> : null;
}

export type LinhaSugestao = {
    unidade_id: string;
    telefone: string;
    nome: string | null;
    data_ref: string;
    payload: unknown;
};

export type SugestaoInterno = {
    unidade_id: string;
    telefone: string;
    nome: string | null;
    natureza: Exclude<Natureza, 'cliente'>;
    confianca: number;
    evidencia: string;
    ultimo_dia: string;
    dias: number;
};

/**
 * Uma sugestão por número da loja: o motivo é o do dia mais recente com
 * suspeita (é o que o gestor reconhece), e `dias` conta em quantos dias ela
 * apareceu. Mais recente primeiro.
 */
export function agruparSugestoes(linhas: readonly LinhaSugestao[]): SugestaoInterno[] {
    const porNumero = new Map<string, SugestaoInterno>();
    // Dois vendedores falando com o mesmo número no mesmo dia são um dia só.
    const diasVistos = new Map<string, Set<string>>();
    for (const l of [...linhas].sort((a, b) => b.data_ref.localeCompare(a.data_ref))) {
        const natureza = naturezaSuspeita(l.payload);
        if (!natureza) continue;
        const chave = `${l.unidade_id}|${l.telefone}`;
        const vistos = diasVistos.get(chave) ?? new Set<string>();
        vistos.add(l.data_ref);
        diasVistos.set(chave, vistos);
        const atual = porNumero.get(chave);
        if (atual) {
            atual.dias = vistos.size;
            continue;
        }
        const p = l.payload as { confianca_natureza?: unknown; evidencia_natureza?: unknown };
        porNumero.set(chave, {
            unidade_id: l.unidade_id, telefone: l.telefone, nome: l.nome?.trim() || null, natureza,
            confianca: Number(p.confianca_natureza),
            evidencia: typeof p.evidencia_natureza === 'string' ? p.evidencia_natureza.trim() : '',
            ultimo_dia: l.data_ref, dias: 1,
        });
    }
    return [...porNumero.values()];
}
