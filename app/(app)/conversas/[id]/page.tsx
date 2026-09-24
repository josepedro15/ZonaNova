import { notFound } from 'next/navigation';
import {
    Avatar, Barra, Botao, BotaoCopiar, BotaoLink, CabecalhoPagina, Cartao, Numero, Pagina, Selo, Shell,
} from '@/components/ui';
import { contextoApp, dataCurta } from '@/lib/contexto-app';
import { esperaDoCliente, esperaEmTexto, semTelefone, telefoneBonito } from '@/lib/painel';
import { aderenciaPercentual } from '@/lib/analise';
import { grifarConversa, type Tom } from '@/lib/visual';
import { NOMES_ETAPA, type Etapa } from '@/lib/derivacoes';
import { contestarAderencia } from '@/app/actions/gestao';
import { bloquearContato } from '@/app/actions/conexao';
import { Transcricao, textoDaMensagem, type Mensagem } from './transcricao';

export const dynamic = 'force-dynamic';

type Payload = {
    resumo?: string; proxima_acao?: string; script_sugerido?: string; evidencias?: { trecho: string; conclusao: string }[];
};
type Marcacao = { id: string; etapa: string; aplicavel: boolean; aplicado: string | null; justificativa: string };

const TIPO: Record<string, string> = { negociacao: 'Negociação', suporte: 'Suporte', social: 'Social' };
const STATUS: Record<string, { rotulo: string; tom: Tom }> = {
    em_andamento: { rotulo: 'Em andamento', tom: 'neutro' },
    venda_feita: { rotulo: 'Venda feita', tom: 'bom' },
    lead_frio: { rotulo: 'Lead frio', tom: 'neutro' },
    sem_resposta: { rotulo: 'Sem resposta', tom: 'risco' },
    perdida: { rotulo: 'Perdida', tom: 'risco' },
    encerrada: { rotulo: 'Encerrada', tom: 'neutro' },
};

function seloDaMarcacao(a: Marcacao): { rotulo: string; tom: Tom; tracejado?: boolean } {
    if (!a.aplicavel) return { rotulo: 'Não cabia', tom: 'neutro' };
    if (a.aplicado === 'sim') return { rotulo: '✓ Aplicou', tom: 'bom' };
    if (a.aplicado === 'parcial') return { rotulo: '◐ Em parte', tom: 'atencao' };
    if (a.aplicado === 'nao') return { rotulo: '✕ Não aplicou', tom: 'risco' };
    // Pode ter acontecido fora do WhatsApp (ligação, balcão): doc 7 §7.3.
    return { rotulo: 'Não dá pra ver aqui', tom: 'neutro', tracejado: true };
}

function Pontuacao({ rotulo, valor, invertida = false }: { rotulo: string; valor: number | null; invertida?: boolean }) {
    // Em "risco de perder", número alto é ruim.
    const tom: Tom = valor === null ? 'neutro' : invertida ? (valor >= 50 ? 'risco' : 'azul') : 'azul';
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[12.5px] text-tinta-2">
                <span>{rotulo}</span>
                <span className={`display num text-base font-bold ${tom === 'risco' ? 'text-risco-texto' : 'text-tinta'}`}>{valor ?? '—'}</span>
            </div>
            <Barra pct={valor} tom={tom} rotulo={rotulo} />
        </div>
    );
}

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { supabase, perfil } = await contextoApp();
    const { data: conversa } = await supabase.from('conversas')
        .select('id,cliente_nome,cliente_telefone,user_id,ultima_mensagem_em,profiles!conversas_user_id_fkey(nome),mensagens(id,direcao,tipo,conteudo,transcricao,automatica,enviada_em)')
        .eq('id', id).eq('bloqueada', false).maybeSingle();
    // Bloqueada some para todo mundo, inclusive por link direto.
    if (!conversa) notFound();
    const { data: analise } = await supabase.from('analises_conversa').select('*').eq('conversa_id', id)
        .order('data_ref', { ascending: false }).limit(1).maybeSingle();
    // O MEC do MESMO dia da análise exibida.
    const { data: aderencia } = analise
        ? await supabase.from('aderencia_conversa').select('id,etapa,aplicavel,aplicado,justificativa')
            .eq('conversa_id', id).eq('data_ref', analise.data_ref).order('etapa').returns<Marcacao[]>()
        : { data: [] as Marcacao[] };
    const { data: contestacoes } = aderencia?.length
        ? await supabase.from('aderencia_contestacoes').select('aderencia_id,veredito')
            .in('aderencia_id', aderencia.map((a) => a.id)).returns<{ aderencia_id: string; veredito: string }[]>()
        : { data: [] };
    const contestada = new Map((contestacoes ?? []).map((c) => [c.aderencia_id, c.veredito]));

    const mensagens = [...((conversa.mensagens ?? []) as Mensagem[])].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const payload = (analise?.payload ?? {}) as Payload;
    const evidencias = payload.evidencias ?? [];
    const grifos = grifarConversa(mensagens.map(textoDaMensagem), evidencias.map((e) => e.trecho));
    const espera = esperaDoCliente(
        mensagens.map((m) => ({ direcao: m.direcao as 'entrada' | 'saida', automatica: m.automatica, enviada_em: m.enviada_em })),
        new Date(),
    );
    const vendedor = conversa.profiles as unknown as { nome: string } | null;
    const nome = conversa.cliente_nome || telefoneBonito(conversa.cliente_telefone);
    const podeContestar = ['gestor', 'supervisor', 'admin'].includes(perfil.role);
    const pct = aderencia?.length ? aderenciaPercentual(aderencia) : null;
    const cabiam = (aderencia ?? []).filter((a) => a.aplicavel && a.aplicado !== 'nao_verificavel' && a.aplicado !== null).length;
    const status = analise?.status ? STATUS[analise.status as string] : undefined;

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/conversas">
            <Pagina>
                <CabecalhoPagina
                    voltar={{ href: '/conversas', rotulo: 'Conversas' }}
                    titulo={<span className="flex items-center gap-3.5"><Avatar nome={conversa.cliente_nome} tamanho={48} />{nome}</span>}
                    sobre={[telefoneBonito(conversa.cliente_telefone), vendedor?.nome && `atendida por ${vendedor.nome}`, dataCurta(conversa.ultima_mensagem_em as string)].filter(Boolean).join(' · ')}
                    acoes={<>
                        {conversa.user_id === perfil.id && (
                            // Único caminho para bloquear contato `@lid`, que não tem número para digitar no Perfil.
                            <form action={bloquearContato}>
                                <input type="hidden" name="conversaId" value={conversa.id} />
                                <input type="hidden" name="motivo" value="Bloqueado pela conversa" />
                                <input type="hidden" name="voltar" value="conversas" />
                                <Botao variante="secundario" type="submit">Não é atendimento</Botao>
                            </form>
                        )}
                        {!semTelefone(conversa.cliente_telefone) && (
                            <BotaoLink href={`https://wa.me/${conversa.cliente_telefone.replace(/\D/g, '')}`} externo>Responder no WhatsApp</BotaoLink>
                        )}
                    </>} />

                <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                    <Cartao className="flex flex-col gap-4 lg:col-span-7">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-tinta-3">Conversa</h2>
                            {evidencias.length > 0 && (
                                <span className="flex items-center gap-2 text-[12.5px] text-tinta-2">
                                    <mark className="rounded-[3px] bg-evidencia-sof px-1 font-semibold text-inherit shadow-[inset_0_-2px_0_var(--color-evidencia)]">trecho</mark>
                                    citado pela análise
                                </span>
                            )}
                        </div>
                        <Transcricao mensagens={mensagens} grifos={grifos} />
                        {espera !== null && (
                            <p className="flex items-center gap-2.5 rounded-[10px] bg-risco-sof px-3.5 py-3 text-[13.5px] font-semibold text-risco-texto">
                                O cliente falou por último. Sem resposta há {esperaEmTexto(espera)}.
                            </p>
                        )}
                    </Cartao>

                    <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-5">
                        {!analise ? (
                            <Cartao variante="tracejado">
                                <h2 className="display text-lg font-bold">Análise ainda não disponível</h2>
                                <p className="mt-2 text-sm text-tinta-2">Esta conversa entra no próximo fechamento diário, às 00h30.</p>
                            </Cartao>
                        ) : (
                            <>
                                {payload.proxima_acao && (
                                    <Cartao variante="heroi" className="flex flex-col gap-3.5">
                                        <span className="text-xs font-bold uppercase tracking-[0.09em] text-white/75">Próxima ação</span>
                                        <p className="display text-[17px] font-bold leading-snug">{payload.proxima_acao}</p>
                                        {payload.script_sugerido && (
                                            <div className="flex flex-col gap-2.5 rounded-[10px] bg-superficie p-4 text-tinta">
                                                <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-azul">Responda assim</span>
                                                <p className="text-sm leading-relaxed">{payload.script_sugerido}</p>
                                                <BotaoCopiar texto={payload.script_sugerido} />
                                            </div>
                                        )}
                                    </Cartao>
                                )}

                                <Cartao className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {analise.tipo_conversa && <Selo tom="azul">{TIPO[analise.tipo_conversa as string] ?? String(analise.tipo_conversa)}</Selo>}
                                        {status && <Selo tom={status.tom}>{status.rotulo}</Selo>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                        <Pontuacao rotulo="Atendimento" valor={analise.score_atendimento ?? null} />
                                        <Pontuacao rotulo="Humor do cliente" valor={analise.sentiment ?? null} />
                                        <Pontuacao rotulo="Oportunidade" valor={analise.score_oportunidade ?? null} />
                                        <Pontuacao rotulo="Risco de perder" valor={analise.score_risco ?? null} invertida />
                                    </div>
                                    {payload.resumo && (
                                        <div className="border-t border-linha-2 pt-4">
                                            <h2 className="display text-base font-bold">O que aconteceu</h2>
                                            <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">{payload.resumo}</p>
                                        </div>
                                    )}
                                </Cartao>

                                {evidencias.length > 0 && (
                                    <Cartao className="flex flex-col gap-3">
                                        <h2 className="display text-base font-bold">Evidências</h2>
                                        <ol className="flex flex-col gap-3">
                                            {evidencias.map((e, i) => (
                                                <li key={i} className="flex items-start gap-3">
                                                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-evidencia-sof text-xs font-bold text-atencao-texto">{i + 1}</span>
                                                    <span className="flex flex-col gap-0.5">
                                                        <span className="text-[13.5px] italic">&ldquo;{e.trecho}&rdquo;</span>
                                                        <span className="text-[12.5px] text-tinta-2">{e.conclusao}</span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </Cartao>
                                )}

                                {!!aderencia?.length && (
                                    <Cartao className="flex flex-col">
                                        <div className="mb-2 flex items-baseline justify-between">
                                            <h2 className="display text-base font-bold">MEC nesta conversa</h2>
                                            <span className="text-[12.5px] text-tinta-3">
                                                <Numero valor={pct === null ? '—' : Math.round(pct)} unidade={pct === null ? undefined : '%'} tamanho="md" /> · {cabiam} etapas cabiam
                                            </span>
                                        </div>
                                        {aderencia.map((a) => {
                                            const selo = seloDaMarcacao(a);
                                            const veredito = contestada.get(a.id);
                                            return (
                                                <div key={a.id} className="flex flex-col gap-1.5 border-t border-linha-2 py-2.5">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[13.5px] font-semibold">{NOMES_ETAPA[a.etapa as Etapa] ?? a.etapa}</span>
                                                            <span className="text-xs text-tinta-3">{a.justificativa}</span>
                                                        </div>
                                                        <Selo tom={selo.tom} className={selo.tracejado ? 'border border-dashed border-linha-campo bg-superficie' : ''}>{selo.rotulo}</Selo>
                                                    </div>
                                                    {veredito && <span className="text-xs font-semibold text-azul">Contestada — {veredito === 'pendente' ? 'aguardando revisão' : veredito}</span>}
                                                    {podeContestar && veredito !== 'pendente' && (
                                                        <form action={contestarAderencia} className="flex gap-2">
                                                            <input type="hidden" name="aderenciaId" value={a.id} />
                                                            <label className="sr-only" htmlFor={`motivo-${a.id}`}>Motivo da contestação</label>
                                                            <input id={`motivo-${a.id}`} required name="motivo" placeholder="Contestar esta marcação…"
                                                                   className="min-h-11 min-w-0 flex-1 rounded-ctl border border-linha-campo px-2.5 text-xs" />
                                                            <Botao variante="texto" type="submit" className="text-xs">Enviar</Botao>
                                                        </form>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </Cartao>
                                )}
                            </>
                        )}
                    </aside>
                </div>
            </Pagina>
        </Shell>
    );
}
