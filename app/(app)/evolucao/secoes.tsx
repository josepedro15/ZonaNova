import Link from 'next/link';
import type { ReactNode } from 'react';
import { Barra, Cartao, Comparacao, Kpi, Numero, RotuloSecao, TEXTO } from '@/components/ui';
import { ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import {
    NOMES_SEMANA, NOTA_BOA, diaDaSemana, tempoCurto,
    type DiaDestaque, type Mec, type MudancaEtapa, type NotaSemana, type Resumo,
} from '@/lib/evolucao';
import { caminhoSvg, tomDelta, tomFaixa, setaDoTom, type Sentido } from '@/lib/visual';

/** "sáb, 26/09" de um AAAA-MM-DD. */
export function diaCurto(dataRef: string): string {
    return `${NOMES_SEMANA[diaDaSemana(dataRef)]}, ${dataRef.slice(8, 10)}/${dataRef.slice(5, 7)}`;
}

export const ddmm = (dataRef: string) => `${dataRef.slice(8, 10)}/${dataRef.slice(5, 7)}`;

const n = (v: number) => v.toLocaleString('pt-BR');

// --- Cartão-herói: nota do período ------------------------------------------------

export type PontoNota = { dia: string; nota: number | null; temRelatorio: boolean; referencia: number | null };

/** Tom da comparação sobre o azul: o verde e o vermelho de texto não passam contraste ali. */
const SOBRE_AZUL = { bom: 'text-bom-claro', risco: 'text-risco-sof', atencao: 'text-white/80', neutro: 'text-white/75', azul: 'text-white/75' } as const;

function ComparacaoHeroi({ delta, children }: { delta: number | null; children: ReactNode }) {
    const tom = tomDelta(delta, 'maior');
    return <span className={`text-[13px] font-semibold ${SOBRE_AZUL[tom]}`}><span aria-hidden="true">{setaDoTom(tom)} </span>{children}</span>;
}

/**
 * A nota de cada dia em linha. Dia sem relatório é buraco na linha e traço no
 * chão; dia com relatório e sem nota é quadrado tracejado — nenhum dos dois é
 * nota zero. O SVG estica na largura; pontos e rótulos são HTML para não
 * deformarem.
 */
function GraficoNota({ pontos, rotuloReferencia }: { pontos: PontoNota[]; rotuloReferencia: string | null }) {
    const notas = pontos.flatMap((p) => [p.nota, p.referencia]).filter((v): v is number => v !== null);
    const piso = Math.min(40, Math.floor(Math.min(...notas, 100) / 20) * 20);
    const marcas = [piso, piso + (100 - piso) / 3, piso + (2 * (100 - piso)) / 3, 100].map(Math.round);
    const total = pontos.length;
    const x = (i: number) => (total <= 1 ? 50 : (i / (total - 1)) * 100);
    const y = (v: number) => ((100 - v) / (100 - piso)) * 100;
    const comPonto = total <= 31;
    const ultimo = pontos.map((p) => p.nota !== null).lastIndexOf(true);
    const rotulosX = [0, Math.round((total - 1) / 3), Math.round((2 * (total - 1)) / 3), total - 1].filter((v, i, a) => a.indexOf(v) === i);

    return (
        <figure className="m-0 flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_28px] gap-2">
                <div className="relative mx-1.5 h-[180px] lg:h-[210px]" role="img"
                     aria-label={`Nota por dia${rotuloReferencia ? `, com a ${rotuloReferencia}` : ''}`}>
                    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
                        {marcas.map((m) => <line key={m} x1={0} x2={1000} y1={y(m)} y2={y(m)} className="stroke-white/15" vectorEffect="non-scaling-stroke" />)}
                        <path d={caminhoSvg(pontos.map((p, i) => (p.referencia === null ? null : [x(i) * 10, y(p.referencia)])))} fill="none"
                              className="stroke-white/45" strokeWidth={1.6} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                        <path d={caminhoSvg(pontos.map((p, i) => (p.nota === null ? null : [x(i) * 10, y(p.nota)])))} fill="none"
                              className="stroke-white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    {pontos.map((p, i) => p.nota !== null && (comPonto || i === ultimo) && (
                        <span key={p.dia} title={`${diaCurto(p.dia)}: nota ${p.nota}`}
                              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${i === ultimo ? 'size-3 bg-white' : 'size-2 border-2 border-white bg-azul'}`}
                              style={{ left: `${x(i)}%`, top: `${y(p.nota)}%` }} />
                    ))}
                </div>
                <div className="relative text-[11px] text-white/60" aria-hidden="true">
                    {marcas.map((m) => <span key={m} className="absolute -translate-y-1/2" style={{ top: `${y(m)}%` }}>{m}</span>)}
                </div>
            </div>
            {/* Um sinal por dia: com nota, sem nota, sem relatório. */}
            <div className="relative mx-1.5 mr-[42px] h-3" aria-hidden="true">
                {pontos.map((p, i) => (
                    <span key={p.dia} title={`${diaCurto(p.dia)}: ${!p.temRelatorio ? 'sem relatório' : p.nota === null ? 'sem nota' : `nota ${p.nota}`}`}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${!p.temRelatorio
                              ? 'h-0.5 w-2 rounded bg-white/30'
                              : p.nota === null ? 'size-2 rounded-sm border border-dashed border-white/70' : 'size-1 rounded-full bg-white/80'}`}
                          style={{ left: `${x(i)}%` }} />
                ))}
            </div>
            <div className="relative mx-1.5 mr-[42px] h-4 text-[11px] text-white/65" aria-hidden="true">
                {rotulosX.map((i) => (
                    <span key={i} className={`absolute ${i === 0 ? '' : i === total - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${x(i)}%` }}>{ddmm(pontos[i].dia)}</span>
                ))}
            </div>
        </figure>
    );
}

export function NotaDoPeriodo({ titulo, resumo, deltaAnterior, deltaReferencia, rotuloReferencia, pontos }: {
    titulo: string; resumo: Resumo; deltaAnterior: number | null; deltaReferencia: number | null;
    rotuloReferencia: string | null; pontos: PontoNota[];
}) {
    const nota = resumo.nota === null ? null : Math.round(resumo.nota);
    return (
        <Cartao variante="heroi" className="flex flex-col gap-4 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-[0.09em] text-white/75">{titulo}</span>
                    {nota === null ? (
                        <span className="display mt-1 text-2xl font-bold">Sem nota no período</span>
                    ) : (
                        <span className="flex items-baseline gap-3">
                            <Numero valor={nota} tamanho="xl" className="lg:text-[60px]" />
                            <span className="text-sm text-white/70">de 100</span>
                        </span>
                    )}
                    <span className="flex flex-wrap gap-x-5 gap-y-1">
                        {deltaAnterior !== null && (
                            <ComparacaoHeroi delta={Math.round(deltaAnterior)}>
                                {Math.round(deltaAnterior) === 0 ? 'igual ao período anterior' : `${Math.abs(Math.round(deltaAnterior))} ${Math.round(deltaAnterior) > 0 ? 'acima' : 'abaixo'} do período anterior`}
                            </ComparacaoHeroi>
                        )}
                        {deltaReferencia !== null && rotuloReferencia && (
                            <span className="text-[13px] text-white/75">
                                {Math.round(deltaReferencia) === 0 ? `igual à ${rotuloReferencia}` : `${Math.abs(Math.round(deltaReferencia))} ${Math.round(deltaReferencia) > 0 ? 'acima' : 'abaixo'} da ${rotuloReferencia}`}
                            </span>
                        )}
                    </span>
                    {nota === null && <span className="text-[13px] text-white/75">Os relatórios do período foram só de suporte ou conversa social.</span>}
                </div>
                <ul className="flex flex-col gap-1.5 text-xs text-white/80">
                    <li className="flex items-center gap-2"><span className="h-[3px] w-[18px] rounded bg-white" aria-hidden="true" />nota do dia</li>
                    {rotuloReferencia && <li className="flex items-center gap-2"><span className="w-[18px] border-t-2 border-dashed border-white/45" aria-hidden="true" />{rotuloReferencia}</li>}
                </ul>
            </div>
            <GraficoNota pontos={pontos} rotuloReferencia={rotuloReferencia} />
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/15 pt-3 text-[11.5px] text-white/70">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-white/80" aria-hidden="true" />dia com nota</li>
                <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm border border-dashed border-white/70" aria-hidden="true" />relatório sem nota (só suporte ou social)</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-2 rounded bg-white/30" aria-hidden="true" />sem relatório</li>
            </ul>
        </Cartao>
    );
}

// --- Destaques e leitura --------------------------------------------------------------

function LinhaDestaque({ valor, tom, titulo, texto }: { valor: ReactNode; tom: 'bom' | 'risco' | 'azul'; titulo: string; texto: string }) {
    const cor = { bom: 'bg-bom-sof text-bom-texto', risco: 'bg-risco-sof text-risco-texto', azul: 'bg-azul-sof text-azul' }[tom];
    return (
        <li className="flex items-center gap-3.5">
            <span className={`display num flex size-11 shrink-0 items-center justify-center rounded-[10px] text-base font-bold ${cor}`}>{valor}</span>
            <span className="flex min-w-0 flex-col">
                <span className="text-[13.5px] font-semibold">{titulo}</span>
                <span className="text-[12.5px] text-tinta-3">{texto}</span>
            </span>
        </li>
    );
}

const plural = (qtd: number, um: string, varios: string) => `${n(qtd)} ${qtd === 1 ? um : varios}`;

function contagemDoDia(d: DiaDestaque, foco: 'ganho' | 'perda'): string {
    if (foco === 'perda' && d.perdidas > 0) return plural(d.perdidas, 'oportunidade perdida', 'oportunidades perdidas');
    return [plural(d.leads, 'lead', 'leads'), plural(d.conversoes, 'conversão', 'conversões')].join(', ');
}

export function Destaques({ melhor, pior, sequencia, diasBons, diasComNota }: {
    melhor: DiaDestaque; pior: DiaDestaque; sequencia: { dias: number; desde: string | null }; diasBons: number; diasComNota: number;
}) {
    return (
        <Cartao className="flex flex-col gap-3.5">
            <RotuloSecao>Destaques do período</RotuloSecao>
            <ul className="flex flex-col gap-3 [&>li+li]:border-t [&>li+li]:border-linha-2 [&>li+li]:pt-3">
                <LinhaDestaque valor={melhor.nota} tom="bom" titulo="Melhor dia" texto={`${diaCurto(melhor.data_ref)} · ${contagemDoDia(melhor, 'ganho')}`} />
                <LinhaDestaque valor={pior.nota} tom="risco" titulo="Pior dia" texto={`${diaCurto(pior.data_ref)} · ${contagemDoDia(pior, 'perda')}`} />
                {sequencia.dias >= 2 && sequencia.desde ? (
                    <LinhaDestaque valor={sequencia.dias} tom="azul" titulo={`Dias seguidos com nota ${NOTA_BOA}+`}
                                   texto={`desde ${ddmm(sequencia.desde)}, contando só dias trabalhados`} />
                ) : (
                    <LinhaDestaque valor={diasBons} tom="azul" titulo={`Dias com nota ${NOTA_BOA}+`} texto={`de ${plural(diasComNota, 'dia', 'dias')} com nota no período`} />
                )}
            </ul>
        </Cartao>
    );
}

const JEITO_METADE: Record<number, string> = {
    7: 'da primeira para a segunda metade da semana',
    30: 'da 1ª para a 2ª quinzena',
    90: 'da primeira para a segunda metade do período',
};

export function Leitura({ sujeito, periodo, virada, subiu, caiu, comMec }: {
    sujeito: string; periodo: number; virada: number | null; subiu: MudancaEtapa | null; caiu: MudancaEtapa | null; comMec: boolean;
}) {
    const frase = virada === null ? null
        : Math.abs(virada) < 2 ? `${sujeito} ficou estável ao longo do período.`
            : `${sujeito} ${virada > 0 ? 'subiu' : 'caiu'} ${plural(Math.abs(virada), 'ponto', 'pontos')} ${JEITO_METADE[periodo]}.`;
    return (
        <Cartao variante="suave" className="flex flex-1 flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-[0.09em] text-azul">A leitura do período</span>
            {frase && <p className="display text-lg font-semibold leading-snug tracking-[-0.01em]">{frase}</p>}
            {(subiu || caiu) && (
                <p className="text-[13px] text-tinta-2">
                    {subiu && <>No MEC, o que mais subiu foi <strong className="text-tinta">{subiu.nome}</strong> (+{subiu.delta} pts). </>}
                    {caiu && <>{subiu ? 'O que mais caiu' : 'No MEC, o que mais caiu'} foi <strong className="text-tinta">{caiu.nome}</strong> ({caiu.delta} pts).</>}
                </p>
            )}
            {comMec && (
                <Link href="/meu-mec" className="mt-auto flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-azul">Ver o Meu MEC →</Link>
            )}
        </Cartao>
    );
}

// --- KPIs ------------------------------------------------------------------------------

function comparar(d: number | null, melhorQuando: Sentido, texto: (abs: number, subiu: boolean) => string, igual = 'igual ao período anterior') {
    if (d === null) return undefined;
    return <Comparacao delta={d} melhorQuando={melhorQuando}>{d === 0 ? igual : texto(Math.abs(d), d > 0)}</Comparacao>;
}

export function NumerosDoPeriodo({ atual, anterior }: { atual: Resumo; anterior: Resumo | null }) {
    const d = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : a - b);
    const maisMenos = (abs: number, subiu: boolean) => `${n(abs)} a ${subiu ? 'mais' : 'menos'}`;
    const respostaMin = (s: number | null) => (s === null ? null : Math.round(s / 60));
    const semBase = anterior ? undefined : 'sem período anterior para comparar';
    const dResposta = d(respostaMin(atual.respostaS), respostaMin(anterior?.respostaS ?? null));
    const taxa = atual.taxa === null ? null : Math.round(atual.taxa);
    const dTaxa = d(taxa, anterior?.taxa == null ? null : Math.round(anterior.taxa));
    const tempo = atual.respostaS === null ? null : tempoCurto(atual.respostaS);
    const [valorTempo, unidadeTempo] = tempo ? [tempo.replace(/\s*(s|min|h)$/, ''), ` ${tempo.match(/(s|min|h)$/)?.[0] ?? ''}`] : ['—', undefined];

    return (
        <section className="flex flex-col gap-3.5">
            <RotuloSecao complemento={anterior ? 'comparados com o período anterior' : undefined}>Números do período</RotuloSecao>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                <Kpi rotulo="Leads atendidos" valor={n(atual.leads)}
                     comparacao={comparar(d(atual.leads, anterior?.leads), 'maior', maisMenos)} legenda={semBase} />
                <Kpi rotulo="Conversões" valor={n(atual.conversoes)}
                     comparacao={comparar(d(atual.conversoes, anterior?.conversoes), 'maior', maisMenos)}
                     legenda="identificadas pela IA na conversa" />
                <Kpi rotulo="Oportunidades perdidas" valor={n(atual.perdidas)}
                     comparacao={comparar(d(atual.perdidas, anterior?.perdidas), 'menor', maisMenos)} legenda={semBase} />
                <Kpi rotulo="Tempo de resposta" valor={valorTempo} unidade={unidadeTempo}
                     comparacao={comparar(dResposta, 'menor', (abs, subiu) => `${abs} min mais ${subiu ? 'lento' : 'rápido'}`)}
                     legenda={atual.respostaS === null ? 'sem resposta medida no período' : semBase} />
                <Kpi rotulo="Taxa de resposta" valor={taxa ?? '—'} unidade={taxa === null ? undefined : '%'}
                     comparacao={comparar(dTaxa, 'maior', (abs) => `${abs} pts`)} legenda={semBase} />
            </div>
        </section>
    );
}

// --- Volume por dia ----------------------------------------------------------------------

export type VolumeDia = { dia: string; temRelatorio: boolean; leads: number; conversoes: number; perdidas: number };

export function VolumePorDia({ dias, resumo }: { dias: VolumeDia[]; resumo: Resumo }) {
    const maximo = Math.max(1, ...dias.map((d) => d.leads));
    const porDia = resumo.diasComRelatorio ? Math.round(resumo.leads / resumo.diasComRelatorio) : null;
    const estreito = dias.length > 31;
    const rotulosX = [0, Math.round((dias.length - 1) / 2), dias.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    return (
        <Cartao className="flex flex-col gap-4 lg:p-6">
            <RotuloSecao acao={
                <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-tinta-2">
                    <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-azul/25" aria-hidden="true" />leads</li>
                    <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-azul" aria-hidden="true" />conversões</li>
                    <li className="flex items-center gap-1.5"><span className="size-[7px] rounded-full bg-risco" aria-hidden="true" />oportunidade perdida</li>
                </ul>
            }>Volume por dia</RotuloSecao>
            <div className={`flex h-[180px] items-end border-b border-linha ${estreito ? 'gap-px' : 'gap-1 lg:gap-1.5'}`} role="img"
                 aria-label={`Leads, conversões e oportunidades perdidas por dia, ${dias.length} dias`}>
                {dias.map((d) => {
                    const titulo = `${diaCurto(d.dia)}: ${d.temRelatorio ? `${d.leads} leads, ${d.conversoes} conversões, ${d.perdidas} perdidas` : 'sem relatório'}`;
                    if (!d.temRelatorio || d.leads === 0) return <span key={d.dia} title={titulo} className="h-0.5 min-w-0.5 flex-1 rounded bg-linha" />;
                    return (
                        <span key={d.dia} title={titulo} className="flex h-full min-w-0.5 flex-1 flex-col items-center justify-end gap-[3px]">
                            {!estreito && Array.from({ length: Math.min(d.perdidas, 3) }, (_, k) => (
                                <span key={k} className="size-[5px] shrink-0 rounded-full bg-risco lg:size-1.5" aria-hidden="true" />
                            ))}
                            <span className="relative w-full rounded-t-[3px] bg-azul/25" style={{ height: `${(d.leads / maximo) * 88}%` }}>
                                <span className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-azul" style={{ height: `${(d.conversoes / Math.max(1, d.leads)) * 100}%` }} />
                                {estreito && d.perdidas > 0 && <span className="absolute inset-x-0 -top-1 h-0.5 bg-risco" aria-hidden="true" />}
                            </span>
                        </span>
                    );
                })}
            </div>
            <div className="-mt-2 flex justify-between text-[11px] text-tinta-3" aria-hidden="true">
                {rotulosX.map((i) => <span key={i}>{ddmm(dias[i].dia)}</span>)}
            </div>
            {porDia !== null && (
                <p className="text-[12.5px] text-tinta-3">Média de {plural(porDia, 'lead', 'leads')} por dia com relatório.</p>
            )}
        </Cartao>
    );
}

// --- MEC -------------------------------------------------------------------------------

export function MecDoPeriodo({ atual, anterior, titulo }: { atual: Mec; anterior: Mec | null; titulo: string }) {
    const dGeral = atual.geral === null || anterior?.geral == null ? null : atual.geral - anterior.geral;
    return (
        <Cartao className="flex flex-col gap-3.5 lg:p-6">
            <RotuloSecao acao={atual.geral !== null && (
                <span className="flex items-baseline gap-2">
                    <Numero valor={atual.geral} unidade="%" tamanho="md" className="!text-xl" />
                    {dGeral !== null && <Comparacao delta={dGeral}>{dGeral === 0 ? '=' : `${Math.abs(dGeral)} pts`}</Comparacao>}
                </span>
            )}>{titulo}</RotuloSecao>
            <ul className="flex flex-col gap-2.5">
                {ETAPAS.map((e) => {
                    const pct = atual.porEtapa[e];
                    const antes = anterior?.porEtapa[e] ?? null;
                    const d = pct === null || antes === null ? null : pct - antes;
                    const tom = pct === null ? 'neutro' : tomFaixa(pct, 35, 50);
                    const tomD = d === null || Math.abs(d) < 5 ? 'neutro' : tomDelta(d, 'maior');
                    return (
                        <li key={e} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_76px] items-center gap-3 text-[13px] lg:grid-cols-[150px_minmax(0,1fr)_76px]">
                            <span className={`truncate ${pct === null ? 'text-tinta-3' : ''}`}>{NOMES_ETAPA[e]}</span>
                            <Barra pct={pct} tom={tom} rotulo={NOMES_ETAPA[e]} />
                            <span className="num text-right text-[12.5px]">
                                {pct === null ? <span className="text-tinta-3">n/v</span> : (
                                    <><strong className={tom === 'azul' ? '' : TEXTO[tom]}>{pct}%</strong>
                                        {d !== null && <span className={`ml-1.5 ${tomD === 'neutro' ? 'text-tinta-3' : `font-semibold ${TEXTO[tomD]}`}`}>{d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d)}</span>}</>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-auto border-t border-linha-2 pt-3 text-xs text-tinta-3">
                Média dos dias com MEC no período. n/v: a etapa não coube em nenhuma conversa, então não entra na conta.
            </p>
        </Cartao>
    );
}

// --- Dia da semana -------------------------------------------------------------------------

export function NotaPorSemana({ semana, fraco }: { semana: NotaSemana[]; fraco: (NotaSemana & { abaixo: number }) | null }) {
    return (
        <Cartao className="flex flex-col gap-4 lg:p-6">
            <RotuloSecao>Nota por dia da semana</RotuloSecao>
            <div className="flex h-[160px] items-end gap-2 lg:gap-3">
                {semana.map((s) => {
                    const destaque = fraco?.dia === s.dia;
                    return (
                        <div key={s.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${s.nome}: nota ${s.nota} em ${plural(s.dias, 'dia', 'dias')}`}>
                            <span className={`num text-[12.5px] ${destaque ? 'font-bold text-atencao-texto' : 'font-semibold'}`}>{s.nota}</span>
                            <span className={`block w-full rounded-t-md rounded-b-[2px] ${destaque ? 'bg-atencao' : 'bg-azul/25'}`} style={{ height: `${Math.max(4, s.nota * 0.8)}%` }} />
                            <span className={`text-xs ${destaque ? 'font-bold text-atencao-texto' : 'text-tinta-3'}`}>{s.nome}</span>
                        </div>
                    );
                })}
            </div>
            {fraco && (
                <p className="flex items-start gap-3 rounded-[10px] bg-atencao-sof px-3.5 py-3 text-[13px] text-atencao-texto">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg>
                    </span>
                    <span><strong>{NOME_LONGO[fraco.dia]} é o dia mais fraco:</strong> {plural(fraco.abaixo, 'ponto', 'pontos')} abaixo da média dos outros dias.</span>
                </p>
            )}
        </Cartao>
    );
}

const NOME_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// --- Dia a dia -----------------------------------------------------------------------------

export type LinhaDiaADia = { dia: string; nota: number | null; leads: number; conversoes: number; perdidas: number; respostaS: number | null };

const GRADE = 'grid-cols-[1.2fr_1.6fr_0.8fr_1fr_0.9fr_0.9fr]';

function Linha({ l }: { l: LinhaDiaADia }) {
    const resposta = l.respostaS === null ? '—' : tempoCurto(l.respostaS);
    return (
        <li className="border-t border-linha-2">
            <div className={`hidden min-h-12 items-center gap-3 px-5 text-[13.5px] sm:grid ${GRADE}`}>
                <span>{diaCurto(l.dia)}</span>
                <span className="flex items-center gap-2.5">
                    {l.nota === null ? <span className="text-[12.5px] text-tinta-3">sem nota</span> : (
                        <><strong className="num w-6">{l.nota}</strong><span className="flex-1"><Barra pct={l.nota} tom={tomFaixa(l.nota, 40, 60)} rotulo={`Nota de ${diaCurto(l.dia)}`} /></span></>
                    )}
                </span>
                <span className="num text-right">{n(l.leads)}</span>
                <span className="num text-right">{n(l.conversoes)}</span>
                <span className={`num text-right ${l.perdidas > 0 ? 'text-risco-texto' : ''}`}>{n(l.perdidas)}</span>
                <span className="num text-right">{resposta}</span>
            </div>
            <div className="flex min-h-14 items-center gap-3 px-4 py-2 sm:hidden">
                <strong className={`display num flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-sm ${l.nota === null ? 'border border-dashed border-linha-campo text-tinta-3' : 'bg-azul-sof text-azul'}`}>
                    {l.nota ?? '—'}
                </strong>
                <span className="flex min-w-0 flex-col">
                    <span className="text-[13.5px] font-semibold">{diaCurto(l.dia)}</span>
                    <span className="text-xs text-tinta-3">
                        {[plural(l.leads, 'lead', 'leads'), plural(l.conversoes, 'conversão', 'conversões'), l.perdidas ? plural(l.perdidas, 'perdida', 'perdidas') : null, l.respostaS === null ? null : `resp. ${resposta}`].filter(Boolean).join(' · ')}
                    </span>
                </span>
            </div>
        </li>
    );
}

export function DiaADia({ linhas, visiveis = 7 }: { linhas: LinhaDiaADia[]; visiveis?: number }) {
    const primeiras = linhas.slice(0, visiveis);
    const resto = linhas.slice(visiveis);
    return (
        <Cartao recuo="nenhum" className="flex flex-col overflow-hidden pt-4 lg:pt-5">
            <div className="px-4 pb-3 lg:px-5"><RotuloSecao complemento="do mais recente">Dia a dia</RotuloSecao></div>
            <div className={`hidden gap-3 bg-fundo px-5 py-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-tinta-3 sm:grid ${GRADE}`}>
                <span>Dia</span><span>Nota</span><span className="text-right">Leads</span><span className="text-right">Conversões</span><span className="text-right">Perdidas</span><span className="text-right">Resposta</span>
            </div>
            <ul>{primeiras.map((l) => <Linha key={l.dia} l={l} />)}</ul>
            {resto.length > 0 && (
                <details className="group border-t border-linha-2">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center text-[13px] font-semibold text-azul group-open:hidden">
                        Ver os outros {plural(resto.length, 'dia', 'dias')}
                    </summary>
                    <ul className="[&>li:first-child]:border-t-0">{resto.map((l) => <Linha key={l.dia} l={l} />)}</ul>
                </details>
            )}
        </Cartao>
    );
}
