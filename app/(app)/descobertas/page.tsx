import AppShell from '@/components/app-shell';
import { avaliarDescoberta } from '@/app/actions/operacao';
import { contextoApp, dataCurta } from '@/lib/contexto-app';

export const dynamic = 'force-dynamic';

export default async function Descobertas() {
    const { supabase, perfil } = await contextoApp();
    const { data } = await supabase.from('descobertas').select('*').order('created_at', { ascending: false }).limit(100);
    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/descobertas">
        <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <h1 className="display text-[30px] font-semibold">O que o MEC ainda não diz</h1>
            <p className="mt-1 text-sm text-tinta-2">Hipóteses semanais sustentadas por conversas reais. Aprovação humana é obrigatória.</p>
            <div className="mt-6 space-y-4">{(data ?? []).map(d => <article key={d.id as string} className="rounded-card border border-linha bg-superficie p-5">
                <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-ocre-texto">{String(d.tipo).replaceAll('_', ' ')}</p><h2 className="display mt-2 text-xl font-semibold">{d.hipotese as string}</h2></div><span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs capitalize">{d.status as string}</span></div>
                <div className="mt-4 flex gap-5 text-xs text-tinta-2"><span><strong>{d.conversas_suporte as number}</strong> conversas</span>{d.conversao_com != null && <span><strong>{d.conversao_com as number}%</strong> com</span>}{d.conversao_sem != null && <span><strong>{d.conversao_sem as number}%</strong> sem</span>}</div>
                {Array.isArray(d.evidencias) && <ul className="mt-4 space-y-1 text-[12px] text-tinta-2">{(d.evidencias as string[]).map((e, i) => <li key={i}>“{e}”</li>)}</ul>}
                <p className="mt-3 text-[10.5px] text-tinta-3">{dataCurta(d.periodo_de as string)}–{dataCurta(d.periodo_ate as string)}</p>
                <form action={avaliarDescoberta} className="mt-4 grid gap-2 border-t border-linha pt-4 sm:grid-cols-[1fr_140px_auto]">
                    <input type="hidden" name="id" value={d.id as string}/><input name="nota" defaultValue={(d.nota_avaliacao as string) ?? ''} placeholder="Nota da avaliação" className="rounded-[9px] border border-linha-campo px-3 py-2 text-sm"/>
                    <select name="status" defaultValue={d.status as string} className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm"><option value="em_analise">Em análise</option><option value="aprovada">Aprovada</option><option value="descartada">Descartada</option></select>
                    <button className="rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Salvar</button>
                </form>
            </article>)}{!data?.length && <p className="rounded-card border border-linha bg-papel-2 p-8 text-center text-sm text-tinta-2">As descobertas começam depois de uma semana com volume suficiente.</p>}</div>
        </div>
    </AppShell>;
}
