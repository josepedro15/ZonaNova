import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { sair } from '@/app/actions/auth';
import Marca from '@/app/marca';
import AppShell from '@/components/app-shell';
import {
    desde, esperaDoCliente, esperaEmTexto, foiRespondido,
    respostaMediaEmMinutos, semTelefone, telefoneBonito, temposDeResposta, type Msg,
} from '@/lib/painel';

// O painel lê o que chegou há instantes pelo webhook. Gerado uma vez no build
// ele mostraria o dia do deploy para sempre — o mesmo engano que congelou a
// lista de unidades do /cadastro.
export const dynamic = 'force-dynamic';

const FUSO = 'America/Sao_Paulo';

type ConversaComMensagens = {
    id: string;
    cliente_nome: string | null;
    cliente_telefone: string;
    ultima_mensagem_em: string;
    mensagens: (Msg & { tipo: string; conteudo: string | null })[];
};

/** Meia-noite de hoje em Brasília, como instante. */
function inicioDoDia(agora: Date): Date {
    const dia = new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(agora);
    return new Date(`${dia}T00:00:00-03:00`);
}

function horaBrasilia(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO, hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso)).replace(':', 'h');
}

function saudacao(agora: Date): string {
    const hora = Number(new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO, hour: '2-digit', hour12: false,
    }).format(agora));
    if (hora < 12) return 'Bom dia';
    return hora < 18 ? 'Boa tarde' : 'Boa noite';
}

function dataPorExtenso(agora: Date): string {
    const texto = new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long',
    }).format(agora);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const primeiroNome = (nome: string | null | undefined) => (nome ?? '').split(' ')[0];

/**
 * O link que realmente resolve o problema hoje.
 *
 * `/conversas/[id]` é a tela da Fase 6 e ainda não existe — apontar para lá
 * seria uma lista "acionável" cujos itens dão 404. Quem está olhando um cliente
 * parado há quatro horas quer responder, e responder acontece no WhatsApp. O
 * wa.me abre exatamente aquela conversa no celular.
 */
const noWhatsapp = (telefone: string) => `https://wa.me/${telefone.replace(/\D/g, '')}`;

/**
 * Contato que chegou só como `@lid` não tem telefone: um wa.me com aqueles
 * dígitos abriria uma pessoa qualquer. Aí o melhor destino é a conversa.
 */
const destinoDaEspera = (c: ConversaComMensagens) => semTelefone(c.cliente_telefone)
    ? { href: `/conversas/${c.id}` }
    : { href: noWhatsapp(c.cliente_telefone), target: '_blank', rel: 'noopener noreferrer' };

/** Quantos cartões de espera aparecem abertos; o resto fica em "Ver mais". */
const ESPERA_VISIVEL = 4;

/**
 * Duas letras para o avatar, ou null quando o cliente ainda não tem nome.
 *
 * O null importa: os dois últimos dígitos do telefone, que era o antigo
 * recurso, aparecem como "67" no lugar das iniciais e não querem dizer nada.
 * Sem nome, um ícone de pessoa é mais honesto do que um número disfarçado de
 * inicial — e o telefone já está escrito no título do cartão.
 */
function iniciais(nome: string | null): string | null {
    const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return null;
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** A última coisa que o cliente disse, para o cartão de espera ter contexto. */
function ultimaFalaDoCliente(c: ConversaComMensagens): string {
    const dele = c.mensagens
        .filter((m) => m.direcao === 'entrada')
        .sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const ultima = dele[dele.length - 1];
    if (!ultima) return '';
    if (ultima.tipo === 'audio') return 'áudio';
    if (ultima.tipo !== 'texto') return ultima.tipo;
    const texto = (ultima.conteudo ?? '').trim();
    return texto.length > 46 ? `"${texto.slice(0, 46)}…"` : `"${texto}"`;
}

export default async function Dashboard() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    const agora = new Date();
    const comeco = inicioDoDia(agora);
    // Sete dias para trás: o cartão de espera precisa alcançar quem ficou de
    // ontem, e a tela de dia vazio existe justamente para mostrar isso.
    const janela = new Date(comeco.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Tudo já passou pela RLS. Vendedor vê as próprias conversas; gestor, as da
    // unidade. Ver tests/rls.sql.
    const dataRef = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
    const [{ data: perfil }, { data: conexao }, { data: conversas }, { data: relatorios }, { data: aderencia }] = await Promise.all([
        supabase.from('profiles')
            .select('nome, role, unidades!profiles_unidade_id_fkey(nome)')
            .eq('id', user!.id)
            .maybeSingle<{ nome: string; role: string; unidades: { nome: string } | null }>(),
        supabase.from('vw_conexoes_status')
            .select('status, numero, ultimo_evento_em')
            .eq('user_id', user!.id)
            .maybeSingle<{ status: string; numero: string | null; ultimo_evento_em: string | null }>(),
        supabase.from('conversas')
            .select('id, cliente_nome, cliente_telefone, ultima_mensagem_em, mensagens(direcao, automatica, enviada_em, tipo, conteudo)')
            .gte('ultima_mensagem_em', janela.toISOString())
            .eq('bloqueada', false)
            .order('ultima_mensagem_em', { ascending: false })
            .returns<ConversaComMensagens[]>(),
        supabase.from('relatorios_diarios')
            .select('data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta,payload')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(30),
        supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa,sondagem_itens,frases_proibidas')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const todas = conversas ?? [];
    const deHoje = todas.filter((c) => new Date(c.ultima_mensagem_em) >= comeco);

    const esperando = todas
        .map((c) => ({ conversa: c, espera: esperaDoCliente(c.mensagens, agora) }))
        .filter((e): e is { conversa: ConversaComMensagens; espera: number } => e.espera !== null)
        .sort((a, b) => b.espera - a.espera);

    // A espera acima olha o histórico inteiro; as métricas do dia, não.
    const tempos = deHoje.flatMap((c) => temposDeResposta(desde(c.mensagens, comeco)));
    const respostaMedia = respostaMediaEmMinutos(tempos);

    const comFalaDoCliente = deHoje
        .map((c) => foiRespondido(desde(c.mensagens, comeco)))
        .filter((r): r is boolean => r !== null);
    const taxa = comFalaDoCliente.length > 0
        ? Math.round((comFalaDoCliente.filter(Boolean).length / comFalaDoCliente.length) * 100)
        : null;

    const gere = ['gestor', 'supervisor', 'admin'].includes(perfil?.role ?? '');
    const { count: pendentes } = gere
        ? await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
        : { count: 0 };

    const ligado = conexao?.status === 'conectada';
    const relatorio = (relatorios ?? []).find((r) => r.data_ref === dataRef) ?? relatorios?.[0] ?? null;
    const historico = [...(relatorios ?? [])].reverse();
    const coaching = (relatorio?.payload ?? {}) as {
        resumo?: string; melhorias?: string[]; elogio?: string; desafio?: string;
    };

    const cartaoDeEspera = ({ conversa, espera }: { conversa: ConversaComMensagens; espera: number }) => {
        // Acima de duas horas o atraso deixa de ser demora e vira
        // lead perdido: a cor muda para dizer isso sem texto.
        const grave = espera >= 2 * 60 * 60 * 1000;
        return (
            <a key={conversa.id} {...destinoDaEspera(conversa)}
               className={`flex items-center gap-2.5 rounded-[10px] p-3 ${grave ? 'bg-vermelho-sof' : 'bg-ambar-sof'}`}>
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full border bg-superficie font-display text-[12.5px] font-semibold ${grave ? 'border-vermelho-linha text-vermelho-texto' : 'border-linha-quente text-ambar-texto'}`}>
                    {iniciais(conversa.cliente_nome) ?? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="8" r="3.6" />
                            <path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" />
                        </svg>
                    )}
                </span>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-semibold">
                        {conversa.cliente_nome ?? telefoneBonito(conversa.cliente_telefone)}
                    </span>
                    <span className="truncate text-[11.5px] text-tinta-2">
                        {ultimaFalaDoCliente(conversa)}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                    <span className={`text-[13px] font-semibold ${grave ? 'text-vermelho' : 'text-ambar-texto'}`}>
                        {esperaEmTexto(espera)}
                    </span>
                    <span className="text-[10.5px] text-tinta-2">parado</span>
                </span>
            </a>
        );
    };

    return (
        <AppShell papel="vendedor" nome={perfil?.nome ?? ''} unidade={perfil?.unidades?.nome} atual="/dashboard">
        <main className="mx-auto w-full max-w-[430px] px-[18px] pb-10 lg:max-w-[1120px] lg:px-10 lg:pb-16">
            <header className="flex items-center justify-between border-b border-linha py-3.5 lg:py-5">
                <Marca legenda={perfil?.unidades?.nome ?? 'Rede'} />
                <div className="flex items-center gap-3">
                    {ligado ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-verde-sof px-2.5 py-1 text-[11.5px] font-semibold text-verde">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" />
                            </svg>
                            Conectado
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-vermelho-sof px-2.5 py-1 text-[11.5px] font-semibold text-vermelho">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                            Fora do ar
                        </span>
                    )}
                    <form action={sair}>
                        <button type="submit" className="text-[13px] text-tinta-2">Sair</button>
                    </form>
                </div>
            </header>

            <h1 className="display mt-5 text-2xl font-semibold lg:mt-8 lg:text-[34px]">
                {saudacao(agora)}, {primeiroNome(perfil?.nome)}
            </h1>
            <p className="mt-1 text-[12.5px] text-tinta-2 lg:text-[14px]">
                {dataPorExtenso(agora)}
                {deHoje.length > 0 && ` · última mensagem às ${horaBrasilia(deHoje[0].ultima_mensagem_em)}`}
            </p>

            {relatorio && (
                <>
                    <section className="mt-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="rounded-card bg-petroleo p-5 text-papel">
                            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/65">Relatório fechado · {new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:FUSO}).format(new Date(`${relatorio.data_ref}T12:00:00-03:00`))}</p>
                            <p className="display mt-2 text-5xl font-semibold">{relatorio.score_geral === null ? '—' : Math.round(Number(relatorio.score_geral))}<span className="text-base font-medium text-white/55">/100</span></p>
                            <p className="mt-3 text-[11.5px] leading-relaxed text-white/70">Só negociações entram na nota. Suporte e social ficam fora.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                            {[['Leads', relatorio.leads_atendidos], ['Conversões', relatorio.conversoes_confirmadas], ['Perdidas', relatorio.oportunidades_perdidas], ['Resposta', relatorio.tempo_medio_resposta_s == null ? '—' : `${Math.round(Number(relatorio.tempo_medio_resposta_s) / 60)} min`]].map(([rotulo, valor]) => (
                                <div key={String(rotulo)} className="rounded-card border border-linha bg-superficie p-4"><p className="display text-2xl font-semibold">{String(valor)}</p><p className="mt-1 text-[11.5px] text-tinta-2">{rotulo}</p></div>
                            ))}
                        </div>
                    </section>
                    <section className="mt-4 rounded-card border border-linha-quente bg-ocre-sof p-5">
                        <p className="display text-lg font-semibold text-ocre-texto">Seu treino de hoje</p>
                        {coaching.resumo && <p className="mt-2 text-[13px] leading-relaxed text-ocre-texto-2">{coaching.resumo}</p>}
                        <ol className="mt-3 space-y-2">{(coaching.melhorias ?? []).map((m, i) => <li key={m} className="flex gap-2 text-[12.5px] leading-relaxed"><span className="font-bold text-ocre">{i + 1}.</span>{m}</li>)}</ol>
                        {coaching.elogio && <p className="mt-4 border-t border-linha-quente pt-3 text-[12.5px]"><strong>O que funcionou:</strong> {coaching.elogio}</p>}
                        {coaching.desafio && <p className="mt-2 text-[12.5px]"><strong>Desafio:</strong> {coaching.desafio}</p>}
                    </section>
                    <section className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-card border border-linha bg-superficie p-5"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-tinta-3">Seu MEC</p><p className="display mt-2 text-3xl font-semibold">{aderencia?.aderencia_geral == null ? '—' : `${Math.round(Number(aderencia.aderencia_geral))}%`}</p><Link href="/meu-mec" className="mt-3 inline-block text-[12.5px] font-semibold text-petroleo">Ver as sete etapas →</Link></div>
                        <div className="rounded-card border border-linha bg-superficie p-5"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-tinta-3">Últimos dias</p><div className="mt-4 flex h-16 items-end gap-1.5">{historico.slice(-14).map((r) => <div key={r.data_ref} title={`${r.data_ref}: ${r.score_geral ?? 'sem nota'}`} className="min-w-2 flex-1 rounded-t bg-petroleo/70" style={{ height: `${Math.max(8, Number(r.score_geral ?? 0))}%` }} />)}</div></div>
                    </section>
                </>
            )}

            {/* O proxy já manda vendedor sem conexão para /conectar. Isto aqui é
                para gestor e supervisor, que ele não desvia — e para o caso de o
                proxy não correr: a tela nunca finge que o dia está normal. */}
            {!ligado && (
                <section className="mt-5 rounded-card border border-vermelho-linha bg-vermelho-sof p-[18px]">
                    <div className="flex items-start gap-2.5">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                             className="mt-0.5 shrink-0 text-vermelho" aria-hidden="true">
                            <path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4" /><path d="M12 17.5h.01" />
                        </svg>
                        <div className="flex flex-col gap-1.5">
                            <span className="display text-[17px] font-semibold text-vermelho-texto">
                                {conexao ? 'Seu WhatsApp saiu do ar' : 'Nenhum WhatsApp conectado'}
                            </span>
                            <span className="text-[12.5px] leading-relaxed text-vermelho-texto">
                                Nada está sendo lido nem analisado
                                {conexao?.ultimo_evento_em && ` desde ${horaBrasilia(conexao.ultimo_evento_em)}`}.
                            </span>
                        </div>
                    </div>
                    <Link href="/conectar"
                          className="display mt-3.5 flex min-h-[46px] items-center justify-center rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel">
                        Reconectar agora
                    </Link>
                </section>
            )}

            {gere && (
                <Link href="/aprovacoes"
                      className="mt-5 flex items-center justify-between rounded-lg border border-linha bg-superficie p-[18px]">
                    <span>
                        <span className="display block text-[15px] font-semibold">Aprovações</span>
                        <span className="text-[12.5px] text-tinta-3">
                            {pendentes ? `${pendentes} esperando você` : 'ninguém esperando'}
                        </span>
                    </span>
                    {!!pendentes && (
                        <span className="flex size-7 items-center justify-center rounded-full bg-petroleo text-[13px] font-semibold text-papel">
                            {pendentes}
                        </span>
                    )}
                </Link>
            )}

            <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-6">
            {deHoje.length === 0 ? (
                /* Ausência de dado, nunca nota zero — design/README. */
                <section className="mt-5 flex flex-col items-center gap-3 rounded-card lg:mt-0 border border-linha bg-superficie px-5 py-7 text-center">
                    <span className="flex size-13 items-center justify-center rounded-full bg-papel-2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                             className="text-tinta-2" aria-hidden="true">
                            <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
                        </svg>
                    </span>
                    <span className="display text-[19px] font-semibold">Sem movimento hoje</span>
                    <p className="text-[12.5px] leading-relaxed text-tinta-2">
                        {ligado
                            ? 'Nenhuma conversa nova. Seu número está conectado e ouvindo — quando um cliente chamar, ele aparece aqui.'
                            : 'Nenhuma conversa nova, e o número está fora do ar. Reconecte para voltar a receber.'}
                    </p>
                    <p className="text-[11.5px] leading-relaxed text-tinta-2">
                        Dia sem conversa não vira nota. Isto é ausência de dado, não desempenho ruim.
                    </p>
                </section>
            ) : (
                <div className="mt-5 lg:mt-0"><p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.12em] text-tinta-3">Tempo real · agora</p><div className="grid grid-cols-3 gap-2.5 lg:gap-4">
                    <div className="flex flex-col gap-0.5 rounded-[11px] border border-linha bg-superficie p-3 lg:gap-1 lg:rounded-card lg:p-5">
                        <span className="display text-[23px] font-semibold leading-tight lg:text-[38px]">{deHoje.length}</span>
                        <span className="text-[11px] leading-snug text-tinta-2 lg:text-[13px]">
                            conversa{deHoje.length === 1 ? '' : 's'} hoje
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-[11px] border border-linha bg-superficie p-3 lg:gap-1 lg:rounded-card lg:p-5">
                        <span className="display text-[23px] font-semibold leading-tight lg:text-[38px]">
                            {respostaMedia === null ? '—' : respostaMedia}
                            {respostaMedia !== null && <span className="text-[12.5px] font-medium text-tinta-2 lg:text-[16px]">min</span>}
                        </span>
                        <span className="text-[11px] leading-snug text-tinta-2 lg:text-[13px]">resposta média</span>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-[11px] border border-linha bg-superficie p-3 lg:gap-1 lg:rounded-card lg:p-5">
                        <span className="display text-[23px] font-semibold leading-tight lg:text-[38px]">
                            {taxa === null ? '—' : taxa}
                            {taxa !== null && <span className="text-[12.5px] font-medium text-tinta-2 lg:text-[16px]">%</span>}
                        </span>
                        <span className="text-[11px] leading-snug text-tinta-2 lg:text-[13px]">respondidas</span>
                    </div>
                </div><p className="mt-2 text-[10.5px] text-tinta-3">Pode diferir do relatório fechado acima enquanto chegam novas mensagens.</p></div>
            )}

            {esperando.length > 0 && (
                <section className="mt-4 flex flex-col gap-3 rounded-card border border-vermelho-linha bg-superficie p-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
                    <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                             className="text-vermelho" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                        </svg>
                        <span className="display grow text-[15.5px] font-semibold text-vermelho-texto">
                            {deHoje.length === 0 ? 'Ficou de ontem' : 'Esperando você'}
                        </span>
                        <span className="rounded-full bg-vermelho-sof px-2 py-0.5 text-[11.5px] font-bold text-vermelho">
                            {esperando.length}
                        </span>
                    </div>
                    <p className="text-[12px] text-tinta-2">O cliente falou por último e ninguém respondeu.</p>

                    {esperando.slice(0, ESPERA_VISIVEL).map(cartaoDeEspera)}
                    {esperando.length > ESPERA_VISIVEL && (
                        // O selo conta todos; sem isto, "10" ao lado de quatro
                        // cartões parecia erro de conta.
                        <details className="group flex flex-col gap-2.5">
                            <summary className="cursor-pointer list-none text-center text-[12.5px] font-semibold text-vermelho-texto group-open:hidden">
                                Ver mais {esperando.length - ESPERA_VISIVEL}
                            </summary>
                            <div className="flex flex-col gap-2.5">
                                {esperando.slice(ESPERA_VISIVEL).map(cartaoDeEspera)}
                            </div>
                        </details>
                    )}
                </section>
            )}

            {deHoje.length > 0 && (
                <section className="mt-5 flex flex-col gap-2.5 lg:col-start-1 lg:row-start-2 lg:mt-6">
                    <span className="display text-[15.5px] font-semibold">Conversas de hoje</span>
                    {deHoje.map((c) => {
                        const audios = c.mensagens.filter((m) => m.tipo === 'audio').length;
                        return (
                            <div key={c.id}
                                 className="flex items-center gap-2.5 rounded-[11px] border border-linha bg-superficie px-3.5 py-3">
                                <span className="flex min-w-0 grow flex-col gap-0.5">
                                    <span className="truncate text-[13.5px] font-semibold">
                                        {c.cliente_nome ?? telefoneBonito(c.cliente_telefone)}
                                    </span>
                                    <span className="text-[11.5px] text-tinta-2">
                                        {c.mensagens.length} mensage{c.mensagens.length === 1 ? 'm' : 'ns'}
                                        {audios > 0 && ` · ${audios} de áudio`}
                                    </span>
                                </span>
                                <span className="shrink-0 text-[11.5px] text-tinta-2">
                                    {horaBrasilia(c.ultima_mensagem_em)}
                                </span>
                            </div>
                        );
                    })}
                </section>
            )}
            </div>

            {!relatorio && <p className="mt-5 flex gap-2.5 rounded-[11px] lg:mt-8 border border-linha bg-papel-2 px-3.5 py-3 text-[11.5px] leading-relaxed text-tinta-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                     className="mt-px shrink-0" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                </svg>
                O relatório do dia ainda não fechou. Enquanto isso, estes indicadores vêm direto das suas conversas.
            </p>}
        </main>
        </AppShell>
    );
}
