import Link from 'next/link';
import type { ReactNode } from 'react';
import {
    Avatar, Barra, BotaoLink, Cartao, Comparacao, Icone, Kpi, Numero, Selo, SerieDias, Tabela, TEXTO, TempoEspera,
    type DiaSerie,
} from '@/components/ui';
import { comparaTempo, setaDoTom, tomDelta, tomEspera, tomFaixa } from '@/lib/visual';
import { ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { esperaDoCliente, esperaEmTexto, semTelefone, telefoneBonito, type Msg } from '@/lib/painel';
import { dataCurtaBrasilia, horaBrasilia } from './formato';

export type ConversaComMensagens = {
    id: string;
    cliente_nome: string | null;
    cliente_telefone: string;
    ultima_mensagem_em: string;
    mensagens: (Msg & { tipo: string; conteudo: string | null })[];
};

export type RelatorioDiario = {
    data_ref: string;
    score_geral: number | null;
    leads_atendidos: number;
    conversoes_confirmadas: number;
    oportunidades_perdidas: number;
    tempo_medio_resposta_s: number | null;
    taxa_resposta: number | null;
    payload: Record<string, unknown> | null;
};

export type AderenciaDia = { data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };
export type Coaching = { resumo?: string; melhorias?: string[]; elogio?: string; desafio?: string };

/**
 * Quem espera há quatro horas quer resposta, e resposta acontece no WhatsApp:
 * o wa.me abre aquela conversa no celular. Contato `@lid` não tem telefone, e
 * um wa.me com aqueles dígitos abriria uma pessoa qualquer; aí vai para a conversa.
 */
function destinoDaEspera(c: ConversaComMensagens): { href: string; target?: string; rel?: string } {
    return semTelefone(c.cliente_telefone)
        ? { href: `/conversas/${c.id}` }
        : { href: `https://wa.me/${c.cliente_telefone.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener noreferrer' };
}

/** A última coisa que o cliente disse, para o item da fila ter contexto. */
function ultimaFalaDoCliente(c: ConversaComMensagens): string {
    const dele = c.mensagens.filter((m) => m.direcao === 'entrada').sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const ultima = dele[dele.length - 1];
    if (!ultima) return '';
    if (ultima.tipo === 'audio') return 'Áudio';
    if (ultima.tipo !== 'texto') return ultima.tipo;
    const texto = (ultima.conteudo ?? '').trim();
    return texto.length > 60 ? `"${texto.slice(0, 60)}…"` : `"${texto}"`;
}

const nomeDaConversa = (c: ConversaComMensagens) => c.cliente_nome ?? telefoneBonito(c.cliente_telefone);

export function AvisoConexao({ conexao }: { conexao: { ultimo_evento_em: string | null } | null }) {
    return (
        <Cartao variante="risco" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Icone nome="alerta" tamanho={22} className="shrink-0 text-risco" />
            <div className="flex grow flex-col gap-1">
                <span className="display text-[17px] font-bold text-risco-texto">{conexao ? 'Seu WhatsApp saiu do ar' : 'Nenhum WhatsApp conectado'}</span>
                <span className="text-[13px] text-risco-texto">
                    Nada está sendo lido nem analisado{conexao?.ultimo_evento_em && ` desde ${horaBrasilia(conexao.ultimo_evento_em)}`}.
                </span>
            </div>
            <BotaoLink href="/conectar">Reconectar agora</BotaoLink>
        </Cartao>
    );
}

export function AvisoAprovacoes({ pendentes }: { pendentes: number }) {
    return (
        <Link href="/aprovacoes" className="flex min-h-11 items-center justify-between rounded-card border border-linha bg-superficie p-5">
            <span className="flex flex-col"><span className="display text-[15px] font-bold">Aprovações</span>
                <span className="text-[12.5px] text-tinta-3">{pendentes ? `${pendentes} esperando você` : 'ninguém esperando'}</span></span>
            {pendentes > 0 && <Selo tom="azul">{pendentes}</Selo>}
        </Link>
    );
}

const VISIVEIS = 5;

function ItemEspera({ conversa, espera }: { conversa: ConversaComMensagens; espera: number }) {
    const destino = destinoDaEspera(conversa);
    return (
        <li className="border-t border-linha-2">
            <a {...destino} className="flex min-h-11 items-center gap-3.5 py-3 text-tinta">
                <Avatar nome={conversa.cliente_nome} />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{nomeDaConversa(conversa)}</span>
                    <span className="truncate text-[13px] text-tinta-3">{ultimaFalaDoCliente(conversa)}</span>
                </span>
                <TempoEspera ms={espera} />
                <span className="hidden items-center gap-1.5 rounded-ctl border border-linha px-3 py-2 text-[12.5px] font-semibold text-azul sm:inline-flex">
                    Responder<Icone nome={destino.target ? 'externo' : 'seta_direita'} tamanho={14} />
                </span>
            </a>
        </li>
    );
}

export function EsperandoVoce({ className = '', titulo, esperando }: {
    className?: string; titulo: string; esperando: { conversa: ConversaComMensagens; espera: number }[];
}) {
    return (
        <Cartao className={`flex flex-col gap-2 ${className}`}>
            <div>
                <h3 className="display flex items-center gap-2.5 text-lg font-bold">{titulo}{esperando.length > 0 && <Selo tom="risco">{esperando.length}</Selo>}</h3>
                <p className="mt-1 text-[13px] text-tinta-3">
                    {esperando.length ? 'O cliente falou por último e ninguém respondeu. Quem espera há mais tempo vem primeiro.' : 'Ninguém esperando resposta agora.'}
                </p>
            </div>
            {esperando.length > 0 && <ul className="flex flex-col">{esperando.slice(0, VISIVEIS).map((e) => <ItemEspera key={e.conversa.id} {...e} />)}</ul>}
            {esperando.length > VISIVEIS && (
                // O selo conta todos; sem isto, "20" ao lado de cinco itens parecia erro de conta.
                <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-azul group-open:hidden">
                        Ver os outros {esperando.length - VISIVEIS}<Icone nome="seta_direita" tamanho={14} />
                    </summary>
                    <ul className="flex flex-col">{esperando.slice(VISIVEIS).map((e) => <ItemEspera key={e.conversa.id} {...e} />)}</ul>
                </details>
            )}
        </Cartao>
    );
}

function LinhaHoje({ rotulo, detalhe, valor, children }: { rotulo: string; detalhe?: ReactNode; valor: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex flex-col gap-2.5 border-t border-linha-2 py-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1"><span className="text-[13px] text-tinta-2">{rotulo}</span>{detalhe && <span className="text-[12.5px] text-tinta-3">{detalhe}</span>}</div>
                {valor}
            </div>
            {children}
        </div>
    );
}

export function HojeAteAgora({ className = '', conversas, respostaMedia, respostaOntemMin, taxa, respondidos, escreveram, mediaLeads, ligado }: {
    className?: string; conversas: number; respostaMedia: number | null; respostaOntemMin: number | null;
    taxa: number | null; respondidos: number; escreveram: number; mediaLeads: number | null; ligado: boolean;
}) {
    if (conversas === 0) {
        // Ausência de dado, nunca nota zero — design/README.
        return (
            <Cartao variante="tracejado" className={`flex flex-col gap-2 ${className}`}>
                <h3 className="display text-lg font-bold">Sem movimento hoje</h3>
                <p className="text-[13px] leading-relaxed text-tinta-2">
                    {ligado
                        ? 'Nenhuma conversa nova. Seu número está conectado e ouvindo — quando um cliente chamar, ele aparece aqui.'
                        : 'Nenhuma conversa nova, e o número está fora do ar. Reconecte para voltar a receber.'}
                </p>
                <p className="text-xs leading-relaxed text-tinta-3">Dia sem conversa não vira nota. Isto é ausência de dado, não desempenho ruim.</p>
            </Cartao>
        );
    }
    return (
        <Cartao className={`flex flex-col ${className}`}>
            <h3 className="display mb-2 text-lg font-bold">Hoje até agora</h3>
            <LinhaHoje rotulo="Conversas" detalhe={mediaLeads === null ? undefined : `sua média: ${Math.round(mediaLeads)} leads por dia`} valor={<Numero valor={conversas} />} />
            <LinhaHoje rotulo="Resposta média"
                       detalhe={respostaMedia !== null && respostaOntemMin !== null
                           ? <Comparacao delta={respostaMedia - respostaOntemMin} melhorQuando="menor">{comparaTempo(respostaMedia, respostaOntemMin, 'ontem')}</Comparacao>
                           : undefined}
                       valor={<Numero valor={respostaMedia ?? '—'} unidade={respostaMedia === null ? undefined : ' min'} />} />
            <LinhaHoje rotulo="Clientes respondidos" detalhe={escreveram > 0 ? `${respondidos} de ${escreveram} que escreveram hoje` : undefined}
                       valor={<Numero valor={taxa ?? '—'} unidade={taxa === null ? undefined : '%'} />}>
                {taxa !== null && <Barra pct={taxa} rotulo="Clientes respondidos" />}
            </LinhaHoje>
            <p className="mt-auto rounded-[10px] bg-fundo px-3.5 py-3 text-[12.5px] leading-relaxed text-tinta-2">
                Números ao vivo. A nota de hoje sai no fechamento, às 00h30.
            </p>
        </Cartao>
    );
}

export function RelatorioDoDia({ relatorio, variacao, historico, mediaLeads, mediaRespostaMin }: {
    relatorio: RelatorioDiario; variacao: number | null; historico: DiaSerie[]; mediaLeads: number | null; mediaRespostaMin: number | null;
}) {
    const nota = relatorio.score_geral == null ? null : Math.round(Number(relatorio.score_geral));
    const respostaMin = relatorio.tempo_medio_resposta_s == null ? null : Math.round(Number(relatorio.tempo_medio_resposta_s) / 60);
    return (
        <div className="grid gap-5 lg:grid-cols-12">
            <Cartao variante="heroi" className="flex flex-col gap-3.5 lg:col-span-4">
                <span className="text-[13px] text-white/75">Sua nota</span>
                {nota === null ? (
                    <>
                        <span className="display text-2xl font-bold">Não teve nota</span>
                        <span className="text-[12.5px] leading-relaxed text-white/75">Só houve suporte e conversa social. Isso não conta contra você.</span>
                    </>
                ) : (
                    <>
                        <span className="flex items-baseline gap-1.5"><Numero valor={nota} tamanho="xl" /><span className="text-base text-white/60">/100</span></span>
                        {variacao !== null && (
                            <span className="self-start rounded-full bg-white/12 px-2.5 py-1 text-[12.5px] font-semibold">
                                {setaDoTom(tomDelta(variacao, 'maior'))} {variacao === 0 ? 'igual à sua média de 7 dias' : `${Math.abs(variacao)} ${variacao > 0 ? 'acima' : 'abaixo'} da sua média de 7 dias`}
                            </span>
                        )}
                    </>
                )}
                <SerieDias dias={historico} invertida />
                <span className="text-xs leading-relaxed text-white/65">14 dias. Tracejado: dia só com suporte ou social, sem nota. Só negociação entra na nota.</span>
            </Cartao>
            <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:gap-5">
                <Kpi rotulo="Leads atendidos" valor={relatorio.leads_atendidos} legenda={mediaLeads === null ? undefined : `sua média: ${Math.round(mediaLeads)} por dia`} />
                <Kpi rotulo="Conversões" valor={relatorio.conversoes_confirmadas} legenda="identificadas pela IA na conversa" />
                <Kpi rotulo="Oportunidades perdidas" valor={relatorio.oportunidades_perdidas}
                     legenda={<Link href="/conversas" className="font-semibold text-azul">Ver conversas →</Link>} />
                <Kpi rotulo="Resposta média" valor={respostaMin ?? '—'} unidade={respostaMin === null ? undefined : ' min'}
                     comparacao={respostaMin !== null && mediaRespostaMin !== null
                         ? <Comparacao delta={respostaMin - Math.round(mediaRespostaMin)} melhorQuando="menor">{comparaTempo(respostaMin, mediaRespostaMin)}</Comparacao>
                         : undefined} />
            </div>
        </div>
    );
}

export function Treino({ className = '', coaching }: { className?: string; coaching: Coaching }) {
    return (
        <Cartao variante="suave" className={`flex flex-col gap-4 ${className}`}>
            <div>
                <span className="text-xs font-bold uppercase tracking-[0.09em] text-azul">Seu treino de hoje</span>
                {coaching.resumo && <p className="display mt-2 text-[17px] font-bold leading-snug">{coaching.resumo}</p>}
            </div>
            {!!coaching.melhorias?.length && (
                <ol className="grid gap-3 lg:grid-cols-3">
                    {coaching.melhorias.map((m, i) => (
                        <li key={m} className="flex gap-3 rounded-[10px] bg-superficie p-4 lg:flex-col">
                            <span className="display flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-azul text-[13px] font-bold text-white">{i + 1}</span>
                            <span className="text-[13.5px] leading-snug">{m}</span>
                        </li>
                    ))}
                </ol>
            )}
            {(coaching.elogio || coaching.desafio) && (
                <div className="grid gap-3 lg:grid-cols-2">
                    {coaching.elogio && <p className="text-[13px] leading-relaxed"><strong className="text-azul">O que funcionou:</strong> {coaching.elogio}</p>}
                    {coaching.desafio && <p className="text-[13px] leading-relaxed"><strong className="text-azul">Desafio:</strong> {coaching.desafio}</p>}
                </div>
            )}
        </Cartao>
    );
}

export function MecResumo({ className = '', aderencia }: { className?: string; aderencia: AderenciaDia | null }) {
    const geral = aderencia?.aderencia_geral == null ? null : Math.round(Number(aderencia.aderencia_geral));
    return (
        <Cartao className={`flex flex-col gap-3 ${className}`}>
            <div className="flex items-baseline justify-between">
                <h3 className="display text-lg font-bold">Seu MEC</h3>
                <Numero valor={geral ?? '—'} unidade={geral === null ? undefined : '%'} tamanho="md" />
            </div>
            {aderencia ? (
                <ul className="flex flex-col gap-2.5">
                    {ETAPAS.map((e) => {
                        const bruto = aderencia.por_etapa?.[e];
                        const pct = bruto == null ? null : Math.round(Number(bruto));
                        const tom = pct === null ? 'neutro' : tomFaixa(pct, 35, 50);
                        return (
                            <li key={e} className="grid grid-cols-[118px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]">
                                <span className={pct === null ? 'text-tinta-3' : ''}>{NOMES_ETAPA[e]}</span>
                                <Barra pct={pct} tom={tom} rotulo={NOMES_ETAPA[e]} />
                                <span className={`text-right ${pct === null ? 'text-tinta-3' : `font-semibold ${tom === 'azul' ? '' : TEXTO[tom]}`}`}>{pct === null ? '—' : `${pct}%`}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="text-[13px] text-tinta-3">A aderência aparece depois do primeiro relatório analisado.</p>
            )}
            <Link href="/meu-mec" className="mt-auto flex min-h-11 items-center text-[13px] font-semibold text-azul">Ver as sete etapas →</Link>
        </Cartao>
    );
}

export function DoGestor({ observacoes }: { observacoes: { id: string; texto: string; created_at: string }[] }) {
    return (
        <Cartao className="flex flex-col gap-3">
            <h3 className="display text-lg font-bold">Do seu gestor</h3>
            <ul className="flex flex-col gap-3">
                {observacoes.map((o) => (
                    <li key={o.id} className="text-[13.5px] leading-relaxed">
                        <span className="whitespace-pre-line">{o.texto}</span>
                        <span className="mt-0.5 block text-xs text-tinta-3">{dataCurtaBrasilia(o.created_at)}</span>
                    </li>
                ))}
            </ul>
        </Cartao>
    );
}

export function ConversasDeHoje({ conversas, agora }: { conversas: ConversaComMensagens[]; agora: Date }) {
    return (
        <Tabela titulo="Conversas de hoje" vazio="Nenhuma conversa hoje ainda."
                acao={<Link href="/conversas" className="flex min-h-11 items-center text-[13px] font-semibold text-azul">Todas as conversas →</Link>}
                colunas={['Cliente', 'Mensagens', 'Áudios', 'Última', 'Situação']}
                grade="minmax(0,2.2fr) repeat(3,minmax(0,0.8fr)) minmax(0,1.4fr)"
                linhas={conversas.map((c) => {
                    const espera = esperaDoCliente(c.mensagens, agora);
                    const audios = c.mensagens.filter((m) => m.tipo === 'audio').length;
                    const situacao = espera === null
                        ? <Selo tom="bom">Respondida</Selo>
                        : <Selo tom={tomEspera(espera)}>Esperando {esperaEmTexto(espera)}</Selo>;
                    return {
                        chave: c.id,
                        href: `/conversas/${c.id}`,
                        celulas: [
                            <span key="n" className="font-semibold">{nomeDaConversa(c)}</span>,
                            <span key="m" className="num">{c.mensagens.length}</span>,
                            <span key="a" className="num">{audios}</span>,
                            <span key="u" className="num">{horaBrasilia(c.ultima_mensagem_em)}</span>,
                            situacao,
                        ],
                        resumo: (
                            <span className="flex items-center gap-3">
                                <span className="flex min-w-0 grow flex-col gap-0.5">
                                    <span className="truncate text-sm font-semibold">{nomeDaConversa(c)}</span>
                                    <span className="text-xs text-tinta-3">{c.mensagens.length} mensagens · {audios} áudios · {horaBrasilia(c.ultima_mensagem_em)}</span>
                                </span>
                                {situacao}
                            </span>
                        ),
                    };
                })} />
    );
}
