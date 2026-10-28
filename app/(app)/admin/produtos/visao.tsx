import { adicionarProdutoSemAlternativa, removerProdutoSemAlternativa } from '@/app/actions/produtos';

export type LinhaProduto = { id: string; produto: string; observacao: string | null; created_at: string; quem: string | null };

/** A lista de /admin/produtos; a vitrine de /dev/produtos usa a mesma. */
export function VisaoProdutos({ produtos }: { produtos: readonly LinhaProduto[] }) {
    return (
        <div className="mx-auto max-w-[900px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <h1 className="display text-[30px] font-semibold">Produtos sem alternativa</h1>
            <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-tinta-2">
                Produtos que a rede não trabalha e para os quais não há nada equivalente a oferecer. Quando um deles aparece numa conversa,
                a análise não cobra do vendedor &ldquo;não sugeriu alternativa&rdquo;. Vale para toda a rede, a partir das próximas análises.
            </p>
            <section className="mt-6 rounded-card border border-linha bg-superficie p-5">
                <form action={adicionarProdutoSemAlternativa} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                    <input name="produto" required minLength={2} maxLength={80} aria-label="Produto"
                           placeholder="Produto" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                    <input name="observacao" maxLength={200} aria-label="Observação"
                           placeholder="Por que não há alternativa (opcional)" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                    <button className="min-h-10 rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Adicionar</button>
                </form>
                <p className="mt-2 text-[12px] text-tinta-3">
                    A análise procura o nome inteiro na conversa, sem diferença de maiúsculas e acentos. Use o nome como o cliente escreve.
                </p>
                <div className="mt-4 divide-y divide-linha">
                    {produtos.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{p.produto}</p>
                                {p.observacao && <p className="mt-0.5 text-[12.5px] text-tinta-2">{p.observacao}</p>}
                                <p className="mt-0.5 text-[11px] text-tinta-3">
                                    {[p.quem, new Date(p.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            <form action={removerProdutoSemAlternativa}>
                                <input type="hidden" name="id" value={p.id} />
                                <button className="min-h-10 text-xs font-semibold text-vermelho">Remover</button>
                            </form>
                        </div>
                    ))}
                    {!produtos.length && <p className="py-4 text-sm text-tinta-3">Nenhum produto cadastrado ainda.</p>}
                </div>
            </section>
        </div>
    );
}
