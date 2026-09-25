import Link from 'next/link';
import type { Route } from 'next';
import {
    Alerta, Avatar, Barra, CabecalhoPagina, Cartao, Comparacao, Kpi, Pagina, Selo, Tabela, TEXTO,
} from '@/components/ui';
import { dataHoje, type contextoApp } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { esperaDoCliente, juntarPorDia, type LinhaDia, type Msg } from '@/lib/painel';
import { comQuemFalar, contarObjecoes, diaMenos, variacaoSemanal, type NotaDia } from '@/lib/derivacoes';
import { setaDoTom, tomDelta, tomFaixa, tomResposta } from '@/lib/visual';
import { contarObjecoesPorCodigo } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];
type Diario = NotaDia & { user_id: string; leads_atendidos: number; conversoes_confirmadas: number; tempo_medio_resposta_s: number | null };

const DUAS_HORAS = 2 * 60 * 60 * 1000;
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const minutos = (s: number | string | null | undefined) => (s == null ? null : Math.round(Number(s) / 60));

/**
 * A equipe de uma loja (ou várias): serve o gestor (`/equipe`, uma ou mais
 * lojas via `gestor_unidades`) e o supervisor (`/unidades/[id]`, uma loja
 * só). `unidadeIds` null é o escopo inteiro que a RLS deixa ver — o
 * comportamento de antes para supervisor e admin em /equipe.
 */
export async function VisaoUnidade({ supabase, unidadeIds, nomeUnidade, titulo, voltar }: {
    supabase: Supabase; unidadeIds: string[] | null; nomeUnidade: string; titulo: string; voltar?: { href: Route; rotulo: string };
}) {
    const hoje = dataHoje();
    const agora = new Date();
    const doisDias = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    let qPessoas = supabase.from('profiles').select('id,nome,unidade_id,unidades!profiles_unidade_id_fkey(nome)').eq('role', 'vendedor').eq('status', 'ativo').order('nome');
    let qDiarios = supabase.from('relatorios_diarios').select('user_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,tempo_medio_resposta_s')
        .gte('data_ref', diaMenos(hoje, 15)).order('data_ref', { ascending: false }).limit(1000);
    let qConexoes = supabase.from('vw_conexoes_status').select('user_id,status,ultimo_evento_em');
    let qPendentes = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    let qUnidade = supabase.from('relatorios_unidade')
        .select('unidade_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta')
        .order('data_ref', { ascending: false }).limit(60);
    let qAderencia = supabase.from('aderencia_diaria').select('user_id,data_ref,por_etapa').gte('data_ref', diaMenos(hoje, 7)).order('data_ref', { ascending: false });
    let qAnalises = supabase.from('analises_conversa').select('payload').gte('data_ref', diaMenos(hoje, 7)).order('data_ref', { ascending: false }).limit(1000);
    // Só 48 h de conversa: a espera que importa ao gestor é a de agora. A
    // mensagens(...) embutida também é filtrada pelas mesmas 48h — sem isso,
    // cada conversa ativa trazia o histórico inteiro. Acima de 500 conversas
    // ativas em 48h, a contagem de espera fica aproximada (só as 500 mais
    // recentes entram na conta).
    let qConversas = supabase.from('conversas').select('id,user_id,mensagens(direcao,automatica,enviada_em)')
        .gte('ultima_mensagem_em', doisDias).gte('mensagens.enviada_em', doisDias).eq('bloqueada', false)
        .order('ultima_mensagem_em', { ascending: false }).limit(500);
    if (unidadeIds) {
        qPessoas = qPessoas.in('unidade_id', unidadeIds);
        qDiarios = qDiarios.in('unidade_id', unidadeIds);
        qConexoes = qConexoes.in('unidade_id', unidadeIds);
        qPendentes = qPendentes.in('unidade_id', unidadeIds);
        qUnidade = qUnidade.in('unidade_id', unidadeIds);
        qAderencia = qAderencia.in('unidade_id', unidadeIds);
        qAnalises = qAnalises.in('unidade_id', unidadeIds);
        qConversas = qConversas.in('unidade_id', unidadeIds);
    }
    // Desvio do brief: o PostgREST corta em 1000 linhas por pedido mesmo com
    // .limit(2000) (mesmo comportamento documentado em lib/paginar.ts), então
    // uma rede inteira com muita objeção na semana perderia linhas em
    // silêncio. Pagina com paginar() em vez de .limit(2000) direto.
    const qObjecoes = (de: number, ate: number) => {
        let q = supabase.from('mec_observacoes').select('item_chave').eq('sinal', 'objecao')
            .gte('data_ref', diaMenos(hoje, 7)).order('id').range(de, ate);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q;
    };

    const [{ data: pessoas }, { data: diarios }, { data: conexoes }, { count: pendentes }, { data: daUnidade }, { data: rede }, { data: aderencias }, { data: analises }, { data: conversas }, objecoesCodigo, pb] = await Promise.all([
        qPessoas.returns<{ id: string; nome: string; unidade_id: string; unidades: { nome: string } | null }[]>(),
        qDiarios.returns<Diario[]>(),
        qConexoes.returns<{ user_id: string; status: string; ultimo_evento_em: string | null }[]>(),
        qPendentes,
        qUnidade.returns<LinhaDia[]>(),
        supabase.from('relatorios_rede').select('data_ref,score_geral').order('data_ref', { ascending: false }).limit(1).maybeSingle<{ data_ref: string; score_geral: number | null }>(),
        qAderencia.returns<{ user_id: string; data_ref: string; por_etapa: Record<string, number | null> | null }[]>(),
        qAnalises.returns<{ payload: unknown }[]>(),
        qConversas.returns<{ id: string; user_id: string; mensagens: Msg[] }[]>(),
        paginar<{ item_chave: string | null }>(qObjecoes),
        carregarPlaybook(supabase, null),
    ]);

    const equipe = pessoas ?? [];
    // Mais de uma loja no escopo (RLS inteira, ou gestor com várias lojas em
    // gestor_unidades): sem isso, a lista mistura vendedores de lojas
    // diferentes sem dizer de qual loja é cada um.
    const multiplas = unidadeIds === null || unidadeIds.length > 1;
    const lojaDoVendedor = new Map(equipe.map((p) => [p.id, p.unidades?.nome ?? null]));
    // Os números do topo são de UM dia, o último fechado, juntando as unidades
    // do escopo (ponderado por leads) — a mesma regra do rollup.
    const dias = juntarPorDia(daUnidade ?? []);
    const ultimo = dias.at(-1) ?? null;
    const anterior = dias.at(-2) ?? null;
    const notaEquipe = ultimo?.score_geral == null ? null : Math.round(Number(ultimo.score_geral));
    const deltaNota = notaEquipe !== null && anterior?.score_geral != null ? notaEquipe - Math.round(Number(anterior.score_geral)) : null;

    const notas = new Map<string, Diario[]>();
    for (const d of diarios ?? []) notas.set(d.user_id, [...(notas.get(d.user_id) ?? []), d]);
    const etapas = new Map<string, Record<string, number | null> | null>();
    for (const a of aderencias ?? []) if (!etapas.has(a.user_id)) etapas.set(a.user_id, a.por_etapa);
    const conexao = new Map((conexoes ?? []).map((c) => [c.user_id, c]));

    const esperas = (conversas ?? []).map((c) => esperaDoCliente(c.mensagens, agora)).filter((e): e is number => e !== null);
    const foraDoAr = equipe.filter((p) => conexao.get(p.id)?.status !== 'conectada');
    const sugestoes = comQuemFalar(equipe, notas, etapas);
    // Pelo código do catálogo quando já há detalhe do MEC; senão, pelo texto livre de antes.
    const objecoes = objecoesCodigo?.length
        ? contarObjecoesPorCodigo(objecoesCodigo, pb?.rotulos ?? new Map())
        : contarObjecoes((analises ?? []).map((a) => a.payload));
    const maiorObjecao = objecoes[0]?.total ?? 1;

    const linhas = equipe
        .map((p) => {
            const doVendedor = notas.get(p.id) ?? [];
            const r = doVendedor[0];
            return { p, r, nota: r?.score_geral == null ? null : Math.round(Number(r.score_geral)), variacao: variacaoSemanal(doVendedor) };
        })
        .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));

    const leads = ultimo?.leads_atendidos ?? null;
    const conv = ultimo?.conversoes_confirmadas ?? null;
    const perdidas = ultimo?.oportunidades_perdidas ?? null;
    const sobre = [nomeUnidade, `${equipe.length} vendedores`, ultimo && `relatório de ${diaMes(ultimo.data_ref)}`].filter(Boolean).join(' · ');

    // Conversões: a seta compara o número absoluto com o dia anterior; a taxa
    // (% dos leads) é outra informação e vai na legenda, não dentro da seta.
    const anteriorConv = anterior?.conversoes_confirmadas == null ? null : Number(anterior.conversoes_confirmadas);
    const deltaConv = conv !== null && anteriorConv !== null ? conv - anteriorConv : null;
    const taxaConv = conv !== null && leads ? `${((conv / leads) * 100).toFixed(1).replace('.', ',')}% dos leads` : null;
    const legendaConv = taxaConv ?? (conv !== null && deltaConv === null ? 'sem dia anterior para comparar' : undefined);
    const anteriorPerdidas = anterior?.oportunidades_perdidas == null ? null : Number(anterior.oportunidades_perdidas);
    const deltaPerdidas = perdidas !== null && anteriorPerdidas !== null ? perdidas - anteriorPerdidas : null;

    // Número nunca vem solto (constraint global): quando a comparação/legenda
    // natural do Kpi ficaria vazia mas o valor é um número real, cai numa
    // legenda de ausência em vez de deixar o número sozinho.
    const legendaNota = [deltaNota !== null && `${setaDoTom(tomDelta(deltaNota, 'maior'))} ${Math.abs(deltaNota)}`, rede?.score_geral != null && `rede: ${Math.round(Number(rede.score_geral))}`].filter(Boolean).join(' · ');
    const legendaLeads = leads !== null && equipe.length ? `${Math.round(leads / equipe.length)} por vendedor` : undefined;

    return (
        <Pagina>
            <CabecalhoPagina voltar={voltar} sobre={sobre} titulo={titulo} />

            {(foraDoAr.length > 0 || esperas.length > 0 || !!pendentes) && (
                <section aria-label="Alertas" className="grid gap-4 lg:grid-cols-3">
                    {foraDoAr.length > 0 && (
                        <Alerta tom="risco" icone="wifi_off"
                                titulo={foraDoAr.length === 1 ? `WhatsApp de ${foraDoAr[0].nome.split(' ')[0]} fora do ar` : `${foraDoAr.length} números fora do ar`}>
                            Nada é capturado enquanto o número estiver desconectado.
                        </Alerta>
                    )}
                    {esperas.length > 0 && (
                        <Alerta tom="atencao" icone="relogio" titulo={`${esperas.length} clientes esperando`}
                                acao={{ href: '/conversas', rotulo: 'Ver lista' }}>
                            {esperas.filter((e) => e > DUAS_HORAS).length} deles há mais de 2 horas
                        </Alerta>
                    )}
                    {!!pendentes && (
                        <Alerta tom="azul" icone="cadastro" titulo={`${pendentes} cadastro${pendentes === 1 ? '' : 's'} aguardando`}
                                acao={{ href: '/aprovacoes', rotulo: 'Aprovar' }} />
                    )}
                </section>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                <Kpi heroi rotulo="Nota da equipe" valor={notaEquipe ?? '—'}
                     legenda={legendaNota || (notaEquipe !== null ? 'sem dia anterior para comparar' : undefined)} />
                <Kpi rotulo="Leads atendidos" valor={leads ?? '—'}
                     legenda={legendaLeads ?? (leads !== null ? 'sem dia anterior para comparar' : undefined)} />
                <Kpi rotulo="Conversões" valor={conv ?? '—'}
                     comparacao={deltaConv !== null ? <Comparacao delta={deltaConv}>{`${Math.abs(deltaConv)} vs. o dia anterior`}</Comparacao> : undefined}
                     legenda={legendaConv} />
                <Kpi rotulo="Perdidas" valor={perdidas ?? '—'}
                     comparacao={deltaPerdidas !== null ? <Comparacao delta={deltaPerdidas} melhorQuando="menor">vs. o dia anterior</Comparacao> : undefined}
                     legenda={perdidas !== null && deltaPerdidas === null ? 'sem dia anterior para comparar' : undefined} />
                <Kpi rotulo="Resposta média" valor={minutos(ultimo?.tempo_medio_resposta_s) ?? '—'} unidade={ultimo?.tempo_medio_resposta_s == null ? undefined : ' min'} legenda="média ponderada por leads" />
            </section>

            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                <div className="lg:col-span-8 2xl:col-span-9">
                    <Tabela titulo="Vendedores" acao={<span className="text-[12.5px] text-tinta-3">ordenado por nota</span>}
                            vazio="Nenhum vendedor ativo neste escopo."
                            colunas={['Vendedor', 'Nota', 'Leads', 'Conv.', 'Resp.', '7 dias', 'Conexão']}
                            grade="minmax(0,2fr) minmax(0,1.6fr) repeat(3,minmax(0,0.7fr)) minmax(0,0.8fr) minmax(0,1.1fr)"
                            linhas={linhas.map(({ p, r, nota, variacao }) => {
                                const cx = conexao.get(p.id);
                                const ligado = cx?.status === 'conectada';
                                const resp = minutos(r?.tempo_medio_resposta_s);
                                const respTom = resp === null ? null : tomResposta(resp);
                                const atrasado = r && ultimo && r.data_ref !== ultimo.data_ref;
                                const seloConexao = <Selo tom={ligado ? 'bom' : 'risco'} ponto>{ligado ? 'Conectado' : 'Fora do ar'}</Selo>;
                                return {
                                    chave: p.id,
                                    href: `/equipe/${p.id}`,
                                    atenuada: !r,
                                    celulas: [
                                        <span key="v" className="flex items-center gap-2.5">
                                            <Avatar nome={p.nome} tamanho={32} />
                                            <span className="flex min-w-0 flex-col">
                                                <span className="truncate font-semibold">{p.nome}</span>
                                                {multiplas && <span className="truncate text-xs font-normal text-tinta-3">{lojaDoVendedor.get(p.id) ?? '—'}</span>}
                                            </span>
                                        </span>,
                                        nota === null
                                            ? <span key="n" className="text-[12.5px] italic">{r ? 'sem nota' : 'sem dado'}</span>
                                            : <span key="n" className="flex items-center gap-2.5"><span className="display num w-7 text-base font-bold">{nota}</span><span className="grow"><Barra pct={nota} tom={tomFaixa(nota, 50, 65)} rotulo={`Nota de ${p.nome}`} /></span>{atrasado && <span className="text-[11px] text-atencao-texto">{diaMes(r.data_ref)}</span>}</span>,
                                        <span key="l" className="num">{r?.leads_atendidos ?? '—'}</span>,
                                        <span key="c" className="num">{r?.conversoes_confirmadas ?? '—'}</span>,
                                        <span key="r" className={`num ${respTom === 'atencao' ? 'font-semibold text-atencao-texto' : ''}`}>
                                            {resp === null ? '—' : `${resp} min`}
                                            {respTom === 'atencao' && <span className="text-[11px] text-atencao-texto"> · lenta</span>}
                                        </span>,
                                        variacao === null ? <span key="t">—</span> : <span key="t" className={`font-semibold ${TEXTO[tomDelta(variacao, 'maior')]}`}>{setaDoTom(tomDelta(variacao, 'maior'))} {Math.abs(variacao)}</span>,
                                        <span key="x">{seloConexao}</span>,
                                    ],
                                    resumo: (
                                        <span className="flex items-center gap-3">
                                            <Avatar nome={p.nome} tamanho={32} />
                                            <span className="flex min-w-0 grow flex-col"><span className="truncate text-sm font-semibold">{p.nome}</span>
                                                {multiplas && <span className="truncate text-xs text-tinta-3">{lojaDoVendedor.get(p.id) ?? '—'}</span>}
                                                <span className="text-xs text-tinta-3">{nota === null ? 'sem nota' : `nota ${nota}`}{variacao !== null && ` · ${setaDoTom(tomDelta(variacao, 'maior'))} ${Math.abs(variacao)} na semana`}</span></span>
                                            {seloConexao}
                                        </span>
                                    ),
                                };
                            })} />
                </div>

                <aside className="flex flex-col gap-4 lg:col-span-4 2xl:col-span-3">
                    <Cartao className="flex flex-col gap-3.5">
                        <div>
                            <h2 className="display text-lg font-bold">Com quem falar hoje</h2>
                            <p className="mt-1 text-[12.5px] text-tinta-3">Quem mais caiu na semana, e o porquê.</p>
                        </div>
                        {sugestoes.length === 0 ? (
                            <p className="text-[13px] text-tinta-2">Ninguém caiu na semana. Bom sinal.</p>
                        ) : sugestoes.map((s) => (
                            <div key={s.pessoa.id} className="flex flex-col gap-1.5 rounded-[10px] bg-fundo p-3.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-bold">{s.pessoa.nome}</span>
                                        {multiplas && <span className="truncate text-xs font-normal text-tinta-3">{lojaDoVendedor.get(s.pessoa.id) ?? '—'}</span>}
                                    </span>
                                    <span className="shrink-0 text-[12.5px] font-bold text-risco-texto">▼ {Math.abs(s.queda)} na semana</span>
                                </div>
                                <p className="text-[13px] leading-relaxed text-tinta-2">
                                    {s.etapaFraca ? `${s.etapaFraca.nome} em ${s.etapaFraca.pct}% no último relatório do MEC.` : 'Nota caindo sem uma etapa do MEC abaixo das outras.'}
                                </p>
                                <Link href={`/equipe/${s.pessoa.id}` as Route} className="flex min-h-11 items-center text-[13px] font-semibold text-azul">Abrir {s.pessoa.nome.split(' ')[0]} →</Link>
                            </div>
                        ))}
                    </Cartao>

                    <Cartao className="flex flex-col gap-3">
                        <h2 className="display text-lg font-bold">Objeções da semana</h2>
                        {objecoes.length === 0 ? (
                            <p className="text-[13px] text-tinta-3">Nenhuma objeção registrada nos últimos 7 dias.</p>
                        ) : objecoes.map((o) => (
                            <div key={o.objecao} className="grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-2.5 text-[13px]">
                                <span className="truncate">{o.objecao}</span>
                                <Barra pct={(o.total / maiorObjecao) * 100} rotulo={o.objecao} />
                                <span className="display num text-right text-sm font-bold">{o.total}</span>
                            </div>
                        ))}
                    </Cartao>
                </aside>
            </div>
        </Pagina>
    );
}
