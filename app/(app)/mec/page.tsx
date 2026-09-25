import AppShell from '@/components/app-shell';
import { Tabela } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { revisarContestacao } from '@/app/actions/operacao';
import { paginar } from '@/lib/paginar';
import { aderenciaPercentual } from '@/lib/analise';
import { diaMenos } from '@/lib/derivacoes';
import { chaveConversaDia, porConversaDia, resumirObservacoes, type LinhaObservacao } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

export const dynamic = 'force-dynamic';

export default async function MecRede() {
    const { supabase, perfil } = await contextoApp();
    const desde = diaMenos(dataHoje(), 14);
    // Paginado (o PostgREST corta em 1000) e sem conversa bloqueada.
    const [{ data: unidades }, linhas, { data: contestacoes }, observacoes, sondagens, pb] = await Promise.all([
        supabase.from('unidades').select('id,nome').eq('ativa', true),
        paginar((de, ate) => supabase.from('aderencia_conversa')
            .select('id,unidade_id,etapa,aplicavel,aplicado,conversas!inner(bloqueada)')
            .eq('aplicavel', true).eq('conversas.bloqueada', false).order('id').range(de, ate)),
        supabase.from('aderencia_contestacoes').select('id,motivo,created_at,aderencia_conversa(etapa,justificativa,conversas(cliente_nome)),profiles!aderencia_contestacoes_contestado_por_fkey(nome)').eq('veredito', 'pendente').order('created_at').limit(100),
        paginar<LinhaObservacao & { unidade_id: string; data_ref: string }>((de, ate) => supabase.from('mec_observacoes')
            .select('unidade_id,conversa_id,data_ref,etapa,sinal,item_chave,valor,detalhe,trecho,conversas!inner(bloqueada)')
            .in('sinal', ['sondagem_item', 'objecao', 'fechamento']).eq('conversas.bloqueada', false).gte('data_ref', desde).order('id').range(de, ate)),
        paginar<{ conversa_id: string; data_ref: string }>((de, ate) => supabase.from('aderencia_conversa').select('conversa_id,data_ref,conversas!inner(bloqueada)')
            .eq('etapa', 'sondagem').eq('aplicavel', true).eq('conversas.bloqueada', false).gte('data_ref', desde).order('id').range(de, ate)),
        carregarPlaybook(supabase, null),
    ]);
    const etapas = [...new Set((linhas ?? []).map(l => l.etapa as string))];
    // Mesma regra do worker: não verificável não entra na conta (doc 7 §7.3).
    const geral = aderenciaPercentual(linhas ?? []);
    // Unidade do resumo = (conversa, dia): a janela tem uma análise por conversa por dia.
    const aplicavel = new Set(sondagens.map((s) => chaveConversaDia(s.conversa_id, s.data_ref)));
    const porDia = porConversaDia(observacoes);
    const porLoja = (unidades ?? []).map((u) => ({ u, r: resumirObservacoes(porDia.filter((o) => o.unidade_id === u.id), aplicavel) }));
    const informacoes = pb ? pb.itens.filter((i) => i.tipo === 'informacao').length : null;
    const rotuloFech = (chave: string) => (chave === 'nenhum' ? 'não tentou' : chave === 'outra' ? 'outra' : (pb?.rotulos.get(chave) ?? chave).toLowerCase());
    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/mec">
        <div className="mx-auto max-w-[1180px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <h1 className="display text-[30px] font-semibold">O MEC está pegando?</h1><p className="mt-1 text-sm text-tinta-2">Aderência é aplicada ÷ aplicável. O que não era necessário não reduz a nota.</p>
            <section className="mt-6 rounded-card bg-petroleo p-6 text-papel"><p className="text-xs text-white/65">Aderência da rede</p><p className="display mt-2 text-5xl font-semibold">{geral == null ? '—' : `${Math.round(geral)}%`}</p></section>
            <section className="mt-5 overflow-x-auto rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Por unidade e etapa</h2><table className="mt-4 min-w-[850px] text-xs"><thead><tr><th className="p-2 text-left">Unidade</th>{etapas.map(e => <th key={e} className="p-2 capitalize">{e.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{(unidades ?? []).map(u => <tr key={u.id as string} className="border-t border-linha"><td className="p-3 font-semibold">{u.nome as string}</td>{etapas.map(e => { const xs = (linhas ?? []).filter(l => l.unidade_id === u.id && l.etapa === e); const m = aderenciaPercentual(xs); return <td key={e} className="p-3 text-center">{m == null ? '—' : `${Math.round(m)}%`}</td>; })}</tr>)}</tbody></table></section>
            <div className="mt-5">
                <Tabela titulo="MEC estruturado por loja" acao={<span className="text-[12.5px] text-tinta-3">últimos 14 dias</span>}
                        vazio="Ainda sem o detalhe do MEC nas negociações."
                        colunas={['Loja', 'Sondagem', 'Contorno completo', 'Fechamento']}
                        grade="minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,2fr)" larguraMin={760}
                        linhas={porLoja.every(({ r }) => r.detalhe.conversas === 0) ? [] : porLoja.map(({ u, r }) => {
                            const fech = Object.entries(r.detalhe.fechamento).sort((a, b) => b[1] - a[1]);
                            const total = fech.reduce((s, [, n]) => s + n, 0);
                            return {
                                chave: u.id as string, href: `/unidades/${u.id}`, atenuada: r.detalhe.conversas === 0,
                                celulas: [
                                    <span key="n" className="font-semibold">{u.nome as string}</span>,
                                    <span key="s" className="num">{r.sondagem_itens === null ? '—' : `${String(r.sondagem_itens).replace('.', ',')}${informacoes === null ? '' : ` de ${informacoes}`}`}</span>,
                                    <span key="c" className="num">{r.detalhe.contorno_completo_pct === null ? '—' : `${r.detalhe.contorno_completo_pct}%`}</span>,
                                    <span key="f" className="text-[12.5px] text-tinta-2">{total ? fech.map(([k, n]) => `${rotuloFech(k)} ${Math.round((n / total) * 100)}%`).join(' · ') : '—'}</span>,
                                ],
                            };
                        })} />
            </div>
            <section className="mt-5 rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Contestações pendentes</h2><div className="mt-3 space-y-3">{(contestacoes ?? []).map(c => { const a = c.aderencia_conversa as unknown as { etapa: string; justificativa: string; conversas: { cliente_nome: string | null } | null } | null; const p = c.profiles as unknown as { nome: string } | null; return <div key={c.id as string} className="rounded-[10px] bg-papel-2 p-4"><p className="text-xs font-semibold capitalize">{a?.etapa?.replaceAll('_', ' ')} · {a?.conversas?.cliente_nome ?? 'Conversa'}</p><p className="mt-1 text-[12px] text-tinta-2">{c.motivo as string}</p><p className="mt-1 text-[10.5px] text-tinta-3">Enviada por {p?.nome ?? 'gestor'} · marcação: {a?.justificativa}</p><form action={revisarContestacao} className="mt-3 flex gap-2"><input type="hidden" name="id" value={c.id as string}/><button name="veredito" value="procedente" className="rounded bg-verde-sof px-3 py-1.5 text-xs font-semibold text-verde">Procedente</button><button name="veredito" value="improcedente" className="rounded bg-vermelho-sof px-3 py-1.5 text-xs font-semibold text-vermelho">Improcedente</button></form></div>; })}{!contestacoes?.length && <p className="text-sm text-tinta-3">Nenhuma contestação aguardando revisão.</p>}</div></section>
            <p className="mt-5 rounded-card bg-papel-2 p-4 text-xs leading-relaxed text-tinta-2">Correlação não é causa. Use esta visão para priorizar treino e investigar hipóteses, nunca para punir ou remover uma etapa do Book automaticamente.</p>
        </div>
    </AppShell>;
}
