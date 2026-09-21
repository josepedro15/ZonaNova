import AppShell from '@/components/app-shell';
import { contextoApp } from '@/lib/contexto-app';
import { revisarContestacao } from '@/app/actions/operacao';

export const dynamic = 'force-dynamic';
const valor = (x: string) => x === 'sim' ? 1 : x === 'parcial' ? .5 : 0;

export default async function MecRede() {
    const { supabase, perfil } = await contextoApp();
    const [{ data: unidades }, { data: linhas }, { data: contestacoes }] = await Promise.all([
        supabase.from('unidades').select('id,nome').eq('ativa', true),
        supabase.from('aderencia_conversa').select('unidade_id,etapa,aplicavel,aplicado').eq('aplicavel', true).limit(10000),
        supabase.from('aderencia_contestacoes').select('id,motivo,created_at,aderencia_conversa(etapa,justificativa,conversas(cliente_nome)),profiles!aderencia_contestacoes_contestado_por_fkey(nome)').eq('veredito', 'pendente').order('created_at').limit(100),
    ]);
    const etapas = [...new Set((linhas ?? []).map(l => l.etapa as string))];
    const geral = linhas?.length ? linhas.reduce((s, l) => s + valor(l.aplicado as string), 0) / linhas.length * 100 : null;
    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/mec">
        <div className="mx-auto max-w-[1180px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <h1 className="display text-[30px] font-semibold">O MEC está pegando?</h1><p className="mt-1 text-sm text-tinta-2">Aderência é aplicada ÷ aplicável. O que não era necessário não reduz a nota.</p>
            <section className="mt-6 rounded-card bg-petroleo p-6 text-papel"><p className="text-xs text-white/65">Aderência da rede</p><p className="display mt-2 text-5xl font-semibold">{geral == null ? '—' : `${Math.round(geral)}%`}</p></section>
            <section className="mt-5 overflow-x-auto rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Por unidade e etapa</h2><table className="mt-4 min-w-[850px] text-xs"><thead><tr><th className="p-2 text-left">Unidade</th>{etapas.map(e => <th key={e} className="p-2 capitalize">{e.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{(unidades ?? []).map(u => <tr key={u.id as string} className="border-t border-linha"><td className="p-3 font-semibold">{u.nome as string}</td>{etapas.map(e => { const xs = (linhas ?? []).filter(l => l.unidade_id === u.id && l.etapa === e); const m = xs.length ? xs.reduce((s, l) => s + valor(l.aplicado as string), 0) / xs.length * 100 : null; return <td key={e} className="p-3 text-center">{m == null ? '—' : `${Math.round(m)}%`}</td>; })}</tr>)}</tbody></table></section>
            <section className="mt-5 rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Contestações pendentes</h2><div className="mt-3 space-y-3">{(contestacoes ?? []).map(c => { const a = c.aderencia_conversa as unknown as { etapa: string; justificativa: string; conversas: { cliente_nome: string | null } | null } | null; const p = c.profiles as unknown as { nome: string } | null; return <div key={c.id as string} className="rounded-[10px] bg-papel-2 p-4"><p className="text-xs font-semibold capitalize">{a?.etapa?.replaceAll('_', ' ')} · {a?.conversas?.cliente_nome ?? 'Conversa'}</p><p className="mt-1 text-[12px] text-tinta-2">{c.motivo as string}</p><p className="mt-1 text-[10.5px] text-tinta-3">Enviada por {p?.nome ?? 'gestor'} · marcação: {a?.justificativa}</p><form action={revisarContestacao} className="mt-3 flex gap-2"><input type="hidden" name="id" value={c.id as string}/><button name="veredito" value="procedente" className="rounded bg-verde-sof px-3 py-1.5 text-xs font-semibold text-verde">Procedente</button><button name="veredito" value="improcedente" className="rounded bg-vermelho-sof px-3 py-1.5 text-xs font-semibold text-vermelho">Improcedente</button></form></div>; })}{!contestacoes?.length && <p className="text-sm text-tinta-3">Nenhuma contestação aguardando revisão.</p>}</div></section>
            <p className="mt-5 rounded-card bg-papel-2 p-4 text-xs leading-relaxed text-tinta-2">Correlação não é causa. Use esta visão para priorizar treino e investigar hipóteses, nunca para punir ou remover uma etapa do Book automaticamente.</p>
        </div>
    </AppShell>;
}
