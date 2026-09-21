import AppShell from '@/components/app-shell';
import { contextoApp } from '@/lib/contexto-app';
import { repetirItem, reprocessarDia } from '@/app/actions/operacao';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
    const { supabase, perfil } = await contextoApp();
    const [{ data: fila }, { data: analises }, { data: eventos }] = await Promise.all([
        supabase.from('fila_processamento').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('analises_conversa').select('custo_estimado,created_at').order('created_at', { ascending: false }).limit(5000),
        supabase.from('eventos_admin').select('id,acao,detalhes,created_at,profiles!eventos_admin_actor_id_fkey(nome)').order('created_at', { ascending: false }).limit(12),
    ]);
    const cont = (status: string) => (fila ?? []).filter((f) => f.status === status).length;
    const custo = (analises ?? []).reduce((s, a) => s + Number(a.custo_estimado ?? 0), 0);

    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/admin">
            <div className="mx-auto max-w-[1180px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div><h1 className="display text-[30px] font-semibold">Operação</h1><p className="mt-1 text-sm text-tinta-2">Fila, custo e recuperação do pipeline</p></div>
                    <form action={reprocessarDia} className="flex gap-2"><input type="date" name="data" required className="rounded-[9px] border border-linha-campo bg-superficie px-3 text-sm"/><button className="rounded-[9px] bg-petroleo px-4 py-2.5 text-xs font-semibold text-papel">Reprocessar dia</button></form>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-5">
                    {[['Pendentes', cont('pendente')], ['Processando', cont('processando')], ['Concluídos', cont('concluido')], ['Falharam', cont('falhou')], ['Custo acumulado', `US$ ${custo.toFixed(4)}`]].map(([rotulo, valor]) => <div key={String(rotulo)} className="rounded-card border border-linha bg-superficie p-4"><p className="display text-2xl font-semibold">{String(valor)}</p><p className="mt-1 text-[11px] text-tinta-2">{rotulo}</p></div>)}
                </div>
                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <section className="overflow-hidden rounded-card border border-linha bg-superficie">
                        <h2 className="display p-5 text-lg font-semibold">Fila recente</h2>
                        {(fila ?? []).map((f) => <div key={f.id as string} className="grid grid-cols-[130px_100px_minmax(0,1fr)_70px] items-center gap-2 border-t border-linha px-4 py-3 text-xs"><span className="font-semibold">{f.tipo as string}</span><span className={`font-semibold ${f.status === 'falhou' ? 'text-vermelho' : f.status === 'concluido' ? 'text-verde' : 'text-ambar-texto'}`}>{f.status as string}</span><span className="truncate text-tinta-3" title={f.ultimo_erro as string}>{(f.ultimo_erro as string) || String(f.data_ref)}</span>{f.status === 'falhou' && <form action={repetirItem}><input type="hidden" name="id" value={f.id as string}/><button className="font-semibold text-petroleo">Repetir</button></form>}</div>)}
                    </section>
                    <aside><section className="rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Ações sensíveis</h2><div className="mt-3 space-y-3">{(eventos ?? []).map((e) => { const p = e.profiles as unknown as { nome: string } | null; return <div key={e.id as string}><p className="text-xs font-semibold">{String(e.acao).replaceAll('_', ' ')}</p><p className="text-[10.5px] text-tinta-3">{p?.nome ?? 'sistema'} · {new Date(e.created_at as string).toLocaleString('pt-BR')}</p></div>; })}</div></section></aside>
                </div>
            </div>
        </AppShell>
    );
}
