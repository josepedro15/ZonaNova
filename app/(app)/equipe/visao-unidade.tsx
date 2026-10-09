import Link from 'next/link';
import type { Route } from 'next';
import {
    Alerta, Avatar, Barra, CabecalhoPagina, Cartao, Comparacao, Kpi, Pagina, Selo, Tabela, TempoEspera, TEXTO,
} from '@/components/ui';
import { dataHoje, type contextoApp } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { esperaNaLista, juntarPorDia, marcadaDepoisDoCliente, telefoneBonito, type LinhaDia, type Msg } from '@/lib/painel';
import { comQuemFalar, contarObjecoes, diaMenos, diasDeVenda, variacaoSemanal, type NotaDia } from '@/lib/derivacoes';
import { falaCurta, setaDoTom, tomDelta, tomFaixa, tomResposta } from '@/lib/visual';
import { contarObjecoesPorCodigo, juntarObjecoes } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';
import { ObjecoesDaSemana } from './objecoes-da-semana';
import { horaBrasilia, dataCurtaBrasilia, inicioDoDia } from '../dashboard/formato';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];
type Espera = { id: string; user_id: string; cliente_nome: string | null; cliente_telefone: string; espera: number };
type Diario = NotaDia & { user_id: string; leads_atendidos: number; conversoes_confirmadas: number; tempo_medio_resposta_s: number | null; captura_incompleta: boolean | null };
type ConexaoDaEquipe = { user_id: string; status: string; ultimo_evento_em: string | null; silencio_desde: string | null };

/** "desde 10h56" hoje; "desde 7 de out." quando começou antes. */
const desdeQuando = (iso: string, agora: Date) => (Date.parse(iso) >= inicioDoDia(agora).getTime() ? horaBrasilia(iso) : dataCurtaBrasilia(iso));

const DUAS_HORAS = 2 * 60 * 60 * 1000;
/** A fila da equipe na tela: uma lista maior que isso ninguém percorre. */
const MAX_FILA = 50;
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const minutos = (s: number | string | null | undefined) => (s == null ? null : Math.round(Number(s) / 60));

/**
 * A última fala do cliente em cada conversa da fila, para o gestor saber do
 * que se trata sem abrir uma por uma. Uma consulta só, paginada.
 */
async function ultimasFalas(supabase: Supabase, ids: string[], desde: string): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const falas = await paginar<{ conversa_id: string; tipo: string; conteudo: string | null; enviada_em: string }>((de, ate) =>
        supabase.from('mensagens').select('conversa_id,tipo,conteudo,enviada_em').in('conversa_id', ids)
            .eq('direcao', 'entrada').gte('enviada_em', desde).order('enviada_em', { ascending: false }).range(de, ate));
    const ultima = new Map<string, string>();
    // Mais recente primeiro: a primeira de cada conversa é a última fala dela.
    for (const m of falas) if (!ultima.has(m.conversa_id)) ultima.set(m.conversa_id, falaCurta(m, 80));
    return ultima;
}

/**
 * A equipe de uma loja (ou várias): serve o gestor (`/equipe`, a loja dele
 * via `gestor_unidades`) e o supervisor (`/unidades/[id]`, uma loja
 * só). `unidadeIds` null é o escopo inteiro que a RLS deixa ver — o
 * comportamento de antes para supervisor e admin em /equipe.
 */
export async function VisaoUnidade({ supabase, unidadeIds, nomeUnidade, titulo, voltar }: {
    supabase: Supabase; unidadeIds: string[] | null; nomeUnidade: string; titulo: string; voltar?: { href: Route; rotulo: string };
}) {
    const hoje = dataHoje();
    const agora = new Date();
    // Sete dias, a mesma janela do "Esperando você" do vendedor (dashboard).
    const janela = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let qPessoas = supabase.from('profiles').select('id,nome,unidade_id,unidades!profiles_unidade_id_fkey(nome)').eq('role', 'vendedor').eq('status', 'ativo').order('nome');
    let qDiarios = supabase.from('relatorios_diarios').select('user_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,tempo_medio_resposta_s,captura_incompleta')
        .gte('data_ref', diaMenos(hoje, 15)).order('data_ref', { ascending: false }).limit(1000);
    let qConexoes = supabase.from('vw_conexoes_status').select('user_id,status,ultimo_evento_em,silencio_desde');
    let qPendentes = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    let qUnidade = supabase.from('relatorios_unidade')
        .select('unidade_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta')
        .order('data_ref', { ascending: false }).limit(60);
    let qAderencia = supabase.from('aderencia_diaria').select('user_id,data_ref,por_etapa').gte('data_ref', diaMenos(hoje, 7)).order('data_ref', { ascending: false });
    // A fila da equipe (pedido do piloto, 07/10/2026): a mesma regra e a mesma
    // janela de sete dias do "Esperando você" de cada vendedor. A
    // mensagens(...) embutida também é filtrada pela janela — sem isso, cada
    // conversa ativa trazia o histórico inteiro — e só com as três colunas da
    // conta; o texto da última fala vem depois, só de quem está esperando.
    // Acima de 500 conversas ativas na semana, a fila fica aproximada (só as
    // 500 mais recentes entram na conta).
    let qConversas = supabase.from('conversas').select('id,user_id,cliente_nome,cliente_telefone,dispensada_em,fechada_presencial_em,mensagens(direcao,automatica,enviada_em)')
        .gte('ultima_mensagem_em', janela).gte('mensagens.enviada_em', janela).eq('bloqueada', false)
        .order('ultima_mensagem_em', { ascending: false }).limit(500);
    if (unidadeIds) {
        qPessoas = qPessoas.in('unidade_id', unidadeIds);
        qDiarios = qDiarios.in('unidade_id', unidadeIds);
        qConexoes = qConexoes.in('unidade_id', unidadeIds);
        qPendentes = qPendentes.in('unidade_id', unidadeIds);
        qUnidade = qUnidade.in('unidade_id', unidadeIds);
        qAderencia = qAderencia.in('unidade_id', unidadeIds);
        qConversas = qConversas.in('unidade_id', unidadeIds);
    }
    // Desvio do brief: o PostgREST corta em 1000 linhas por pedido mesmo com
    // .limit(2000) (mesmo comportamento documentado em lib/paginar.ts), então
    // uma rede inteira com muita objeção na semana perderia linhas em
    // silêncio. Pagina com paginar() em vez de .limit(2000) direto.
    const qAnalises = (de: number, ate: number) => {
        let q = supabase.from('analises_conversa').select('conversa_id,data_ref,user_id,tipo_conversa,payload')
            .eq('tipo_conversa', 'negociacao').gte('data_ref', diaMenos(hoje, 7)).order('id').range(de, ate);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q;
    };
    // Quem é vendedor, ativo ou não (quem saiu na semana ainda conta): as
    // conversas de um gestor com WhatsApp conectado ficam fora das objeções.
    const qVendedores = supabase.from('profiles').select('id').eq('role', 'vendedor');
    const qObjecoes = (de: number, ate: number) => {
        let q = supabase.from('mec_observacoes').select('conversa_id,data_ref,item_chave').eq('sinal', 'objecao')
            .gte('data_ref', diaMenos(hoje, 7)).order('id').range(de, ate);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q;
    };

    const [{ data: pessoas }, { data: diarios }, { data: conexoes }, { count: pendentes }, { data: daUnidade }, { data: rede }, { data: aderencias }, analises, { data: conversas }, objecoesCodigo, pb, { data: vendedores }] = await Promise.all([
        qPessoas.returns<{ id: string; nome: string; unidade_id: string; unidades: { nome: string } | null }[]>(),
        qDiarios.returns<Diario[]>(),
        qConexoes.returns<ConexaoDaEquipe[]>(),
        qPendentes,
        qUnidade.returns<LinhaDia[]>(),
        supabase.from('relatorios_rede').select('data_ref,score_geral').order('data_ref', { ascending: false }).limit(1).maybeSingle<{ data_ref: string; score_geral: number | null }>(),
        qAderencia.returns<{ user_id: string; data_ref: string; por_etapa: Record<string, number | null> | null }[]>(),
        paginar<{ conversa_id: string; data_ref: string; user_id: string; tipo_conversa: string | null; payload: unknown }>(qAnalises),
        qConversas.returns<{ id: string; user_id: string; cliente_nome: string | null; cliente_telefone: string; dispensada_em: string | null; fechada_presencial_em: string | null; mensagens: Msg[] }[]>(),
        paginar<{ conversa_id: string; data_ref: string; item_chave: string | null }>(qObjecoes),
        carregarPlaybook(supabase, null),
        qVendedores.returns<{ id: string }[]>(),
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

    // A mesma regra da lista "Esperando você": o alerta e a fila contam as
    // conversas que os vendedores veem lá, nem uma a mais.
    const esperando: Espera[] = (conversas ?? [])
        .filter((c) => !marcadaDepoisDoCliente(c.mensagens, c.dispensada_em, c.fechada_presencial_em))
        .map((c) => ({ id: c.id, user_id: c.user_id, cliente_nome: c.cliente_nome, cliente_telefone: c.cliente_telefone, espera: esperaNaLista(c.mensagens, agora) }))
        .filter((e): e is Espera => e.espera !== null)
        .sort((a, b) => b.espera - a.espera);
    const esperas = esperando.map((e) => e.espera);
    const ultimaFala = await ultimasFalas(supabase, esperando.slice(0, MAX_FILA).map((e) => e.id), janela);
    const nomeDoVendedor = new Map(equipe.map((p) => [p.id, p.nome]));
    const foraDoAr = equipe.filter((p) => conexao.get(p.id)?.status !== 'conectada');
    // Conectado e em silêncio enquanto a loja conversa (lib/captura.ts): o
    // número está no ar, mas as mensagens não estão chegando.
    const semCaptura = equipe.filter((p) => conexao.get(p.id)?.status === 'conectada' && !!conexao.get(p.id)?.silencio_desde);
    const sugestoes = comQuemFalar(equipe, notas, etapas);
    // Pelo código do catálogo nas conversas que já o têm; nas outras (outras
    // lojas, fora do piloto), pelo texto livre de antes. Uma conversa entra
    // numa lista só, e as duas se somam pelo rótulo.
    // Só negociação dos vendedores da lista: ver `diasDeVenda`.
    const deVenda = diasDeVenda(analises, new Set((vendedores ?? []).map((v) => v.id)));
    const codigoDeVenda = objecoesCodigo.filter((o) => deVenda.has(`${o.conversa_id}|${o.data_ref}`));
    const comCodigo = new Set(codigoDeVenda.map((o) => o.conversa_id));
    const objecoes = juntarObjecoes(
        contarObjecoesPorCodigo(codigoDeVenda, pb?.rotulos ?? new Map(), Infinity),
        contarObjecoes(analises.filter((a) => deVenda.has(`${a.conversa_id}|${a.data_ref}`) && !comCodigo.has(a.conversa_id)).map((a) => a.payload), Infinity),
    );

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

            {(foraDoAr.length > 0 || semCaptura.length > 0 || esperas.length > 0 || !!pendentes) && (
                <section aria-label="Alertas" className="grid gap-4 lg:grid-cols-3">
                    {foraDoAr.length > 0 && (
                        <Alerta tom="risco" icone="wifi_off"
                                titulo={foraDoAr.length === 1 ? `WhatsApp de ${foraDoAr[0].nome.split(' ')[0]} fora do ar` : `${foraDoAr.length} números fora do ar`}>
                            Nada é capturado enquanto o número estiver desconectado.
                        </Alerta>
                    )}
                    {semCaptura.length > 0 && (
                        <Alerta tom="atencao" icone="alerta"
                                titulo={semCaptura.length === 1
                                    ? `${semCaptura[0].nome.split(' ')[0]}: conectado, sem mensagens desde ${desdeQuando(conexao.get(semCaptura[0].id)!.silencio_desde!, agora)}`
                                    : `${semCaptura.length} números conectados sem receber mensagens`}>
                            A loja segue conversando e nada chega deste número. O sistema está tentando recuperar as mensagens; o silêncio não conta contra o vendedor.
                        </Alerta>
                    )}
                    {esperas.length > 0 && (
                        <Alerta tom="atencao" icone="relogio" titulo={`${esperas.length} clientes esperando`}
                                acao={{ href: '#esperando', rotulo: 'Ver lista' }}>
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

            {esperando.length > 0 && (
                <section id="esperando" className="scroll-mt-6">
                    <Tabela titulo="Esperando resposta na equipe"
                            acao={<span className="text-[12.5px] text-tinta-3">{esperando.length > MAX_FILA ? `as ${MAX_FILA} mais antigas de ${esperando.length}` : 'quem espera há mais tempo primeiro'}</span>}
                            vazio="Ninguém esperando resposta agora."
                            colunas={['Cliente', 'Vendedor', 'Esperando', 'Última mensagem do cliente']}
                            grade="minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.6fr) minmax(0,2fr)"
                            linhas={esperando.slice(0, MAX_FILA).map((e) => {
                                const cliente = e.cliente_nome ?? telefoneBonito(e.cliente_telefone);
                                const vendedor = nomeDoVendedor.get(e.user_id) ?? '—';
                                const fala = ultimaFala.get(e.id) ?? '';
                                return {
                                    chave: e.id,
                                    href: `/conversas/${e.id}`,
                                    celulas: [
                                        <span key="c" className="flex min-w-0 items-center gap-2.5"><Avatar nome={e.cliente_nome} tamanho={32} /><span className="truncate font-semibold">{cliente}</span></span>,
                                        <span key="v" className="flex min-w-0 flex-col"><span className="truncate">{vendedor}</span>
                                            {multiplas && <span className="truncate text-xs text-tinta-3">{lojaDoVendedor.get(e.user_id) ?? '—'}</span>}</span>,
                                        <span key="t"><TempoEspera ms={e.espera} /></span>,
                                        <span key="f" className="truncate text-[13px] text-tinta-2">{fala}</span>,
                                    ],
                                    resumo: (
                                        <span className="flex items-center gap-3">
                                            <Avatar nome={e.cliente_nome} tamanho={32} />
                                            <span className="flex min-w-0 grow flex-col">
                                                <span className="truncate text-sm font-semibold">{cliente}</span>
                                                <span className="truncate text-xs text-tinta-3">{vendedor}{fala && ` · ${fala}`}</span>
                                            </span>
                                            <TempoEspera ms={e.espera} />
                                        </span>
                                    ),
                                };
                            })} />
                </section>
            )}

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
                                const mudo = ligado && !!cx?.silencio_desde;
                                const seloConexao = <Selo tom={mudo ? 'atencao' : ligado ? 'bom' : 'risco'} ponto>{mudo ? 'Sem captura' : ligado ? 'Conectado' : 'Fora do ar'}</Selo>;
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
                                            : <span key="n" className="flex items-center gap-2.5"><span className="display num w-7 text-base font-bold">{nota}</span><span className="grow"><Barra pct={nota} tom={tomFaixa(nota, 50, 65)} rotulo={`Nota de ${p.nome}`} /></span>{atrasado && <span className="text-[11px] text-atencao-texto">{diaMes(r.data_ref)}</span>}{r.captura_incompleta && <span className="text-[11px] text-atencao-texto" title="Houve um intervalo sem registro de mensagens neste dia">captura incompleta</span>}</span>,
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

                    <ObjecoesDaSemana objecoes={objecoes} />
                </aside>
            </div>
        </Pagina>
    );
}
