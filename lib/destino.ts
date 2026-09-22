/**
 * O destino de um redirecionamento vindo de parâmetro, reduzido a um caminho
 * da própria aplicação — ou o `padrao`, se não for.
 *
 * Checar o texto (`começa com / e não com //`) não basta: o navegador trata
 * `\` como `/`, e `/\evil.com` vira `https://evil.com/`. Resolver contra a base
 * e comparar a origem é o que decide de verdade.
 */
export function destinoSeguro(pedido: string | null, base: string, padrao: string): string {
    if (!pedido || !pedido.startsWith('/')) return padrao;
    try {
        const origem = new URL(base).origin;
        const url = new URL(pedido, origem);
        if (url.origin !== origem) return padrao;
        // `/.//evil.com` resolve na própria origem com caminho `//evil.com` —
        // que, usado de novo como destino, é outra origem.
        if (url.pathname.startsWith('//')) return padrao;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return padrao;
    }
}
