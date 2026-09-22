import Link from 'next/link';
import type { Route } from 'next';
import AppShell from '@/components/app-shell';
import { contextoApp, horaCurta } from '@/lib/contexto-app';
import { telefoneBonito } from '@/lib/painel';

export const dynamic = 'force-dynamic';

export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string }> }) {
    const { supabase, perfil } = await contextoApp();
    const params = await searchParams;
    let consulta = supabase.from('conversas')
        .select('id,user_id,cliente_nome,cliente_telefone,ultima_mensagem_em,total_mensagens,profiles!conversas_user_id_fkey(nome)')
        .eq('bloqueada', false)
        .order('ultima_mensagem_em', { ascending: false }).limit(100);
    if (params.q) consulta = consulta.or(`cliente_nome.ilike.%${params.q.replace(/[%_,]/g, '')}%,cliente_telefone.ilike.%${params.q.replace(/[%_,]/g, '')}%`);
    const { data: conversas } = await consulta;
    const ids = (conversas ?? []).map((c) => c.id as string);
    const { data: analises } = ids.length ? await supabase.from('analises_conversa')
        .select('conversa_id,data_ref,tipo_conversa,status,score_atendimento,score_risco,payload')
        .in('conversa_id', ids).order('data_ref', { ascending: false }) : { data: [] };
    const ultima = new Map<string, Record<string, unknown>>();
    for (const a of analises ?? []) if (!ultima.has(a.conversa_id as string)) ultima.set(a.conversa_id as string, a as Record<string, unknown>);
    const filtradas = (conversas ?? []).filter((c) => !params.tipo || ultima.get(c.id as string)?.tipo_conversa === params.tipo);

    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/conversas">
            <div className="mx-auto max-w-[1120px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
                <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="display text-[30px] font-semibold">Conversas</h1><p className="mt-1 text-sm text-tinta-2">{filtradas.length} encontradas no seu escopo</p></div></div>
                <form className="mt-6 flex flex-wrap gap-2"><input name="q" defaultValue={params.q} placeholder="Buscar por nome ou telefone" className="min-h-11 min-w-[240px] flex-1 rounded-[10px] border border-linha-campo bg-superficie px-3.5 text-sm outline-none focus:border-petroleo"/><select name="tipo" defaultValue={params.tipo ?? ''} className="min-h-11 rounded-[10px] border border-linha-campo bg-superficie px-3 text-sm"><option value="">Todos os tipos</option><option value="negociacao">Negociação</option><option value="suporte">Suporte</option><option value="social">Social</option></select><button className="rounded-[10px] bg-petroleo px-5 text-sm font-semibold text-papel">Filtrar</button></form>
                <div className="mt-5 overflow-hidden rounded-card border border-linha bg-superficie">
                    {filtradas.map((c) => { const a = ultima.get(c.id as string); const vendedor = c.profiles as unknown as { nome: string } | null; return (
                        <Link key={c.id as string} href={`/conversas/${c.id}` as Route} className="grid gap-2 border-b border-linha px-4 py-4 last:border-0 hover:bg-papel-2 sm:grid-cols-[minmax(0,1fr)_140px_90px_70px] sm:items-center">
                            <div><p className="text-sm font-semibold">{c.cliente_nome || telefoneBonito(c.cliente_telefone as string)}</p><p className="mt-0.5 text-[11.5px] text-tinta-3">{vendedor?.nome && perfil.role !== 'vendedor' ? `${vendedor.nome} · ` : ''}{c.total_mensagens} mensagens</p></div>
                            <span className="text-xs capitalize text-tinta-2">{String(a?.tipo_conversa ?? 'não analisada')}</span><span className="text-xs capitalize text-tinta-2">{String(a?.status ?? '—').replaceAll('_',' ')}</span><div className="text-right"><span className="display text-lg font-semibold">{a?.score_atendimento == null ? '—' : String(a.score_atendimento)}</span><p className="text-[10px] text-tinta-3">{horaCurta(c.ultima_mensagem_em as string)}</p></div>
                        </Link>
                    ); })}
                    {!filtradas.length && <p className="p-8 text-center text-sm text-tinta-3">Nenhuma conversa encontrada.</p>}
                </div>
            </div>
        </AppShell>
    );
}
