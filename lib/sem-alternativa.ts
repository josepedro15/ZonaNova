/**
 * Produtos que a rede não trabalha e para os quais não há alternativa a
 * oferecer (Silas, 27/10). A análise cobrava "não sugeriu alternativa de
 * produto" nesses casos, e a crítica ia para o treino do vendedor. Admin e
 * supervisor mantêm a lista (0035, /admin/produtos).
 *
 * Só os itens que aparecem na conversa vão para o pedido: sem nenhum, o
 * prompt é byte a byte o calibrado. E, como em `ajustarResultado`, a regra no
 * prompt não basta sozinha: o erro sobre alternativa sai também aqui.
 */

export type ProdutoSemAlternativa = { produto: string; observacao: string | null };

/** Teto da lista lida pela análise: é a rede toda, mas cada conversa só cita poucos. */
export const MAX_PRODUTOS_SEM_ALTERNATIVA = 500;

/** Minúsculas, sem acento nem pontuação, um espaço entre palavras. */
function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Os da lista que alguém citou na conversa, pelo nome inteiro e em palavras
 * inteiras: "Porcelanato 120X120" acha "porcelanato 120x120", e "tinta" não
 * acha "tintas spray" só por começar igual.
 */
export function citadosNaConversa(lista: readonly ProdutoSemAlternativa[], transcript: string): ProdutoSemAlternativa[] {
    const conversa = ` ${normalizar(transcript)} `;
    return lista.filter((p) => {
        const nome = normalizar(p.produto);
        return nome.length >= 2 && conversa.includes(` ${nome} `);
    });
}

/** A regra que vai no fim do pedido, só com os produtos citados. */
export function regraSemAlternativa(citados: readonly ProdutoSemAlternativa[]): string {
    if (!citados.length) return '';
    const lista = citados.map((p) => `"${p.produto.trim()}"${p.observacao?.trim() ? ` (${p.observacao.trim()})` : ''}`).join('; ');
    return `PRODUTOS SEM ALTERNATIVA NA REDE: a Zona Nova não trabalha estes produtos e não tem nada equivalente para oferecer: ${lista}. `
        + 'Quando o cliente pede um deles, informar que não trabalha é a resposta certa: "não ofereceu alternativa" ou "não sugeriu substituto" para esse produto não é erro, '
        + 'não entra em erros_vendedor e não baixa score_atendimento nem a solução completa do MEC.';
}

const COBRA_ALTERNATIVA = /\b(alternativ\w*|substitut\w*|similar\w*|equivalente\w*|outra (opcao|marca)|outras opcoes)\b/;
/** "…em casos de produto indisponível": a cobrança genérica, sem nome de produto. */
const PRODUTO_EM_FALTA = /\b(indisponive\w*|nao trabalh\w*|nao tem|nao tinha|em falta|sem estoque|falta do produto)\b/;

/**
 * Tira de erros_vendedor a cobrança de alternativa ligada a um produto da
 * lista: a que cita o produto, ou a genérica de "produto indisponível". A que
 * cita outro produto ("não ofereceu alternativa ao rejunte") fica.
 */
export function semCobrarAlternativa(erros: readonly string[], citados: readonly ProdutoSemAlternativa[]): string[] {
    if (!citados.length) return [...erros];
    const nomes = citados.map((p) => normalizar(p.produto));
    return erros.filter((e) => {
        const n = normalizar(e);
        if (!COBRA_ALTERNATIVA.test(n)) return true;
        return !(nomes.some((nome) => ` ${n} `.includes(` ${nome} `)) || PRODUTO_EM_FALTA.test(n));
    });
}
