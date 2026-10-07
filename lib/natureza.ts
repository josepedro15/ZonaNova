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

/** Confiança mínima para sugerir e para tirar das contas. Calibrada em docs/11-natureza-contato-calibracao.md. */
export const LIMIAR_NATUREZA = 80;

export const ROTULO_NATUREZA: Record<Exclude<Natureza, 'cliente'>, string> = {
    colega_ou_loja: 'Colega ou loja da rede',
    fornecedor_ou_parceiro: 'Fornecedor ou parceiro',
    pessoal: 'Pessoal',
};

export const REGRA_NATUREZA = '- natureza_contato: decida PRIMEIRO quem é o contato (o C:). O prefixo C: quer dizer só "o outro lado", não prova que é cliente: pelo WhatsApp do vendedor também falam colegas, setores da loja, fornecedores e família. '
    + 'cliente = quem compra ou pode comprar da loja para si, para a própria obra ou empresa: consumidor, pedreiro, arquiteto, empreiteiro, empresa — inclusive em pós-venda, entrega, cobrança, reclamação ou papo social com cliente. Profissional que fala do cliente DELE ("meu cliente", "o dono da obra", "o cliente gostou do piso") continua cliente. '
    + 'colega_ou_loja = alguém da própria Zona Nova falando de trabalho: outro vendedor, gerente, depósito, CD, expedição, caixa, crediário, financeiro, compras, e-commerce, outra loja da rede. Basta UM destes sinais: fala do cliente DA LOJA ou do vendedor em terceira pessoa ("o cliente disse que está pago", "vou chamar o cliente", "tem cliente no balcão", "teu cliente", "Cliente Fulano", "nota de Fulano"); pede ao vendedor tirar, separar, cadastrar ou faturar pedido ("tira pra nós", "tira CD"); fala do estoque, da nota ou da entrega como quem é da casa ("aqui na matriz", "já tá no CD", "passei pro Fulano procurar", "vamos comprar", "de encomenda"). Com um sinal desses, colega_ou_loja com confiança 80 ou mais. '
    + 'fornecedor_ou_parceiro = quem vende ou presta serviço PARA a loja: agência de marketing e quem trabalha nela, Meta/Facebook Ads, transportadora contratada, fabricante, representante oferecendo linha ou tabela à loja, banco, contador, sistema. '
    + 'pessoal = família, amigo ou assunto particular do vendedor, sem compra. '
    + 'confianca_natureza (0–100) é o quanto a conversa PROVA a escolha. Conversa curta ou só mídia, sem sinal de quem é o contato, fica cliente com confiança baixa. evidencia_natureza é o trecho literal curto que mostra a natureza ("" se não houver).';

type ComNatureza = { natureza_contato?: unknown; confianca_natureza?: unknown };

/** A natureza que a análise deu, se for confiável e não for cliente. Payload antigo, sem o campo, é cliente. */
export function naturezaSuspeita(payload: unknown): Exclude<Natureza, 'cliente'> | null {
    if (!payload || typeof payload !== 'object') return null;
    const { natureza_contato: natureza, confianca_natureza: confianca } = payload as ComNatureza;
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
