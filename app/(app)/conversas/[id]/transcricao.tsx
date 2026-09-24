import { Icone } from '@/components/ui';
import type { Pedaco } from '@/lib/visual';
import { horaCurta } from '@/lib/contexto-app';

export type Mensagem = {
    id: string; direcao: string; tipo: string; conteudo: string | null;
    transcricao: string | null; automatica: boolean; enviada_em: string;
};

export const textoDaMensagem = (m: Mensagem) =>
    m.tipo === 'audio' ? (m.transcricao ?? '') : (m.conteudo || `[${m.tipo}]`);

const FUSO = 'America/Sao_Paulo';
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

function Texto({ pedacos }: { pedacos: Pedaco[] }) {
    return (
        <>
            {pedacos.map((p, i) => p.grifo === null ? <span key={i}>{p.texto}</span> : (
                <mark key={i} className="rounded-[3px] bg-evidencia-sof px-0.5 text-inherit shadow-[inset_0_-2px_0_var(--color-evidencia)]">
                    {p.texto}<sup className="ml-0.5 text-[10.5px] font-bold not-italic text-atencao-texto">{p.grifo}</sup>
                </mark>
            ))}
        </>
    );
}

/** A conversa como o cliente viu, com os trechos que a análise citou grifados e numerados. */
export function Transcricao({ mensagens, grifos }: { mensagens: Mensagem[]; grifos: Pedaco[][] }) {
    return (
        <div className="flex flex-col gap-3">
            {mensagens.map((m, i) => {
                const novoDia = i === 0 || dia(mensagens[i - 1].enviada_em) !== dia(m.enviada_em);
                const saida = m.direcao === 'saida';
                const bolha = m.automatica
                    ? 'self-end border border-dashed border-linha-campo bg-superficie text-tinta-2 rounded-[13px]'
                    : saida
                        ? 'self-end bg-azul-sof rounded-[13px_13px_4px_13px]'
                        : 'self-start border border-linha bg-fundo rounded-[13px_13px_13px_4px]';
                return (
                    <div key={m.id} className="flex flex-col gap-3">
                        {novoDia && <span className="self-center rounded-full bg-superficie-2 px-3 py-1 text-xs text-tinta-2">{dia(m.enviada_em)}</span>}
                        <div className={`flex max-w-[82%] flex-col gap-1 lg:max-w-[76%] ${saida || m.automatica ? 'self-end items-end' : 'self-start items-start'}`}>
                            <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${bolha}`}>
                                {m.automatica && <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-tinta-3">Mensagem automática · fora da nota</span>}
                                {m.tipo === 'audio' && (
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-tinta-2">
                                        <Icone nome="microfone" tamanho={14} />{m.transcricao ? 'Áudio transcrito' : 'Áudio sem transcrição'}
                                    </span>
                                )}
                                <span className={`whitespace-pre-wrap ${m.tipo === 'audio' ? 'italic' : ''}`}><Texto pedacos={grifos[i]} /></span>
                            </div>
                            <span className="text-[11.5px] text-tinta-3">{horaCurta(m.enviada_em)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
