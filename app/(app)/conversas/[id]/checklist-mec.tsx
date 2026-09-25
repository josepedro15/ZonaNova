import type { ReactNode } from 'react';
import { SELO } from '@/components/ui';
import { FORA_DO_CATALOGO, type Sinal } from '@/lib/mec';

export type ObsTela = {
    etapa: string; sinal: Sinal; item_chave: string | null; valor: boolean | null;
    detalhe: Record<string, unknown>; trecho: string | null;
};

function Marca({ ok }: { ok: boolean | null }) {
    if (ok === null) return <span aria-hidden="true" className="w-3 shrink-0 text-tinta-3">—</span>;
    return ok
        ? <span aria-hidden="true" className="w-3 shrink-0 font-bold text-bom-texto">✓</span>
        : <span aria-hidden="true" className="w-3 shrink-0 font-bold text-risco-texto">✕</span>;
}

function Linha({ ok, trecho, children }: { ok: boolean | null; trecho?: string | null; children: ReactNode }) {
    return (
        <li className="flex flex-col gap-0.5">
            <span className="flex items-start gap-2 text-[12.5px] leading-snug">
                <Marca ok={ok} />
                <span>{children}{ok !== null && <span className="sr-only">{ok ? ' — sim' : ' — não'}</span>}</span>
            </span>
            {trecho && <span className="pl-5 text-[11.5px] italic text-tinta-3">&ldquo;{trecho}&rdquo;</span>}
        </li>
    );
}

function Passo({ nome, ok }: { nome: string; ok: boolean }) {
    return <span className={`inline-flex items-center gap-1 text-[11.5px] ${ok ? 'font-semibold text-bom-texto' : 'text-tinta-3'}`}><span aria-hidden="true">{ok ? '●' : '○'}</span>{nome}{!ok && <span className="sr-only"> (faltou)</span>}</span>;
}

/** O que a IA observou em cada etapa, item a item (spec §6). Sem observação, não renderiza. */
export function ChecklistMec({ etapa, obs, rotulos, provisoria }: {
    etapa: string; obs: ObsTela[]; rotulos: ReadonlyMap<string, string>; provisoria: boolean;
}) {
    if (!obs.length) return null;
    const rotulo = (chave: string | null) => (chave ? rotulos.get(chave) ?? chave : '');
    const um = (s: Sinal) => obs.find((o) => o.sinal === s);
    const varios = (s: Sinal) => obs.filter((o) => o.sinal === s);

    let conteudo: ReactNode = null;
    if (etapa === 'sondagem') {
        const itens = varios('sondagem_item');
        const abertas = Number(um('pergunta_aberta')?.detalhe.contagem ?? 0);
        const fechadas = Number(um('pergunta_fechada')?.detalhe.contagem ?? 0);
        conteudo = (
            <>
                <p className="text-[12px] text-tinta-2">
                    {itens.filter((i) => i.valor).length} de {itens.length} informações · {abertas} pergunta{abertas === 1 ? '' : 's'} aberta{abertas === 1 ? '' : 's'}, {fechadas} fechada{fechadas === 1 ? '' : 's'}
                </p>
                <ul className="flex flex-col gap-1">
                    {itens.map((i) => <Linha key={i.item_chave} ok={i.valor} trecho={i.valor ? i.trecho : null}>{rotulo(i.item_chave)}</Linha>)}
                </ul>
            </>
        );
    } else if (etapa === 'solucao_completa') {
        const complementares = varios('complementar').map((c) => String(c.detalhe.produto ?? '')).filter(Boolean);
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={complementares.length > 0}>{complementares.length ? `Ofereceu: ${complementares.join(', ')}` : 'Nenhum complementar oferecido'}</Linha>
                <Linha ok={um('prazo')?.valor ?? null}>Informou prazo de entrega ou retirada</Linha>
                <Linha ok={um('condicao')?.valor ?? null}>Informou condição de pagamento</Linha>
                {varios('frase_proibida').map((f, k) => (
                    <Linha key={k} ok={false} trecho={f.trecho}>Disse &ldquo;{rotulo(f.item_chave)}&rdquo;, que o Book pede para evitar</Linha>
                ))}
            </ul>
        );
    } else if (etapa === 'contorno_objecoes') {
        conteudo = (
            <ul className="flex flex-col gap-2">
                {varios('objecao').map((o, k) => {
                    const d = o.detalhe;
                    return (
                        <li key={k} className="flex flex-col gap-1 rounded-md bg-fundo px-2.5 py-2">
                            <span className="text-[12.5px] font-semibold">{o.item_chave === FORA_DO_CATALOGO ? `Fora do catálogo: ${String(d.descricao ?? '')}` : rotulo(o.item_chave)}</span>
                            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                                <Passo nome="Cachorro" ok={d.cachorro === true} />
                                <Passo nome="Papagaio" ok={d.papagaio === true} />
                                <Passo nome="Minhoca" ok={d.minhoca === true} />
                                {d.ordem_correta === false && <span className="text-[11.5px] font-semibold text-atencao-texto">fora de ordem</span>}
                            </span>
                            {d.concordou_ou_criticou === true && <span className="text-[11.5px] font-semibold text-risco-texto">Concordou com a objeção ou a criticou</span>}
                            {o.trecho && <span className="text-[11.5px] italic text-tinta-3">&ldquo;{o.trecho}&rdquo;</span>}
                        </li>
                    );
                })}
            </ul>
        );
    } else if (etapa === 'estrategia_preco') {
        const desconto = um('desconto');
        const orcamento = um('orcamento_concorrente');
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={null} trecho={desconto?.valor ? desconto.trecho : null}>{desconto?.valor ? 'Mencionou desconto' : 'Não mencionou desconto'}</Linha>
                <Linha ok={um('gerencia')?.valor ?? null}>Envolveu a gerência</Linha>
                {orcamento?.valor && <Linha ok={(orcamento.detalhe.conferiu as boolean | null | undefined) ?? null}>Conferiu itens, prazo e frete do orçamento concorrente</Linha>}
            </ul>
        );
    } else if (etapa === 'fechamento') {
        const f = um('fechamento');
        conteudo = (
            <ul className="flex flex-col gap-1">
                <Linha ok={f?.valor ?? null} trecho={f?.trecho}>
                    {f?.valor ? `Tentou fechar: ${!f.item_chave || f.item_chave === 'outra' ? 'outra técnica' : rotulo(f.item_chave)}` : 'Não fez pergunta de fechamento'}
                </Linha>
                <Linha ok={um('final_positivo')?.valor ?? null}>Mensagem final positiva</Linha>
            </ul>
        );
    }
    if (!conteudo) return null;
    return (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-linha-2 p-2.5">
            {provisoria && <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.atencao}`}>Seção do Book em revisão</span>}
            {conteudo}
        </div>
    );
}
