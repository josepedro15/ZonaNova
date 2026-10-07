import Link from 'next/link';
import type { Route } from 'next';
import AppShell from '@/components/app-shell';
import { contextoApp, horaCurta } from '@/lib/contexto-app';
import { telefoneBonito } from '@/lib/painel';
import { NAO_ANALISADA, passaNoFiltro, STATUS_CONVERSA, TIPO_CONVERSA } from '@/lib/visual';

/** A lista mostra no máximo isto, das mais recentes que batem com a busca e os filtros. */
const JANELA = 100;

export const dynamic = 'force-dynamic';

export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; status?: string }> }) {
    const { supabase, perfil } = await contextoApp();
    const params = await searchParams;
    const filtro = {
        tipo: params.tipo && params.tipo in TIPO_CONVERSA ? params.tipo : undefined,
        status: params.status && (params.status in STATUS_CONVERSA || params.status === NAO_ANALISADA) ? params.status : undefined,
    };
    // Tipo e situação filtram no banco, antes do corte: "teve uma análise com
    // esse tipo/situação" (inner join), e `passaNoFiltro` confere depois que é
    // a mais recente. "Não analisada" é o anti-join: conversa sem análise.
    const naoAnalisada = filtro.status === NAO_ANALISADA;
    const embed = naoAnalisada ? ',analises_conversa(id)' : filtro.tipo || filtro.status ? ',analises_conversa!inner(id)' : '';
    let consulta = supabase.from('conversas')
        .select(`id,user_id,cliente_nome,cliente_telefone,ultima_mensagem_em,total_mensagens,profiles!conversas_user_id_fkey(nome)${embed}` as string)
        .eq('bloqueada', false)
        .order('ultima_mensagem_em', { ascending: false }).limit(JANELA);
    if (naoAnalisada) consulta = consulta.is('analises_conversa', null);
    else {
        if (filtro.tipo) consulta = consulta.eq('analises_conversa.tipo_conversa', filtro.tipo);
        if (filtro.status) consulta = consulta.eq('analises_conversa.status', filtro.status);
    }
    // Só letras, dígitos, espaço e . @ + -: parêntese, vírgula e aspas têm
    // significado na sintaxe do `.or()` do PostgREST e quebravam a consulta.
    const termo = (params.q ?? '').replace(/[^\p{L}\p{N} .@+-]/gu, '').trim().slice(0, 60);
    // O telefone é gravado só com dígitos: "(54) 9981" procura por "549981".
    // Só quando o termo é um número: "Loja 2" viraria telefone contendo "2",
    // que é quase todo mundo.
    const digitos = termo.replace(/\D/g, '');
    const ehNumero = !/\p{L}/u.test(termo) && digitos.length >= 3;
    if (termo) consulta = consulta.or([`cliente_nome.ilike.%${termo}%`, ...(ehNumero ? [`cliente_telefone.ilike.%${digitos}%`] : [])].join(','));
    const { data: conversas } = await consulta.returns<{
        id: string; user_id: string; cliente_nome: string | null; cliente_telefone: string;
        ultima_mensagem_em: string; total_mensagens: number; profiles: { nome: string } | null;
    }[]>();
    const ids = (conversas ?? []).map((c) => c.id as string);
    const { data: analises } = ids.length ? await supabase.from('analises_conversa')
        .select('conversa_id,data_ref,tipo_conversa,status,score_atendimento,score_risco,payload')
        .in('conversa_id', ids).order('data_ref', { ascending: false }) : { data: [] };
    const ultima = new Map<string, Record<string, unknown>>();
    for (const a of analises ?? []) if (!ultima.has(a.conversa_id as string)) ultima.set(a.conversa_id as string, a as Record<string, unknown>);
    const filtradas = (conversas ?? []).filter((c) => passaNoFiltro(ultima.get(c.id as string), filtro));
    // Bateu no corte: há mais conversas que estas, e a tela diz.
    const cortou = (conversas ?? []).length === JANELA;
    const campo = 'min-h-11 rounded-[10px] border border-linha-campo bg-superficie px-3 text-sm';

    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/conversas">
            <div className="mx-auto max-w-[1120px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
                <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="display text-[30px] font-semibold">Conversas</h1><p className="mt-1 text-sm text-tinta-2">{filtradas.length} encontradas no seu escopo{cortou && ` · só as ${JANELA} mais recentes; refine a busca para ver outras`}</p></div></div>
                <form className="mt-6 flex flex-wrap gap-2"><input name="q" defaultValue={params.q} placeholder="Buscar por nome ou telefone" className="min-h-11 min-w-[240px] flex-1 rounded-[10px] border border-linha-campo bg-superficie px-3.5 text-sm outline-none focus:border-petroleo"/><select name="tipo" aria-label="Tipo de conversa" defaultValue={filtro.tipo ?? ''} className={campo}><option value="">Todos os tipos</option>{Object.entries(TIPO_CONVERSA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select><select name="status" aria-label="Situação da conversa" defaultValue={filtro.status ?? ''} className={campo}><option value="">Todas as situações</option>{Object.entries(STATUS_CONVERSA).map(([v, { rotulo }]) => <option key={v} value={v}>{rotulo}</option>)}<option value={NAO_ANALISADA}>Não analisada</option></select><button className="rounded-[10px] bg-petroleo px-5 text-sm font-semibold text-papel">Filtrar</button></form>
                <div className="mt-5 overflow-hidden rounded-card border border-linha bg-superficie">
                    {filtradas.length > 0 && (
                        <div className="hidden border-b border-linha px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-tinta-3 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_120px_70px]">
                            <span>Cliente</span><span>Tipo</span><span>Situação</span><span className="text-right">Nota</span>
                        </div>
                    )}
                    {filtradas.map((c) => { const a = ultima.get(c.id as string); const vendedor = c.profiles as unknown as { nome: string } | null; return (
                        <Link key={c.id as string} href={`/conversas/${c.id}` as Route} className="grid gap-2 border-b border-linha px-4 py-4 last:border-0 hover:bg-papel-2 sm:grid-cols-[minmax(0,1fr)_120px_120px_70px] sm:items-center">
                            <div className="min-w-0"><p className="text-sm font-semibold">{c.cliente_nome || telefoneBonito(c.cliente_telefone as string)}</p><p className="mt-0.5 text-[11.5px] text-tinta-3">{vendedor?.nome && perfil.role !== 'vendedor' ? `${vendedor.nome} · ` : ''}{c.total_mensagens} mensagens</p>{typeof (a?.payload as { destaque?: unknown } | undefined)?.destaque === 'string' && <p className="mt-1 truncate text-xs text-tinta-2">{(a!.payload as { destaque: string }).destaque}</p>}</div>
                            <span className="text-xs text-tinta-2">{a ? TIPO_CONVERSA[a.tipo_conversa as string] ?? '—' : 'Não analisada'}</span><span className="text-xs text-tinta-2">{STATUS_CONVERSA[a?.status as string]?.rotulo ?? '—'}</span><div className="text-right"><span className="display text-lg font-semibold">{a?.score_atendimento == null ? '—' : String(a.score_atendimento)}</span><p className="text-[10px] text-tinta-3">{horaCurta(c.ultima_mensagem_em as string)}</p></div>
                        </Link>
                    ); })}
                    {!filtradas.length && <p className="p-8 text-center text-sm text-tinta-3">Nenhuma conversa encontrada.</p>}
                </div>
            </div>
        </AppShell>
    );
}
