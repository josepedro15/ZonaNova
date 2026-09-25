import Link from 'next/link';
import type { Route } from 'next';
import { Barra, CabecalhoPagina, Cartao, EstadoVazio, Kpi, Numero, Pagina, RotuloSecao, SELO, Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos, ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { tomFaixa } from '@/lib/visual';
import { resumirObservacoes, type LinhaObservacao } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

export const dynamic = 'force-dynamic';

const JANELA = 14;
type Dia = { data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };

export default async function MeuMecPage() {
    const { supabase, perfil } = await contextoApp();
    const desde = diaMenos(dataHoje(), JANELA);
    const [{ data: dias }, observacoes, sondagens, pb] = await Promise.all([
        supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa').eq('user_id', perfil.id)
            .order('data_ref', { ascending: false }).limit(1).returns<Dia[]>(),
        paginar<LinhaObservacao>((de, ate) => supabase.from('mec_observacoes')
            .select('conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .eq('user_id', perfil.id).gte('data_ref', desde).order('id').range(de, ate)),
        paginar<{ conversa_id: string }>((de, ate) => supabase.from('aderencia_conversa').select('conversa_id')
            .eq('user_id', perfil.id).eq('etapa', 'sondagem').eq('aplicavel', true).gte('data_ref', desde).order('id').range(de, ate)),
        carregarPlaybook(supabase, null),
    ]);
    const dia = dias?.[0];
    const { data: marcacoes } = dia
        ? await supabase.from('aderencia_conversa').select('conversa_id,etapa,aplicavel,aplicado,justificativa,conversas!inner(cliente_nome,bloqueada)')
            .eq('user_id', perfil.id).eq('conversas.bloqueada', false).eq('data_ref', dia.data_ref).order('created_at', { ascending: false })
        : { data: [] };
    const exemplo = new Map<string, Record<string, unknown>>();
    for (const m of marcacoes ?? []) if (m.aplicavel && !exemplo.has(m.etapa as string)) exemplo.set(m.etapa as string, m as Record<string, unknown>);

    const resumo = observacoes.length ? resumirObservacoes(observacoes, new Set(sondagens.map((s) => s.conversa_id))) : null;
    const rotulo = (chave: string) => pb?.rotulos.get(chave) ?? chave;
    const porItem = Object.entries(resumo?.detalhe.sondagem_por_item ?? {}).sort((a, b) => a[1] - b[1]);
    const frases = observacoes.filter((o) => o.sinal === 'frase_proibida');
    const fechamento = Object.entries(resumo?.detalhe.fechamento ?? {}).sort((a, b) => b[1] - a[1]);
    const totalFechamento = fechamento.reduce((s, [, n]) => s + n, 0);
    const totalObjecoes = Object.values(resumo?.detalhe.objecoes ?? {}).reduce((s, n) => s + n, 0) + (resumo?.detalhe.fora_do_catalogo ?? 0);
    const unidadePct = (v: number | null | undefined) => (v === null || v === undefined ? undefined : '%');

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/meu-mec">
            <Pagina>
                <CabecalhoPagina sobre={`Últimos ${JANELA} dias · a conta só considera o que cabia em cada negociação`} titulo="Meu MEC" />

                {!resumo ? (
                    <EstadoVazio titulo="Ainda sem o detalhe do MEC">
                        O detalhe por item (sondagem, objeções, fechamento) aparece depois das próximas negociações analisadas.
                    </EstadoVazio>
                ) : (
                    <>
                        <div className="grid gap-5 xl:grid-cols-12 xl:items-start">
                            <Cartao className="flex flex-col gap-3 xl:col-span-7">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <h2 className="display text-lg font-bold">Sondagem</h2>
                                        <p className="text-[12.5px] text-tinta-3">Das informações que o Book pede, quantas você teve em mãos por conversa</p>
                                    </div>
                                    <span className="flex items-baseline gap-1.5">
                                        <Numero valor={resumo.sondagem_itens === null ? '—' : String(resumo.sondagem_itens).replace('.', ',')} />
                                        <span className="text-sm text-tinta-3">de {porItem.length || 7}</span>
                                    </span>
                                </div>
                                {porItem.length ? (
                                    <ul className="flex flex-col gap-2.5">
                                        {porItem.map(([chave, pct], i) => (
                                            <li key={chave} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_44px] items-center gap-3 text-[13px]">
                                                <span className={i === 0 ? 'font-semibold' : ''}>
                                                    {rotulo(chave)}
                                                    {i === 0 && <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO.atencao}`}>mais esquecida</span>}
                                                </span>
                                                <Barra pct={pct} tom={tomFaixa(pct, 35, 60)} rotulo={rotulo(chave)} />
                                                <span className="num text-right font-semibold">{pct}%</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Nenhuma negociação em que a sondagem cabia.</p>}
                            </Cartao>
                            <div className="grid grid-cols-2 gap-3 xl:col-span-5">
                                <Kpi rotulo="Perguntas abertas" valor={resumo.detalhe.perguntas_abertas_pct ?? '—'} unidade={unidadePct(resumo.detalhe.perguntas_abertas_pct)}
                                     legenda="das perguntas que você fez" />
                                <Kpi rotulo="“Algo mais?” e parecidas" valor={resumo.frases_proibidas}
                                     legenda={resumo.frases_proibidas ? 'o Book pede oferecer produto específico' : 'nenhuma vez no período'} />
                                <Kpi rotulo="Contorno completo" valor={resumo.detalhe.contorno_completo_pct ?? '—'} unidade={unidadePct(resumo.detalhe.contorno_completo_pct)}
                                     legenda={totalObjecoes ? `em ${totalObjecoes} objeç${totalObjecoes === 1 ? 'ão' : 'ões'}` : 'nenhuma objeção no período'} />
                                <Kpi rotulo="Final positivo" valor={resumo.detalhe.final_positivo_pct ?? '—'} unidade={unidadePct(resumo.detalhe.final_positivo_pct)}
                                     legenda={`em ${resumo.detalhe.conversas} negociaç${resumo.detalhe.conversas === 1 ? 'ão' : 'ões'}`} />
                            </div>
                        </div>
                        <div className="grid gap-5 lg:grid-cols-2">
                            <Cartao className="flex flex-col gap-3">
                                <h2 className="display text-lg font-bold">Como você fecha</h2>
                                {totalFechamento ? (
                                    <ul className="flex flex-col gap-2">
                                        {fechamento.map(([chave, n]) => (
                                            <li key={chave} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_40px] items-center gap-3 text-[13px]">
                                                <span>{chave === 'nenhum' ? 'Não tentou fechar' : chave === 'outra' ? 'Outra técnica' : rotulo(chave)}</span>
                                                <Barra pct={(n / totalFechamento) * 100} tom={chave === 'nenhum' ? 'risco' : 'azul'} rotulo={chave} />
                                                <span className="num text-right">{n}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Sem negociação no período.</p>}
                            </Cartao>
                            <Cartao className="flex flex-col gap-3">
                                <h2 className="display text-lg font-bold">Frases para evitar</h2>
                                {frases.length ? (
                                    <ul className="flex flex-col gap-1.5">
                                        {frases.slice(0, 4).map((f, k) => <li key={k} className="text-[13px] italic text-tinta-2">&ldquo;{f.trecho ?? rotulo(f.item_chave ?? '')}&rdquo;</li>)}
                                    </ul>
                                ) : <p className="text-[13px] text-tinta-3">Nenhuma no período.</p>}
                                <p className="text-xs text-tinta-3">No lugar, ofereça um produto específico, como o Book sugere: &ldquo;Incluí o pincel tal que tu vai precisar&rdquo;.</p>
                            </Cartao>
                        </div>
                    </>
                )}

                <RotuloSecao complemento={dia ? 'último relatório' : undefined}>Por etapa</RotuloSecao>
                {dia ? (
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {ETAPAS.map((chave) => {
                            const bruto = dia.por_etapa?.[chave];
                            const pct = bruto == null ? null : Math.round(Number(bruto));
                            const m = exemplo.get(chave);
                            const conversa = m?.conversas as { cliente_nome: string | null } | null | undefined;
                            return (
                                <Cartao key={chave} className="flex flex-col gap-2.5">
                                    <div className="flex items-baseline justify-between">
                                        <h3 className="display text-base font-bold">{NOMES_ETAPA[chave]}</h3>
                                        <Numero valor={pct ?? '—'} unidade={pct === null ? undefined : '%'} tamanho="md" />
                                    </div>
                                    <Barra pct={pct} tom={pct === null ? 'neutro' : tomFaixa(pct, 35, 50)} rotulo={NOMES_ETAPA[chave]} />
                                    {m ? (
                                        <div className="flex flex-col gap-1 border-t border-linha-2 pt-2">
                                            <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-tinta-3">Exemplo recente · {String(m.aplicado).replaceAll('_', ' ')}</span>
                                            <p className="text-[12.5px] leading-relaxed text-tinta-2">{String(m.justificativa)}</p>
                                            <Link href={`/conversas/${m.conversa_id}` as Route} className="flex min-h-11 items-center text-[12.5px] font-semibold text-azul">
                                                Ver conversa{conversa?.cliente_nome ? ` com ${conversa.cliente_nome}` : ''} →
                                            </Link>
                                        </div>
                                    ) : pct === null && <p className="text-[12px] text-tinta-3">Não houve situação em que esta etapa coubesse.</p>}
                                </Cartao>
                            );
                        })}
                    </div>
                ) : (
                    <EstadoVazio titulo="Sem relatório do MEC ainda">A aderência aparece depois do primeiro relatório analisado.</EstadoVazio>
                )}
            </Pagina>
        </Shell>
    );
}
