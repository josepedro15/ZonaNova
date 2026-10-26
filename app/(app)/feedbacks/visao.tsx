import Link from 'next/link';
import type { Route } from 'next';
import { Barra, CabecalhoPagina, Cartao, EstadoVazio, Kpi, Pagina, Segmentado, Selo, Tabela } from '@/components/ui';
import { ROTULO_ASSUNTO, type ItemFeedback, type LevantamentoFeedbacks } from '@/lib/feedbacks';
import { PERIODOS, type Periodo } from '@/lib/objecoes';

const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const campo = 'min-h-11 rounded-[10px] border border-linha-campo bg-superficie px-3 text-sm';
const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : '—');
/** Quantos de cada lista aparecem abertos; o resto fica em "ver mais". */
const ABERTOS = 8;

export type Loja = { id: string; nome: string };
export type Pessoa = { nome: string; loja: string | null };

function ItemLista({ f, pessoas, comVendedor, variasLojas }: { f: ItemFeedback; pessoas: ReadonlyMap<string, Pessoa>; comVendedor: boolean; variasLojas: boolean }) {
    const p = pessoas.get(f.user_id);
    return (
        <li className="flex flex-col gap-1.5 py-2.5 text-[13px]">
            <p className="leading-snug">“{f.trecho}”</p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-tinta-3">
                <Selo>{ROTULO_ASSUNTO[f.assunto]}</Selo>
                {comVendedor && <span>{p?.nome ?? 'Vendedor'}{variasLojas && p?.loja ? ` · ${p.loja}` : ''}</span>}
                <span className="num">{diaMes(f.data_ref)}</span>
                <Link href={`/conversas/${f.conversa_id}` as Route} className="inline-flex min-h-8 items-center font-semibold text-azul">ver conversa</Link>
            </div>
        </li>
    );
}

function Lista({ titulo, sobre, itens, vazio, ...resto }: {
    titulo: string; sobre: string; itens: readonly ItemFeedback[]; vazio: string;
    pessoas: ReadonlyMap<string, Pessoa>; comVendedor: boolean; variasLojas: boolean;
}) {
    const chave = (f: ItemFeedback, i: number) => `${f.conversa_id}|${f.data_ref}|${i}`;
    return (
        <Cartao className="flex flex-col gap-1">
            <h2 className="display text-lg font-bold">{titulo} <span className="num text-tinta-3">({itens.length})</span></h2>
            <p className="text-[12.5px] text-tinta-3">{sobre}</p>
            {itens.length === 0 ? (
                <p className="py-2 text-[13px] text-tinta-3">{vazio}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-linha-2">
                    {itens.slice(0, ABERTOS).map((f, i) => <ItemLista key={chave(f, i)} f={f} {...resto} />)}
                </ul>
            )}
            {itens.length > ABERTOS && (
                <details className="mt-2 border-t border-linha-2 pt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-azul">Ver mais ({itens.length - ABERTOS})</summary>
                    <ul className="flex flex-col divide-y divide-linha-2">
                        {itens.slice(ABERTOS).map((f, i) => <ItemLista key={chave(f, i + ABERTOS)} f={f} {...resto} />)}
                    </ul>
                </details>
            )}
        </Cartao>
    );
}

/**
 * A aba Feedbacks sem I/O: a página (page.tsx) busca, a vitrine de
 * desenvolvimento (app/dev/feedbacks) mostra com dados de exemplo. O vendedor
 * vê só as próprias conversas, sem a tabela por vendedor.
 */
export function VisaoFeedbacks({ periodo, nomeEscopo, lojas, escolhida, deGestor, doVendedor, levantamento, pessoas, variasLojas, base = '/feedbacks' }: {
    periodo: Periodo; nomeEscopo: string; lojas: readonly Loja[]; escolhida: Loja | null; deGestor: boolean; doVendedor: boolean;
    levantamento: LevantamentoFeedbacks; pessoas: ReadonlyMap<string, Pessoa>; variasLojas: boolean; base?: string;
}) {
    const { dias, rotulo: rotuloPeriodo } = PERIODOS[periodo];
    const { conversas, comElogio, comReclamacao, assuntos, reclamacoes, elogios, porVendedor } = levantamento;
    const maiorAssunto = Math.max(1, ...assuntos.flatMap((a) => [a.negativos, a.positivos]));
    const manter = { periodo, unidade: escolhida?.id };
    const lista = { pessoas, comVendedor: !doVendedor, variasLojas };

    return (
        <Pagina>
            <CabecalhoPagina sobre={`${nomeEscopo} · ${dias === null ? 'tudo o que já foi analisado' : `últimos ${rotuloPeriodo}`}`} titulo="Feedbacks dos clientes"
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

            {conversas === 0 ? (
                <EstadoVazio titulo="Nenhuma conversa lida no período">
                    Escolha um período maior. Os feedbacks saem das conversas com cliente que a análise do dia leu.
                </EstadoVazio>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Kpi rotulo="Conversas analisadas" valor={conversas} legenda="conversa com cliente, uma por dia" />
                        <Kpi rotulo="Com reclamação" valor={comReclamacao} legenda={`${pct(comReclamacao, conversas)} das conversas`} />
                        <Kpi rotulo="Com elogio" valor={comElogio} legenda={`${pct(comElogio, conversas)} das conversas`} />
                    </div>

                    {assuntos.length > 0 && (
                        <Cartao className="flex flex-col gap-3">
                            <div>
                                <h2 className="display text-lg font-bold">Por assunto</h2>
                                <p className="text-[12.5px] text-tinta-3">Em quantas conversas o cliente reclamou ou elogiou cada assunto.</p>
                            </div>
                            <ul className="flex flex-col gap-3">
                                {assuntos.map((a) => (
                                    <li key={a.assunto} className="flex flex-col gap-1.5 text-[13px]">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="font-semibold">{a.rotulo}</span>
                                            <span className="num shrink-0 text-tinta-2">
                                                <span className="display font-bold text-risco-texto">{a.negativos}</span> reclamações · <span className="display font-bold text-bom-texto">{a.positivos}</span> elogios
                                            </span>
                                        </div>
                                        <Barra pct={(a.negativos / maiorAssunto) * 100} rotulo={`${a.rotulo}, reclamações`} tom="risco" />
                                        <Barra pct={(a.positivos / maiorAssunto) * 100} rotulo={`${a.rotulo}, elogios`} tom="bom" />
                                    </li>
                                ))}
                            </ul>
                        </Cartao>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                        <Lista titulo="Reclamações" sobre="O que o cliente disse de ruim: atraso, frete, demora, defeito. Mais recentes primeiro."
                               itens={reclamacoes} vazio="Nenhuma reclamação no período." {...lista} />
                        <Lista titulo="Elogios" sobre="O que o cliente disse de bom: entrega, atendimento, produto. Mais recentes primeiro."
                               itens={elogios} vazio="Nenhum elogio no período." {...lista} />
                    </div>

                    {!doVendedor && (
                        <Tabela titulo="Por vendedor" acao={<span className="text-[12.5px] text-tinta-3">quem mais recebeu reclamação primeiro</span>}
                                vazio="Nenhum vendedor com conversa no período."
                                colunas={['Vendedor', ...(variasLojas ? ['Loja'] : []), 'Conversas', 'Com reclamação', 'Com elogio', 'Mais reclamado']}
                                grade={variasLojas ? 'minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.2fr)' : 'minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1.2fr)'}
                                linhas={porVendedor.map((v) => {
                                    const p = pessoas.get(v.user_id);
                                    return {
                                        chave: v.user_id,
                                        href: `/equipe/${v.user_id}`,
                                        celulas: [
                                            <span key="n" className="font-semibold">{p?.nome ?? 'Vendedor'}</span>,
                                            ...(variasLojas ? [<span key="l" className="text-tinta-2">{p?.loja ?? '—'}</span>] : []),
                                            <span key="t" className="num">{v.conversas}</span>,
                                            <span key="r" className="num">{v.comReclamacao} <span className="text-tinta-3">({pct(v.comReclamacao, v.conversas)})</span></span>,
                                            <span key="e" className="num">{v.comElogio} <span className="text-tinta-3">({pct(v.comElogio, v.conversas)})</span></span>,
                                            <span key="m" className="text-tinta-2">{v.principal ?? '—'}</span>,
                                        ],
                                        resumo: (
                                            <div className="flex flex-col gap-0.5 text-sm">
                                                <span className="font-semibold">{p?.nome ?? 'Vendedor'}{variasLojas && p?.loja ? ` · ${p.loja}` : ''}</span>
                                                <span className="text-[12.5px] text-tinta-2">
                                                    {v.comReclamacao} com reclamação e {v.comElogio} com elogio, de {v.conversas} conversas
                                                </span>
                                                {v.principal && <span className="text-[12.5px] text-tinta-3">Mais reclamado: {v.principal}</span>}
                                            </div>
                                        ),
                                    };
                                })} />
                    )}
                </>
            )}
        </Pagina>
    );
}
