import AppShell from '@/components/app-shell';
import { contextoApp } from '@/lib/contexto-app';

export const dynamic = 'force-dynamic';
const nomes: Record<string,string> = { acolhida:'Acolhida', sondagem:'Sondagem', solucao_completa:'Solução completa', contorno_objecoes:'Contorno de objeções', estrategia_preco:'Estratégia de preço', fechamento:'Fechamento', acompanhamento:'Acompanhamento' };

export default async function MeuMecPage() {
    const { supabase, perfil } = await contextoApp();
    const { data: dias } = await supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa,sondagem_itens,frases_proibidas').eq('user_id',perfil.id).order('data_ref',{ascending:false}).limit(1);
    const dia = dias?.[0]; const etapas = (dia?.por_etapa ?? {}) as Record<string,number|null>;
    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/meu-mec"><div className="mx-auto max-w-[820px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10"><h1 className="display text-[30px] font-semibold">Meu MEC</h1><p className="mt-1 text-sm text-tinta-2">A conta considera somente etapas que cabiam em cada negociação.</p><section className="mt-6 rounded-card bg-petroleo p-6 text-papel"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-white/65">Você seguiu o MEC em</p><p className="display mt-2 text-5xl font-semibold">{dia?.aderencia_geral==null?'—':`${Math.round(Number(dia.aderencia_geral))}%`}</p></section><div className="mt-5 space-y-3">{Object.entries(nomes).map(([chave,nome])=><section key={chave} className="rounded-card border border-linha bg-superficie p-5"><div className="flex items-center justify-between"><h2 className="display text-lg font-semibold">{nome}</h2><span className="display text-xl font-semibold">{etapas[chave]==null?'—':`${etapas[chave]}%`}</span></div><div className="mt-3 h-2 rounded-full bg-papel-2"><div className="h-full rounded-full bg-petroleo" style={{width:`${etapas[chave]??0}%`}}/></div></section>)}</div>{!dia&&<p className="mt-6 rounded-card border border-linha bg-papel-2 p-5 text-sm text-tinta-2">A aderência aparecerá depois do primeiro relatório analisado.</p>}</div></AppShell>;
}
