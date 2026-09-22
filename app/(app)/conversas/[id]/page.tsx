import { notFound } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { contextoApp, horaCurta } from '@/lib/contexto-app';
import { telefoneBonito } from '@/lib/painel';
import { contestarAderencia } from '@/app/actions/gestao';
import { bloquearContato } from '@/app/actions/conexao';

export const dynamic = 'force-dynamic';

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { supabase, perfil } = await contextoApp();
    const { data: conversa } = await supabase.from('conversas')
        .select('id,cliente_nome,cliente_telefone,user_id,profiles!conversas_user_id_fkey(nome),mensagens(id,direcao,tipo,conteudo,transcricao,automatica,enviada_em)')
        .eq('id', id).eq('bloqueada', false).maybeSingle();
    // Bloqueada some para todo mundo, inclusive por link direto.
    if (!conversa) notFound();
    const [{ data: analise }, { data: aderencia }] = await Promise.all([
        supabase.from('analises_conversa').select('*').eq('conversa_id', id).order('data_ref', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('aderencia_conversa').select('id,etapa,aplicavel,aplicado,justificativa,evidencias,itens').eq('conversa_id', id).order('etapa'),
    ]);
    const mensagens = [...((conversa.mensagens ?? []) as { id:string;direcao:string;tipo:string;conteudo:string|null;transcricao:string|null;automatica:boolean;enviada_em:string }[])].sort((a,b) => a.enviada_em.localeCompare(b.enviada_em));
    const payload = (analise?.payload ?? {}) as { resumo?:string; destaque?:string; proxima_acao?:string; script_sugerido?:string; objecoes?:string[]; tecnicas_usadas?:string[]; erros_vendedor?:string[]; evidencias?:{trecho:string;conclusao:string}[] };
    const vendedor = conversa.profiles as unknown as { nome: string } | null;

    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/conversas">
            <div className="mx-auto max-w-[1240px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
                <h1 className="display text-[28px] font-semibold">{conversa.cliente_nome || telefoneBonito(conversa.cliente_telefone)}</h1><p className="mt-1 text-sm text-tinta-2">{telefoneBonito(conversa.cliente_telefone)}{vendedor?.nome ? ` · atendida por ${vendedor.nome}` : ''}</p>
                {conversa.user_id === perfil.id && (
                    // Único caminho para bloquear contato `@lid`, que não tem
                    // número para digitar no Perfil.
                    <form action={bloquearContato} className="mt-3">
                        <input type="hidden" name="telefone" value={conversa.cliente_telefone} />
                        <input type="hidden" name="motivo" value="Bloqueado pela conversa" />
                        <input type="hidden" name="voltar" value="conversas" />
                        <button className="text-xs font-semibold text-vermelho">Não é atendimento — bloquear este contato</button>
                    </form>
                )}
                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
                    <section className="rounded-card border border-linha bg-superficie p-4 lg:p-6"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-tinta-3">Conversa</p><div className="mt-5 space-y-3">{mensagens.map((m) => <div key={m.id} className={`flex ${m.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-[13px] px-3.5 py-2.5 ${m.automatica ? 'border border-dashed border-linha bg-papel-2' : m.direcao === 'saida' ? 'bg-petroleo-sof' : 'bg-papel-2'}`}>{m.automatica && <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-tinta-3">Mensagem automática</p>}<p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.tipo === 'audio' ? m.transcricao ? `🎧 ${m.transcricao}` : '🎧 Áudio sem transcrição' : m.conteudo || `[${m.tipo}]`}</p><p className="mt-1 text-right text-[9.5px] text-tinta-3">{horaCurta(m.enviada_em)}</p></div></div>)}</div></section>
                    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                        {!analise ? <div className="rounded-card border border-linha bg-papel-2 p-5"><h2 className="display text-lg font-semibold">Análise ainda não disponível</h2><p className="mt-2 text-sm text-tinta-2">Esta conversa entra no próximo fechamento diário.</p></div> : <>
                            <section className="rounded-card border border-linha bg-superficie p-5"><div className="grid grid-cols-4 gap-2 text-center">{[['Atendimento',analise.score_atendimento],['Cliente',analise.sentiment],['Oportunidade',analise.score_oportunidade],['Risco',analise.score_risco]].map(([r,v]) => <div key={String(r)}><p className="display text-2xl font-semibold">{String(v ?? '—')}</p><p className="text-[9.5px] text-tinta-3">{r}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-petroleo-sof px-2.5 py-1 text-xs font-semibold text-petroleo">{analise.tipo_conversa}</span><span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs capitalize">{String(analise.status).replaceAll('_',' ')}</span></div></section>
                            <section className="rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">O que aconteceu</h2><p className="mt-2 text-[13px] leading-relaxed text-tinta-2">{payload.resumo}</p>{payload.proxima_acao && <div className="mt-4 rounded-[10px] bg-ocre-sof p-3.5"><p className="text-[10px] font-bold uppercase text-ocre-texto">Próxima ação</p><p className="mt-1 text-[12.5px] leading-relaxed">{payload.proxima_acao}</p></div>}{payload.script_sugerido && <div className="mt-3 rounded-[10px] bg-petroleo-sof p-3.5"><p className="text-[10px] font-bold uppercase text-petroleo">Responda assim</p><p className="mt-1 text-[12.5px] leading-relaxed">{payload.script_sugerido}</p></div>}</section>
                            <section className="rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">Evidências</h2><div className="mt-3 space-y-3">{(payload.evidencias ?? []).map((e,i) => <blockquote key={i} className="border-l-2 border-dourado pl-3"><p className="text-[12.5px] italic">“{e.trecho}”</p><p className="mt-1 text-[11px] text-tinta-3">{e.conclusao}</p></blockquote>)}</div></section>
                            {!!aderencia?.length && <section className="rounded-card border border-linha bg-superficie p-5"><h2 className="display text-lg font-semibold">MEC nesta conversa</h2><div className="mt-3 space-y-2">{aderencia.map((a) => <div key={a.etapa} className="border-b border-linha py-2 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold capitalize">{String(a.etapa).replaceAll('_',' ')}</p><p className="mt-0.5 text-[10.5px] text-tinta-3">{a.justificativa}</p></div><span className="text-xs font-semibold capitalize">{a.aplicavel ? a.aplicado : 'não se aplica'}</span></div>{['gestor','supervisor','admin'].includes(perfil.role)&&<form action={contestarAderencia} className="mt-2 flex gap-2"><input type="hidden" name="aderenciaId" value={a.id as string}/><input required name="motivo" placeholder="Contestar esta marcação…" className="min-w-0 flex-1 rounded border border-linha-campo px-2 py-1 text-xs"/><button className="text-[11px] font-semibold text-petroleo">Enviar</button></form>}</div>)}</div></section>}
                        </>}
                    </aside>
                </div>
            </div>
        </AppShell>
    );
}
