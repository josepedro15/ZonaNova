import AppShell from '@/components/app-shell';
import { contextoApp } from '@/lib/contexto-app';

export const dynamic = 'force-dynamic';

export default async function EvolucaoPage() {
    const { supabase, perfil } = await contextoApp();
    const tabela = perfil.role === 'vendedor' ? 'relatorios_diarios' : perfil.role === 'gestor' ? 'relatorios_unidade' : 'relatorios_rede';
    let q = supabase.from(tabela).select('data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta').order('data_ref', { ascending: false }).limit(90);
    if (perfil.role === 'vendedor') q = q.eq('user_id', perfil.id);
    if (perfil.role === 'gestor' && perfil.unidade_id) q = q.eq('unidade_id', perfil.unidade_id);
    const { data } = await q;
    const linhas = [...(data ?? [])].reverse();
    const notas = linhas.filter((l) => l.score_geral != null);
    const media = notas.length ? notas.reduce((s,l) => s + Number(l.score_geral),0)/notas.length : null;
    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/evolucao"><div className="mx-auto max-w-[1000px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10"><h1 className="display text-[30px] font-semibold">Evolução</h1><p className="mt-1 text-sm text-tinta-2">Últimos {linhas.length} dias com relatório</p><section className="mt-6 rounded-card border border-linha bg-superficie p-5"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-tinta-3">Nota média</p><p className="display mt-2 text-5xl font-semibold">{media == null ? '—' : Math.round(media)}</p><div className="mt-7 flex h-52 items-end gap-1.5 border-b border-linha">{linhas.map((l) => <div key={l.data_ref} title={`${l.data_ref}: ${l.score_geral ?? 'sem nota'}`} className="min-w-1 flex-1 rounded-t bg-petroleo" style={{height:`${Math.max(2,Number(l.score_geral ?? 0))}%`}} />)}</div></section><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['Leads',linhas.reduce((s,l)=>s+Number(l.leads_atendidos??0),0)],['Conversões',linhas.reduce((s,l)=>s+Number(l.conversoes_confirmadas??0),0)],['Oportunidades perdidas',linhas.reduce((s,l)=>s+Number(l.oportunidades_perdidas??0),0)]].map(([r,v])=><div key={String(r)} className="rounded-card border border-linha bg-superficie p-5"><p className="display text-3xl font-semibold">{String(v)}</p><p className="mt-1 text-xs text-tinta-2">{r}</p></div>)}</div></div></AppShell>;
}
