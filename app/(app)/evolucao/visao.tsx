import { CabecalhoPagina, EstadoVazio, Pagina, Segmentado, type Papel } from '@/components/ui';
import { diaMenos } from '@/lib/derivacoes';
import {
    NOTA_BOA, delta, diaMaisFraco, mecDoPeriodo, melhorEPior, mudancasDoMec, noIntervalo, notaPorDiaDaSemana,
    resumir, sequenciaAtual, viradaDoPeriodo, type DiaMec, type Periodo,
} from '@/lib/evolucao';
import { diasAte, type LinhaDia } from '@/lib/painel';
import { media } from '@/lib/visual';
import {
    DiaADia, Destaques, Leitura, MecDoPeriodo, NotaDoPeriodo, NotaPorSemana, NumerosDoPeriodo, VolumePorDia, ddmm,
} from './secoes';

export type NotaReferencia = { data_ref: string; score_geral: number | string | null };

const nota = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v)));

/**
 * A tela inteira a partir das linhas já buscadas: `linhas` cobre o período e
 * o anterior (para comparar); `referencia`, só o período. Sem I/O aqui — é o
 * que deixa /dev/evolucao mostrar a tela com dados de exemplo.
 */
export function VisaoEvolucao({ papel, periodo, fim, linhas, referencia, aderencias, base = '/evolucao' }: {
    papel: Papel; periodo: Periodo; fim: string; linhas: LinhaDia[]; referencia: NotaReferencia[]; aderencias: DiaMec[]; base?: string;
}) {
    const atuais = noIntervalo(linhas, fim, periodo);
    const anteriores = noIntervalo(linhas, diaMenos(fim, periodo), periodo);
    const resumo = resumir(atuais);
    const resumoAnterior = anteriores.length ? resumir(anteriores) : null;

    const sujeito = papel === 'vendedor' ? 'Sua nota' : papel === 'gestor' ? 'A nota da unidade' : 'A nota da rede';
    const rotuloReferencia = papel === 'vendedor' ? 'média da unidade' : papel === 'gestor' ? 'média da rede' : null;
    const escopo = papel === 'vendedor' ? 'Seu histórico' : papel === 'gestor' ? 'Suas unidades' : 'A rede';

    const cabecalho = (
        <CabecalhoPagina
            sobre={`${escopo} · ${ddmm(diaMenos(fim, periodo - 1))} a ${ddmm(fim)}`}
            titulo="Evolução"
            acoes={<Segmentado rotulo="Período" base={base} param="periodo" atual={String(periodo)}
                               opcoes={[{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }]} />} />
    );

    if (atuais.length === 0) {
        return (
            <Pagina>
                {cabecalho}
                <EstadoVazio titulo="Nenhum relatório nesse período">
                    Os relatórios fecham todo dia às 00h30, com as conversas do dia anterior.
                    {resumoAnterior ? ' Escolha um período maior para ver o histórico que já existe.' : ' A evolução aparece a partir do primeiro.'}
                </EstadoVazio>
            </Pagina>
        );
    }

    const porDia = new Map(atuais.map((l) => [l.data_ref, l]));
    const refPorDia = new Map(referencia.map((r) => [r.data_ref, nota(r.score_geral)]));
    const dias = diasAte(fim, periodo);
    const pontos = dias.map((dia) => ({
        dia, temRelatorio: porDia.has(dia), nota: nota(porDia.get(dia)?.score_geral), referencia: refPorDia.get(dia) ?? null,
    }));

    const par = melhorEPior(atuais);
    const semana = notaPorDiaDaSemana(atuais);
    const diasMec = noIntervalo(aderencias, fim, periodo);
    const diasMecAnterior = noIntervalo(aderencias, diaMenos(fim, periodo), periodo);
    const mecAtual = mecDoPeriodo(diasMec);
    const mecAnterior = diasMecAnterior.length ? mecDoPeriodo(diasMecAnterior) : null;
    const temMec = diasMec.length > 0;
    const mudancas = temMec && mecAnterior ? mudancasDoMec(mecAtual, mecAnterior) : { subiu: null, caiu: null };
    const virada = viradaDoPeriodo(atuais, fim, periodo);
    const temLeitura = virada !== null || !!mudancas.subiu || !!mudancas.caiu;
    const lateral = !!par || temLeitura;
    const comSemana = semana.length >= 2;

    return (
        <Pagina className="lg:gap-7">
            {cabecalho}
            <p className="-mt-3 text-[13.5px] text-tinta-2">
                {resumo.diasComRelatorio} {resumo.diasComRelatorio === 1 ? 'dia' : 'dias'} com relatório no período · {resumo.diasComNota} com nota
            </p>

            <div className="grid gap-5 xl:grid-cols-12">
                <div className={lateral ? 'xl:col-span-8' : 'xl:col-span-12'}>
                    <NotaDoPeriodo titulo={`${sujeito} média · ${periodo} dias`} resumo={resumo} pontos={pontos}
                                   deltaAnterior={delta(resumo.nota, resumoAnterior?.nota ?? null)}
                                   deltaReferencia={delta(resumo.nota, media(referencia.map((r) => r.score_geral)))}
                                   rotuloReferencia={referencia.length ? rotuloReferencia : null} />
                </div>
                {lateral && (
                    <div className="flex flex-col gap-5 xl:col-span-4">
                        {par && <Destaques melhor={par.melhor} pior={par.pior} sequencia={sequenciaAtual(atuais)}
                                           diasBons={atuais.filter((l) => (nota(l.score_geral) ?? -1) >= NOTA_BOA).length}
                                           diasComNota={resumo.diasComNota} />}
                        {temLeitura && <Leitura sujeito={sujeito} periodo={periodo} virada={virada} comMec={temMec} {...mudancas} />}
                    </div>
                )}
            </div>

            <NumerosDoPeriodo atual={resumo} anterior={resumoAnterior} />

            <div className="grid gap-5 xl:grid-cols-12">
                <div className={temMec ? 'xl:col-span-7' : 'xl:col-span-12'}>
                    <VolumePorDia resumo={resumo} dias={dias.map((dia) => {
                        const l = porDia.get(dia);
                        return {
                            dia, temRelatorio: !!l, leads: Number(l?.leads_atendidos ?? 0),
                            conversoes: Number(l?.conversoes_confirmadas ?? 0), perdidas: Number(l?.oportunidades_perdidas ?? 0),
                        };
                    })} />
                </div>
                {temMec && (
                    <div className="xl:col-span-5">
                        <MecDoPeriodo titulo="Seu MEC no período" atual={mecAtual} anterior={mecAnterior} />
                    </div>
                )}
            </div>

            <div className="grid gap-5 xl:grid-cols-12 xl:items-start">
                {comSemana && (
                    <div className="xl:col-span-5">
                        <NotaPorSemana semana={semana} fraco={diaMaisFraco(semana)} />
                    </div>
                )}
                <div className={comSemana ? 'xl:col-span-7' : 'xl:col-span-12'}>
                    <DiaADia linhas={[...atuais].sort((a, b) => b.data_ref.localeCompare(a.data_ref)).map((l) => ({
                        dia: l.data_ref,
                        nota: nota(l.score_geral),
                        leads: Number(l.leads_atendidos ?? 0),
                        conversoes: Number(l.conversoes_confirmadas ?? 0),
                        perdidas: Number(l.oportunidades_perdidas ?? 0),
                        respostaS: l.tempo_medio_resposta_s === null ? null : Number(l.tempo_medio_resposta_s),
                    }))} />
                </div>
            </div>
        </Pagina>
    );
}
