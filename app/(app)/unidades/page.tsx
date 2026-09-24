import { Alerta, CabecalhoPagina, Cartao, GraficoLinhas, Numero, Pagina, Segmentado, Selo, Shell, Sparkline, Tabela, TEXTO } from '@/components/ui';
import { contextoApp, dataCurta, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { destaquesDaRede, diaMenos, serieSemanal, variacaoDoPeriodo } from '@/lib/derivacoes';
import { setaDoTom, tomDelta, tomResposta, type Sentido } from '@/lib/visual';

export const dynamic = 'force-dynamic';

type LinhaUnidade = {
    unidade_id: string; data_ref: string; score_geral: number | null; vendedores_ativos: number;
    leads_atendidos: number; conversoes_confirmadas: number; tempo_medio_resposta_s: number | null;
};

const INDICADORES: Record<string, { rotulo: string; valor: (l: LinhaUnidade) => number | null; melhorQuando: Sentido; formato: (n: number) => string }> = {
    nota: { rotulo: 'Nota', valor: (l) => l.score_geral, melhorQuando: 'maior', formato: (n) => String(Math.round(n)) },
    conversao: { rotulo: 'Conversões', valor: (l) => l.conversoes_confirmadas, melhorQuando: 'maior', formato: (n) => `${Math.round(n)}/dia` },
    resposta: { rotulo: 'Resposta', valor: (l) => (l.tempo_medio_resposta_s == null ? null : l.tempo_medio_resposta_s / 60), melhorQuando: 'menor', formato: (n) => `${Math.round(n)} min` },
};
const JANELA = 30;
const mesCurto = (d: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)).replace('.', '');

export default async function RedePage({ searchParams }: { searchParams: Promise<{ indicador?: string }> }) {
    const { indicador: pedido } = await searchParams;
    const chave = pedido && pedido in INDICADORES ? pedido : 'nota';
    const ind = INDICADORES[chave];
    const { supabase, perfil } = await contextoApp();
    const hoje = dataHoje();

    const [{ data: rede }, { data: unidades }, linhas, { data: pessoas }, { data: conexoes }, { data: gestores }] = await Promise.all([
        supabase.from('relatorios_rede').select('data_ref,score_geral,vendedores_ativos').gte('data_ref', diaMenos(hoje, 2 * JANELA + 1))
            .order('data_ref', { ascending: false }).returns<{ data_ref: string; score_geral: number | null; vendedores_ativos: number }[]>(),
        supabase.from('unidades').select('id,nome,cidade,uf').eq('ativa', true).order('nome')
            .returns<{ id: string; nome: string; cidade: string | null; uf: string | null }[]>(),
        // 12 semanas de todas as lojas passa do corte de 1000 linhas do PostgREST.
        // Ordem estável (data + loja) para as páginas não se sobreporem.
        paginar<LinhaUnidade>((de, ate) => supabase.from('relatorios_unidade')
            .select('unidade_id,data_ref,score_geral,vendedores_ativos,leads_atendidos,conversoes_confirmadas,tempo_medio_resposta_s')
            .gte('data_ref', diaMenos(hoje, 7 * 12 + 1)).order('data_ref').order('unidade_id').range(de, ate)),
        supabase.from('profiles').select('id,nome,role,unidade_id').eq('status', 'ativo')
            .returns<{ id: string; nome: string; role: string; unidade_id: string | null }[]>(),
        supabase.from('vw_conexoes_status').select('user_id,unidade_id,status,ultimo_evento_em')
            .returns<{ user_id: string; unidade_id: string; status: string; ultimo_evento_em: string | null }[]>(),
        // Um gestor pode cuidar de mais de uma loja: quem tem gestor vem daqui,
        // não de profiles.unidade_id (que é só a loja "de origem" dele).
        supabase.from('gestor_unidades').select('unidade_id,gestor_id').returns<{ unidade_id: string; gestor_id: string }[]>(),
    ]);

    const lojas = unidades ?? [];
    const todas = linhas ?? [];
    const serieRede = rede ?? [];
    const atual = serieRede[0] ?? null;
    const fim = todas.at(-1)?.data_ref ?? hoje;
    const nomeDe = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
    const gestorAtivoDe = new Map((pessoas ?? []).filter((p) => p.role === 'gestor').map((p) => [p.id, p.nome]));
    const gestorDe = new Map<string, string>();
    for (const g of gestores ?? []) {
        const nome = gestorAtivoDe.get(g.gestor_id);
        if (!nome) continue;
        const existente = gestorDe.get(g.unidade_id);
        gestorDe.set(g.unidade_id, existente ? `${existente}, ${nome}` : nome);
    }
    const lojaDe = new Map(lojas.map((u) => [u.id, u.nome]));

    const { variacoes, subiu, caiu, semGestor } = destaquesDaRede(lojas, todas, ind.valor, ind.melhorQuando, fim, JANELA, new Set(gestorDe.keys()));
    const ultimaDe = new Map<string, LinhaUnidade>();
    for (const l of todas) ultimaDe.set(l.unidade_id, l);
    const ranking = lojas
        .map((u) => ({ u, l: ultimaDe.get(u.id) }))
        .sort((a, b) => Number(b.l?.score_geral ?? -1) - Number(a.l?.score_geral ?? -1));

    const variacaoRede = atual ? variacaoDoPeriodo(serieRede, (r) => r.score_geral, atual.data_ref, JANELA) : null;
    const temNota = atual?.score_geral != null;
    // Vendedor desativado ou loja fechada não conta aqui: inflaria "fora do
    // ar" com gente que já saiu e apareceria como "Vendedor · " sem nome.
    const idsAtivos = new Set((pessoas ?? []).map((p) => p.id));
    const cx = (conexoes ?? []).filter((c) => idsAtivos.has(c.user_id) && lojaDe.has(c.unidade_id));
    const conectadas = cx.filter((c) => c.status === 'conectada').length;
    const fora = cx.filter((c) => c.status !== 'conectada');

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/unidades">
            <Pagina>
                <CabecalhoPagina titulo="A rede"
                                 sobre={[`${lojas.length} lojas`, atual && `${atual.vendedores_ativos} vendedores com movimento`, atual && `relatório de ${dataCurta(`${atual.data_ref}T12:00:00-03:00`)}`].filter(Boolean).join(' · ')}
                                 acoes={<Segmentado rotulo="Indicador" base="/unidades" param="indicador" atual={chave}
                                                    opcoes={Object.entries(INDICADORES).map(([valor, i]) => ({ valor, rotulo: i.rotulo }))} />} />

                <div className="grid gap-5 lg:grid-cols-12">
                    <Cartao variante="heroi" className="flex flex-col gap-3 lg:col-span-4">
                        <span className="text-[13px] text-white/75">{atual ? `Nota da rede · ${dataCurta(`${atual.data_ref}T12:00:00-03:00`)}` : 'Nota da rede'}</span>
                        <span className="flex items-baseline gap-3">
                            <Numero valor={atual?.score_geral == null ? '—' : Math.round(Number(atual.score_geral))} tamanho="xl" />
                            {temNota && variacaoRede !== null && (
                                <span className="rounded-full bg-white/12 px-2.5 py-1 text-[13px] font-semibold">
                                    {setaDoTom(tomDelta(Math.round(variacaoRede), 'maior'))} {Math.abs(Math.round(variacaoRede))}
                                </span>
                            )}
                        </span>
                        {temNota && (
                            <span className="text-[13px] text-white/75">
                                {variacaoRede !== null ? `média de ${JANELA} dias vs. os ${JANELA} anteriores` : `sem ${JANELA} dias anteriores para comparar`}
                            </span>
                        )}
                        <Sparkline invertida rotulo="Nota da rede nos últimos 60 dias" valores={[...serieRede].reverse().map((r) => (r.score_geral == null ? null : Number(r.score_geral)))} />
                    </Cartao>

                    <Cartao className="flex flex-col gap-3 lg:col-span-8">
                        <h2 className="display text-lg font-bold">{ind.rotulo} por loja, últimas 12 semanas</h2>
                        <GraficoLinhas rotulo={`${ind.rotulo} por loja nas últimas 12 semanas`} formato={ind.formato}
                                       rotulosX={[mesCurto(diaMenos(fim, 7 * 12)), mesCurto(fim)]}
                                       series={lojas.map((u) => ({
                                           id: u.id, nome: u.nome,
                                           valores: serieSemanal(todas.filter((l) => l.unidade_id === u.id), ind.valor, fim, 12),
                                           destaque: u.id === subiu?.id ? 'azul' : u.id === caiu?.id ? 'risco' : undefined,
                                       }))} />
                        <p className="text-[12.5px] text-tinta-3">Em destaque, a loja que mais melhorou e a que mais piorou em {JANELA} dias. As outras ficam em cinza.</p>
                    </Cartao>
                </div>

                <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                    <div className="lg:col-span-8">
                        <Tabela titulo="Ranking das lojas" acao={<span className="text-[12.5px] text-tinta-3">clique para abrir a loja</span>}
                                vazio="Nenhuma loja ativa."
                                colunas={['#', 'Loja', 'Gestor', 'Nota', 'Vend.', 'Leads', 'Conv.', 'Resp.', `${JANELA} dias`]}
                                grade="28px minmax(0,1.6fr) minmax(0,1.5fr) repeat(5,minmax(0,0.7fr)) minmax(0,0.8fr)"
                                linhas={ranking.map(({ u, l }, i) => {
                                    const v = variacoes.get(u.id) ?? null;
                                    const tom = tomDelta(v === null ? null : Math.round(v), ind.melhorQuando);
                                    const nota = l?.score_geral == null ? null : Math.round(Number(l.score_geral));
                                    const resp = l?.tempo_medio_resposta_s == null ? null : Math.round(Number(l.tempo_medio_resposta_s) / 60);
                                    const respTom = resp === null ? null : tomResposta(resp);
                                    const gestor = gestorDe.get(u.id);
                                    const variacao = v === null ? <span key="v">—</span> : <span key="v" className={`font-semibold ${TEXTO[tom]}`}>{setaDoTom(tom)} {ind.formato(Math.abs(v))}</span>;
                                    return {
                                        chave: u.id,
                                        href: `/unidades/${u.id}`,
                                        atenuada: !l,
                                        celulas: [
                                            <span key="p" className="display font-bold text-tinta-3">{i + 1}</span>,
                                            <span key="n" className="font-semibold">{u.nome}</span>,
                                            gestor ? <span key="g" className="text-tinta-2">{gestor}</span> : <Selo key="g" tom="atencao">sem gestor</Selo>,
                                            <span key="s" className="display num text-base font-bold">{nota ?? '—'}</span>,
                                            <span key="d" className="num">{l?.vendedores_ativos ?? '—'}</span>,
                                            <span key="l" className="num">{l?.leads_atendidos ?? '—'}</span>,
                                            <span key="c" className="num">{l?.conversoes_confirmadas ?? '—'}</span>,
                                            <span key="r" className={`num ${respTom === 'atencao' ? 'font-semibold text-atencao-texto' : ''}`}>
                                                {resp === null ? '—' : `${resp} min`}
                                                {respTom === 'atencao' && <span className="text-[11px] text-atencao-texto"> · lenta</span>}
                                            </span>,
                                            variacao,
                                        ],
                                        resumo: (
                                            <span className="flex items-center gap-3">
                                                <span className="display w-5 font-bold text-tinta-3">{i + 1}</span>
                                                <span className="flex min-w-0 grow flex-col"><span className="truncate text-sm font-semibold">{u.nome}</span>
                                                    <span className="text-xs text-tinta-3">{gestor ?? 'sem gestor'} · nota {nota ?? '—'}</span></span>
                                                {variacao}
                                            </span>
                                        ),
                                    };
                                })} />
                    </div>

                    <aside className="flex flex-col gap-5 lg:col-span-4">
                        <Cartao className="flex flex-col gap-3">
                            <h2 className="display text-lg font-bold">Onde você precisa entrar</h2>
                            {!caiu && semGestor.length === 0 && <p className="text-[13px] text-tinta-2">Nenhuma loja pedindo atenção agora.</p>}
                            {caiu && (
                                <Alerta tom="risco" icone="tendencia" titulo={`${caiu.nome}: ${ind.rotulo.toLowerCase()} ${setaDoTom('risco')} ${ind.formato(Math.abs(caiu.variacao))}`}
                                        acao={{ href: `/unidades/${caiu.id}`, rotulo: 'Abrir' }}>
                                    A maior piora da rede nos últimos {JANELA} dias.
                                </Alerta>
                            )}
                            {semGestor.map((u) => (
                                <Alerta key={u.id} tom="atencao" icone="equipe" titulo={`${u.nome} sem gestor`} acao={{ href: `/unidades/${u.id}`, rotulo: 'Abrir' }}>
                                    Ninguém da loja aprova cadastro nem olha os alertas de lá.
                                </Alerta>
                            ))}
                        </Cartao>

                        <Cartao className="flex flex-col gap-3">
                            <div className="flex items-baseline justify-between">
                                <h2 className="display text-lg font-bold">Conexões</h2>
                                <Numero valor={conectadas} unidade={`/${cx.length}`} tamanho="md" />
                            </div>
                            <div className="flex h-2 overflow-hidden rounded-full bg-linha-2" role="img" aria-label={`${conectadas} de ${cx.length} números conectados`}>
                                <span className="bg-azul" style={{ width: `${cx.length ? (conectadas / cx.length) * 100 : 0}%` }} />
                                <span className="bg-risco" style={{ width: `${cx.length ? (fora.length / cx.length) * 100 : 0}%` }} />
                            </div>
                            {cx.length === 0 ? (
                                <p className="text-[13px] text-tinta-3">Nenhum número conectado à rede ainda.</p>
                            ) : fora.length === 0 ? (
                                <p className="text-[13px] text-tinta-2">Todos os números conectados.</p>
                            ) : fora.slice(0, 6).map((c) => (
                                <div key={c.user_id} className="flex items-center justify-between gap-2 border-t border-linha-2 pt-2 text-[13px]">
                                    <span className="min-w-0 truncate">
                                        <strong>{nomeDe.get(c.user_id) ?? 'Vendedor'}</strong>
                                        {lojaDe.get(c.unidade_id) && <span className="text-tinta-3"> · {lojaDe.get(c.unidade_id)}</span>}
                                    </span>
                                    <span className="shrink-0 font-semibold text-risco-texto">{c.ultimo_evento_em ? `desde ${dataCurta(c.ultimo_evento_em)}` : 'nunca conectou'}</span>
                                </div>
                            ))}
                        </Cartao>
                    </aside>
                </div>
            </Pagina>
        </Shell>
    );
}
