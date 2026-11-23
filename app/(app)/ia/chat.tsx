'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
// Direto dos arquivos, não do índice '@/components/ui': o índice traz o Shell,
// que consulta o banco (item-ia.tsx) e não pode entrar no navegador.
import { Botao } from '@/components/ui/botao';
import { Cartao } from '@/components/ui/cartao';
import { Selo } from '@/components/ui/selo';
import { criarMonitoramento } from '@/app/actions/monitoramento';
import type { Proposta } from '@/lib/monitoramento';

export type Turno = { papel: 'usuario' | 'ia'; texto: string; propostas?: Proposta[] };

const GUARDA = 'zn-ia-conversa';
const SUGESTOES = [
    'Como foi a nota das negociações nos últimos 7 dias, por vendedor?',
    'Quais foram as 5 piores conversas de ontem e o que deu errado?',
    'A partir de 1º de dezembro, monitora se os vendedores estão mandando as ações de Natal.',
];

const diaCurto = (d: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/** Negrito e links internos; o resto é texto. Nada vira HTML cru. */
function emLinha(texto: string): ReactNode[] {
    const partes: ReactNode[] = [];
    const padrao = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^\s)]*)\)/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    while ((m = padrao.exec(texto))) {
        if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
        if (m[1]) partes.push(<strong key={m.index}>{m[1]}</strong>);
        else partes.push(<Link key={m.index} href={m[3] as Route} className="font-semibold text-azul underline-offset-2 hover:underline">{m[2]}</Link>);
        ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) partes.push(texto.slice(ultimo));
    return partes;
}

function Texto({ texto }: { texto: string }) {
    const blocos: ReactNode[] = [];
    let lista: string[] = [];
    const fecharLista = () => {
        if (!lista.length) return;
        blocos.push(<ul key={`l${blocos.length}`} className="ml-4 list-disc space-y-1">{lista.map((l, i) => <li key={i}>{emLinha(l)}</li>)}</ul>);
        lista = [];
    };
    for (const linha of texto.split('\n')) {
        const item = linha.match(/^\s*[-•*]\s+(.*)$/) ?? linha.match(/^\s*\d+[.)]\s+(.*)$/);
        if (item) { lista.push(item[1]); continue; }
        fecharLista();
        if (linha.trim()) blocos.push(<p key={`p${blocos.length}`}>{emLinha(linha.replace(/^#+\s*/, ''))}</p>);
    }
    fecharLista();
    return <div className="flex flex-col gap-2">{blocos.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

function CartaoProposta({ proposta, papel }: { proposta: Proposta; papel: string }) {
    const router = useRouter();
    const [estado, setEstado] = useState<'aberta' | 'criada' | 'descartada'>('aberta');
    const [erro, setErro] = useState<string | null>(null);
    const [enviando, iniciar] = useTransition();
    const comecar = () => iniciar(async () => {
        setErro(null);
        const r = await criarMonitoramento(proposta);
        if ('erro' in r) { setErro(r.erro); return; }
        setEstado('criada');
        router.refresh();
    });
    return (
        <Cartao className="flex flex-col gap-3 border-azul">
            <div className="flex items-start justify-between gap-2">
                <h3 className="display text-[16px] font-bold">{proposta.titulo}</h3>
                <Selo tom={estado === 'criada' ? 'bom' : 'azul'}>{estado === 'criada' ? 'Monitorando' : 'Proposta'}</Selo>
            </div>
            <dl className="grid gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                <dt className="font-semibold text-tinta-3">O que conta</dt><dd>{proposta.criterio}</dd>
                <dt className="font-semibold text-tinta-3">Período</dt><dd>{diaCurto(proposta.inicio)} a {diaCurto(proposta.fim)}</dd>
                <dt className="font-semibold text-tinta-3">Onde</dt><dd>{proposta.unidade_id ? (papel === 'gestor' ? 'Sua unidade' : 'Uma unidade') : 'A rede toda'}</dd>
                <dt className="font-semibold text-tinta-3">Palavras</dt><dd className="text-tinta-2">{proposta.palavras.join(', ')}</dd>
            </dl>
            {estado === 'aberta' && (
                <div className="flex flex-wrap gap-2">
                    <Botao type="button" onClick={comecar} disabled={enviando}>{enviando ? 'Gravando…' : `Começar a monitorar em ${diaCurto(proposta.inicio)}`}</Botao>
                    <Botao type="button" variante="secundario" onClick={() => setEstado('descartada')} disabled={enviando}>Descartar</Botao>
                </div>
            )}
            {estado === 'criada' && <p className="text-[13.5px] text-bom-texto">Combinado. O card aparece no painel a partir de {diaCurto(proposta.inicio)}.</p>}
            {estado === 'descartada' && <p className="text-[13.5px] text-tinta-3">Descartada. Se quiser, peça outra versão no chat.</p>}
            {erro && <p role="alert" className="text-[13.5px] text-risco-texto">{erro}</p>}
        </Cartao>
    );
}

/** `inicial`: só a vitrine de /dev usa, para mostrar a conversa já andando. */
export function Chat({ nome, papel, inicial = [] }: { nome: string; papel: string; inicial?: Turno[] }) {
    const [turnos, setTurnos] = useState<Turno[]>(inicial);
    const [texto, setTexto] = useState('');
    const [esperando, setEsperando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const fim = useRef<HTMLDivElement>(null);
    const campo = useRef<HTMLTextAreaElement>(null);

    // A conversa sobrevive a abrir uma conversa citada e voltar.
    useEffect(() => {
        try {
            const salvo = sessionStorage.getItem(GUARDA);
            // Lido depois da hidratação: o servidor não tem o sessionStorage.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (salvo) setTurnos(JSON.parse(salvo) as Turno[]);
        } catch { /* sem armazenamento: começa do zero */ }
    }, []);
    useEffect(() => {
        try { sessionStorage.setItem(GUARDA, JSON.stringify(turnos)); } catch { /* idem */ }
        fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [turnos, esperando]);

    async function enviar(pergunta: string) {
        const limpa = pergunta.trim();
        if (!limpa || esperando) return;
        const historico: Turno[] = [...turnos, { papel: 'usuario', texto: limpa }];
        setTurnos(historico);
        setTexto('');
        setErro(null);
        setEsperando(true);
        try {
            const r = await fetch('/api/ia/conversa', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mensagens: historico.slice(-30).map(({ papel: p, texto: t }) => ({ papel: p, texto: t })) }),
            });
            const corpo = await r.json().catch(() => ({})) as { texto?: string; propostas?: Proposta[]; erro?: string };
            if (!r.ok || !corpo.texto) throw new Error(corpo.erro ?? 'Não consegui responder agora. Tente de novo.');
            setTurnos([...historico, { papel: 'ia', texto: corpo.texto, propostas: corpo.propostas }]);
        } catch (e) {
            // A pergunta volta para o campo, para tentar de novo sem redigitar.
            setTurnos(turnos);
            setTexto(limpa);
            setErro(e instanceof Error ? e.message : 'Não consegui responder agora.');
        } finally {
            setEsperando(false);
            campo.current?.focus();
        }
    }

    return (
        <Cartao recuo="nenhum" className="flex min-h-[560px] flex-col">
            <div className="flex flex-1 flex-col gap-4 p-4 lg:p-5" aria-live="polite">
                {turnos.length === 0 && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[15px]">Oi, {nome}. Pergunte sobre as conversas, as notas e os vendedores, ou peça para eu acompanhar uma ação da rede.</p>
                        <div className="flex flex-col gap-2">
                            {SUGESTOES.map((s) => (
                                <button key={s} type="button" onClick={() => enviar(s)}
                                        className="min-h-11 rounded-ctl border border-linha bg-superficie-2 px-3.5 py-2 text-left text-[13.5px] text-tinta-2 hover:border-azul hover:text-azul">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {turnos.map((t, i) => t.papel === 'usuario' ? (
                    <p key={i} className="max-w-[min(620px,92%)] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-azul px-3.5 py-2.5 text-[15px] text-white">{t.texto}</p>
                ) : (
                    <div key={i} className="flex max-w-[min(680px,96%)] flex-col gap-3 self-start text-[15px] leading-relaxed">
                        <span className="text-[12px] font-semibold text-tinta-3">IA</span>
                        <Texto texto={t.texto} />
                        {t.propostas?.map((p, j) => <CartaoProposta key={j} proposta={p} papel={papel} />)}
                    </div>
                ))}
                {esperando && <p className="self-start text-[13.5px] text-tinta-3">Consultando as conversas… pode levar até um minuto.</p>}
                <div ref={fim} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void enviar(texto); }} className="flex flex-col gap-2 border-t border-linha p-3 lg:p-4">
                {erro && <p role="alert" className="text-[13.5px] text-risco-texto">{erro}</p>}
                <label htmlFor="pergunta-ia" className="sr-only">Sua pergunta</label>
                <div className="flex items-end gap-2">
                    <textarea id="pergunta-ia" ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={6000}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
                              placeholder="Pergunte ou explique o que quer acompanhar…"
                              className="min-h-11 flex-1 resize-y rounded-ctl border border-linha-campo bg-superficie px-3 py-2.5 text-[16px] outline-none focus:border-azul" />
                    <Botao type="submit" disabled={esperando || !texto.trim()}>Enviar</Botao>
                </div>
                {turnos.length > 0 && (
                    <button type="button" onClick={() => { setTurnos([]); setErro(null); }} disabled={esperando}
                            className="min-h-11 self-start text-[13px] font-semibold text-tinta-3 hover:text-azul">Começar outra conversa</button>
                )}
            </form>
        </Cartao>
    );
}
