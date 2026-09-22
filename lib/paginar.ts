/**
 * Todas as linhas de uma consulta, página a página, até `max`.
 *
 * O PostgREST do Supabase devolve no máximo 1000 linhas por pedido, e o
 * `.limit(10000)` não muda isso: a tela recebia as primeiras mil e calculava
 * a média da rede sobre uma amostra sem dizer. `pagina` monta a consulta de
 * novo a cada chamada — o builder do supabase-js não é reaproveitável — e
 * precisa ter ordenação estável para as páginas não se sobreporem.
 */
export async function paginar<T>(
    pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    max = 50_000,
    tamanho = 1000,
): Promise<T[]> {
    const linhas: T[] = [];
    for (let de = 0; de < max; de += tamanho) {
        const { data, error } = await pagina(de, Math.min(de + tamanho, max) - 1);
        if (error) throw new Error(error.message);
        linhas.push(...(data ?? []));
        if ((data ?? []).length < tamanho) break;
    }
    return linhas;
}
