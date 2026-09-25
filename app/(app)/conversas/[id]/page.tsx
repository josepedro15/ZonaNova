import { notFound } from 'next/navigation';
import {
    Avatar, Barra, Botao, BotaoCopiar, BotaoLink, CabecalhoPagina, Cartao, Numero, Pagina, SELO, Selo, Shell,
} from '@/components/ui';
import { contextoApp, dataCurta } from '@/lib/contexto-app';
import { esperaDoCliente, esperaEmTexto, semTelefone, telefoneBonito } from '@/lib/painel';
import { aderenciaPercentual } from '@/lib/analise';
import { grifarConversa, listaDeTextos, rotuloPotencial, tomEspera, urgenciaAlta, type Tom } from '@/lib/visual';
import { NOMES_ETAPA, type Etapa } from '@/lib/derivacoes';
import { contestarAderencia } from '@/app/actions/gestao';
import { bloquearContato } from '@/app/actions/conexao';
import { carregarPlaybook } from '@/lib/mec-dados';
import { Transcricao, textoDaMensagem, type Mensagem } from './transcricao';
import { ChecklistMec, type ObsTela } from './checklist-mec';

export const dynamic = 'force-dynamic';

type Payload = {
    resumo?: string; destaque?: string; proxima_acao?: string; script_sugerido?: string;
    evidencias?: { trecho: string; conclusao: string }[];
    tecnicas_usadas?: unknown; erros_vendedor?: unknown; tags?: unknown;
};
type Marcacao = { id: string; etapa: string; aplicavel: boolean; aplicado: string | null; justificativa: string; itens: unknown; playbook_id: string };

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
        ? await supabase.from('aderencia_conversa').select('id,etapa,aplicavel,aplicado,justificativa,itens,playbook_id')
            .eq('conversa_id', id).eq('data_ref', analise.data_ref).order('etapa').returns<Marcacao[]>()
        : { data: [] as Marcacao[] };
    const { data: contestacoes } = aderencia?.length
        ? await supabase.from('aderencia_contestacoes').select('aderencia_id,veredito')
            .in('aderencia_id', aderencia.map((a) => a.id)).returns<{ aderencia_id: string; veredito: string }[]>()
        : { data: [] };
    const contestada = new Map((contestacoes ?? []).map((c) => [c.aderencia_id, c.veredito]));
    // Detalhe estruturado do MEC (spec 2026-09-24): só existe para análises feitas com ele.
    const [{ data: observacoes }, pb] = analise && aderencia?.length
        ? await Promise.all([
            supabase.from('mec_observacoes').select('etapa,sinal,item_chave,valor,detalhe,trecho')
                .eq('conversa_id', id).eq('data_ref', analise.data_ref).returns<ObsTela[]>(),
            carregarPlaybook(supabase, aderencia[0].playbook_id),
        ])
        : [{ data: [] as ObsTela[] }, null];

    const mensagens = [...((conversa.mensagens ?? []) as Mensagem[])].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const payload = (analise?.payload ?? {}) as Payload;
    const evidencias = payload.evidencias ?? [];
    // Campos que a IA já devolvia e nenhuma tela mostrava (auditoria de 24/09).
    const tecnicas = listaDeTextos(payload.tecnicas_usadas);
    const erros = listaDeTextos(payload.erros_vendedor);
    const tags = listaDeTextos(payload.tags).slice(0, 8);
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
                    <Cartao className="flex flex-col gap-4 lg:col-span-7 2xl:col-span-6">
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
                            <p className={`flex items-center gap-2.5 rounded-[10px] px-3.5 py-3 text-[13.5px] font-semibold ${SELO[tomEspera(espera)]}`}>
                                O cliente falou por último. Sem resposta há {esperaEmTexto(espera)}.
                            </p>
                        )}
                    </Cartao>

                    {/* Em tela bem larga, a análise ocupa duas colunas: empilhada numa faixa
                        estreita, ela ficava muito mais alta que o necessário. */}
                    <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:col-span-5 2xl:col-span-6 2xl:grid-cols-2">
                        {!analise ? (
                            <Cartao variante="tracejado" className="2xl:col-span-2">
                                <h2 className="display text-lg font-bold">Análise ainda não disponível</h2>
                                <p className="mt-2 text-sm text-tinta-2">Esta conversa entra no próximo fechamento diário, às 00h30.</p>
                            </Cartao>
                        ) : (
                            <>
                                {payload.proxima_acao ? (
                                    <Cartao variante="heroi" className="flex flex-col gap-3.5 2xl:col-span-2">
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
                                ) : payload.script_sugerido ? (
                                    // Sem próxima ação, o script ainda é útil: sem isto, ele sumia da tela
                                    // (regressão vs. a versão antiga desta página).
                                    <Cartao className="flex flex-col gap-2.5 2xl:col-span-2">
                                        <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-azul">Responda assim</span>
                                        <p className="text-sm leading-relaxed">{payload.script_sugerido}</p>
                                        <BotaoCopiar texto={payload.script_sugerido} />
                                    </Cartao>
                                ) : null}

                                <Cartao className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {analise.tipo_conversa && <Selo tom="azul">{TIPO[analise.tipo_conversa as string] ?? String(analise.tipo_conversa)}</Selo>}
                                        {status && <Selo tom={status.tom}>{status.rotulo}</Selo>}
                                        {analise.estagio_funil && <Selo>{String(analise.estagio_funil).charAt(0).toUpperCase() + String(analise.estagio_funil).slice(1).replaceAll('_', ' ')}</Selo>}
                                        {rotuloPotencial(analise.potencial_venda) && <Selo tom={analise.potencial_venda === 'alto' ? 'azul' : 'neutro'}>{rotuloPotencial(analise.potencial_venda)}</Selo>}
                                        {typeof analise.urgencia === 'number' && <Selo tom={urgenciaAlta(analise.urgencia) ? 'atencao' : 'neutro'}>Urgência {analise.urgencia}/5</Selo>}
                                    </div>
                                    {tags.length > 0 && (
                                        <ul aria-label="Tags da conversa" className="-mt-1 flex flex-wrap gap-1.5">
                                            {tags.map((t) => <li key={t} className="rounded-md bg-superficie-2 px-2 py-0.5 text-[11.5px] text-tinta-2">#{t}</li>)}
                                        </ul>
                                    )}
                                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                        <Pontuacao rotulo="Atendimento" valor={analise.score_atendimento ?? null} />
                                        <Pontuacao rotulo="Humor do cliente" valor={analise.sentiment ?? null} />
                                        <Pontuacao rotulo="Oportunidade" valor={analise.score_oportunidade ?? null} />
                                        <Pontuacao rotulo="Risco de perder" valor={analise.score_risco ?? null} invertida />
                                    </div>
                                    {(payload.resumo || payload.destaque) && (
                                        <div className="border-t border-linha-2 pt-4">
                                            <h2 className="display text-base font-bold">O que aconteceu</h2>
                                            {payload.destaque && <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-tinta">{payload.destaque}</p>}
                                            {payload.resumo && <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">{payload.resumo}</p>}
                                        </div>
                                    )}
                                </Cartao>

                                {(tecnicas.length > 0 || erros.length > 0) && (
                                    <Cartao className="grid gap-4 sm:grid-cols-2">
                                        <div className="flex flex-col gap-2">
                                            <h2 className="display text-base font-bold">O que funcionou</h2>
                                            {tecnicas.length ? (
                                                <ul className="flex flex-col gap-1.5">
                                                    {tecnicas.map((t) => <li key={t} className="flex gap-2 text-[13px] leading-snug"><span aria-hidden="true" className="font-bold text-bom-texto">✓</span>{t}</li>)}
                                                </ul>
                                            ) : <p className="text-[13px] text-tinta-3">Nenhuma técnica identificada.</p>}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <h2 className="display text-base font-bold">O que atrapalhou</h2>
                                            {erros.length ? (
                                                <ul className="flex flex-col gap-1.5">
                                                    {erros.map((e) => <li key={e} className="flex gap-2 text-[13px] leading-snug"><span aria-hidden="true" className="font-bold text-risco-texto">✕</span>{e}</li>)}
                                                </ul>
                                            ) : <p className="text-[13px] text-tinta-3">Nenhum erro apontado.</p>}
                                        </div>
                                    </Cartao>
                                )}

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
                                                            {!(observacoes ?? []).some((o) => o.etapa === a.etapa) && listaDeTextos(a.itens).length > 0 && (
                                                                <ul aria-label="Itens observados nesta etapa" className="mt-1 flex flex-wrap gap-1">
                                                                    {listaDeTextos(a.itens).map((item) => <li key={item} className="rounded-md bg-superficie-2 px-2 py-0.5 text-[11.5px] text-tinta-2">{item}</li>)}
                                                                </ul>
                                                            )}
                                                            {/* Etapa que não cabia não mostra checklist: "0 de 7" seria nota ruim, não ausência. */}
                                                            {a.aplicavel && (
                                                                <ChecklistMec etapa={a.etapa} obs={(observacoes ?? []).filter((o) => o.etapa === a.etapa)}
                                                                              rotulos={pb?.rotulos ?? new Map()} provisoria={pb?.provisorias.has(a.etapa) ?? false} />
                                                            )}
                                                        </div>
                                                        {selo.tracejado ? (
                                                            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-linha-campo bg-superficie px-2.5 py-1 text-xs font-semibold text-tinta-2">{selo.rotulo}</span>
                                                        ) : (
                                                            <Selo tom={selo.tom}>{selo.rotulo}</Selo>
                                                        )}
                                                    </div>
                                                    {veredito && <span className="text-xs font-semibold text-azul">Contestada — {veredito === 'pendente' ? 'aguardando revisão' : veredito}</span>}
                                                    {podeContestar && veredito !== 'pendente' && (
                                                        <form action={contestarAderencia} className="flex gap-2">
                                                            <input type="hidden" name="aderenciaId" value={a.id} />
                                                            <label className="sr-only" htmlFor={`motivo-${a.id}`}>Motivo da contestação</label>
                                                            <input id={`motivo-${a.id}`} required name="motivo" placeholder="Contestar esta marcação…"
                                                                   className="min-h-11 min-w-0 flex-1 rounded-ctl border border-linha-campo px-2.5 text-xs" />
                                                            <Botao variante="texto" type="submit">Enviar</Botao>
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
