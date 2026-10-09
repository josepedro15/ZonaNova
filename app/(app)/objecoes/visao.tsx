import Link from 'next/link';
import type { Route } from 'next';
import { Barra, CabecalhoPagina, Cartao, EstadoVazio, Kpi, Pagina, Segmentado, Tabela } from '@/components/ui';
import { PERIODOS, type Levantamento, type LinhaObjecao, type Periodo } from '@/lib/objecoes';

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const campo = 'min-h-11 rounded-[10px] border border-linha-campo bg-superficie px-3 text-sm';

function ItemObjecao({ o, maior, negociacoes }: { o: LinhaObjecao; maior: number; negociacoes: number }) {
    return (
            <li className="flex flex-col gap-1.5 py-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                    <span className="leading-snug">{o.objecao}</span>
                    <span className="display num shrink-0 text-sm font-bold">{o.total}</span>
                </div>
                <Barra pct={(o.total / maior) * 100} rotulo={o.objecao} />
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-tinta-3">
                    <span>{Math.round((o.total / negociacoes) * 100)}% das negociações</span>
                    {o.exemplos.map((e) => (
                        <Link key={`${e.conversa_id}|${e.data_ref}`} href={`/conversas/${e.conversa_id}` as Route}
                              className="inline-flex min-h-8 items-center font-semibold text-azul">ver conversa de {diaMes(e.data_ref)}</Link>
                    ))}
                </div>
            </li>
        );
    }

    export type Loja = { id: string; nome: string };
    export type Pessoa = { nome: string; loja: string | null };

    /**
     * A aba Objeções sem I/O: a página (page.tsx) busca, a vitrine de
     * desenvolvimento (app/dev/objecoes) mostra com dados de exemplo.
     */
    export function VisaoObjecoes({ periodo, nomeEscopo, lojas, escolhida, deGestor, levantamento, pessoas, variasLojas, base = '/objecoes' }: {
        periodo: Periodo; nomeEscopo: string; lojas: readonly Loja[]; escolhida: Loja | null; deGestor: boolean;
        levantamento: Levantamento; pessoas: ReadonlyMap<string, Pessoa>; variasLojas: boolean; base?: string;
    }) {
        const { dias, rotulo: rotuloPeriodo } = PERIODOS[periodo];
        const { negociacoes, comObjecao, temas, objecoes, porVendedor } = levantamento;
        const repetidas = objecoes.filter((o) => o.total > 1);
        const unicas = objecoes.filter((o) => o.total === 1);
        const maior = objecoes[0]?.total ?? 1;
        const maiorTema = Math.max(1, ...temas.map((t) => t.total));
        const manter = { periodo, unidade: escolhida?.id };
    
        return (
        <Pagina>
            <CabecalhoPagina sobre={`${nomeEscopo} · ${dias === null ? 'tudo o que já foi analisado' : `últimos ${rotuloPeriodo}`}`} titulo="Objeções dos clientes"
                             acoes={<Segmentado rotulo="Período" param="periodo" base={base} atual={periodo} manter={manter}
                                                opcoes={Object.entries(PERIODOS).map(([valor, p]) => ({ valor, rotulo: p.rotulo }))} />} />

            {lojas.length > 1 && (
                <form className="flex flex-wrap items-center gap-2" aria-label="Escolher a loja">
                    <input type="hidden" name="periodo" value={periodo} />
                    <select name="unidade" aria-label="Loja" defaultValue={escolhida?.id ?? ''} className={campo}>
                        <option value="">{deGestor ? 'Todas as minhas lojas' : 'Toda a rede'}</option>
                        {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                    <button className="min-h-11 rounded-[10px] bg-azul px-5 text-sm font-semibold text-white">Ver</button>
                </form>
            )}

            {negociacoes === 0 ? (
                <EstadoVazio titulo="Nenhuma negociação analisada no período">
                    Escolha um período maior. As objeções saem das negociações que a análise do dia leu.
                </EstadoVazio>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Kpi rotulo="Negociações analisadas" valor={negociacoes} legenda="conversa com cliente, uma por dia" />
                        <Kpi rotulo="Com objeção do cliente" valor={comObjecao}
                             legenda={`${Math.round((comObjecao / negociacoes) * 100)}% das negociações`} />
                    </div>

                    <Cartao className="flex flex-col gap-3">
                        <div>
                            <h2 className="display text-lg font-bold">Por tema</h2>
                            <p className="text-[12.5px] text-tinta-3">Em quantas negociações cada tema apareceu. O tema sai das palavras da objeção: é aproximado.</p>
                        </div>
                        <ul className="flex flex-col gap-2.5">
                            {temas.map((t) => (
                                <li key={t.tema} className="flex flex-col gap-1.5 text-[13px]">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="font-semibold">{t.rotulo}</span>
                                        <span className="num shrink-0 text-tinta-2"><span className="display font-bold text-tinta">{t.total}</span> · {Math.round((t.total / negociacoes) * 100)}%</span>
                                    </div>
                                    <Barra pct={(t.total / maiorTema) * 100} rotulo={t.rotulo} tom={t.tema === 'outros' ? 'neutro' : 'azul'} />
                                </li>
                            ))}
                        </ul>
                    </Cartao>

                    <Cartao className="flex flex-col gap-1">
                        <h2 className="display text-lg font-bold">Mais citadas</h2>
                        <p className="text-[12.5px] text-tinta-3">
                            Em quantas negociações cada objeção apareceu. Só o que o cliente levantou contra comprar: preço, prazo, frete, pagamento, qualidade, concorrente.
                        </p>
                        {repetidas.length === 0 ? (
                            <p className="py-2 text-[13px] text-tinta-3">Nenhuma objeção se repetiu no período.</p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-linha-2">
                                {repetidas.map((o) => <ItemObjecao key={o.objecao} o={o} maior={maior} negociacoes={negociacoes} />)}
                            </ul>
                        )}
                        {unicas.length > 0 && (
                            <details className="mt-2 border-t border-linha-2 pt-2">
                                <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-azul">
                                    Citadas uma vez só ({unicas.length})
                                </summary>
                                <ul className="flex flex-col divide-y divide-linha-2">
                                    {unicas.map((o) => <ItemObjecao key={o.objecao} o={o} maior={maior} negociacoes={negociacoes} />)}
                                </ul>
                            </details>
                        )}
                    </Cartao>

                    <Tabela titulo="Por vendedor" acao={<span className="text-[12.5px] text-tinta-3">quem mais ouviu objeção primeiro</span>}
                            vazio="Nenhum vendedor com negociação no período."
                            colunas={['Vendedor', ...(variasLojas ? ['Loja'] : []), 'Negociações', 'Com objeção', 'Mais comum']}
                            grade={variasLojas ? 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,2fr)' : 'minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,2fr)'}
                            linhas={porVendedor.map((v) => {
                                const p = pessoas.get(v.user_id);
                                const pct = v.negociacoes ? `${Math.round((v.comObjecao / v.negociacoes) * 100)}%` : '—';
                                return {
                                    chave: v.user_id,
                                    href: `/equipe/${v.user_id}`,
                                    celulas: [
                                        <span key="n" className="font-semibold">{p?.nome ?? 'Vendedor'}</span>,
                                        ...(variasLojas ? [<span key="l" className="text-tinta-2">{p?.loja ?? '—'}</span>] : []),
                                        <span key="t" className="num">{v.negociacoes}</span>,
                                        <span key="c" className="num">{v.comObjecao} <span className="text-tinta-3">({pct})</span></span>,
                                        <span key="m" className="text-tinta-2">{v.principal ?? '—'}</span>,
                                    ],
                                    resumo: (
                                        <div className="flex flex-col gap-0.5 text-sm">
                                            <span className="font-semibold">{p?.nome ?? 'Vendedor'}{variasLojas && p?.loja ? ` · ${p.loja}` : ''}</span>
                                            <span className="text-[12.5px] text-tinta-2">{v.comObjecao} de {v.negociacoes} negociações com objeção ({pct})</span>
                                            {v.principal && <span className="text-[12.5px] text-tinta-3">Mais comum: {v.principal}</span>}
                                        </div>
                                    ),
                                };
                            })} />
                </>
            )}
        </Pagina>
    );
}
