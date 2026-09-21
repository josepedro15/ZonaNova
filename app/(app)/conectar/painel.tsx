'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { aceitarMonitoramento, conectarWhatsapp, statusConexao, type EstadoConexao } from '@/app/actions/conexao';

/**
 * Quanto tempo o "WhatsApp conectado" fica à frente antes de a tela seguir
 * para o painel. Conectar é o momento de pagamento de todo o cadastro: mandar
 * embora no mesmo quadro em que o visto aparece faz parecer que algo falhou.
 */
const PAUSA_ANTES_DO_PAINEL_MS = 1800;

/**
 * O QR da UAZAPI expira em cerca de um minuto, e quem está com o celular na
 * mão não sabe disso: fica olhando um quadrado morto. Então a tela reconsulta
 * o status a cada 3s enquanto o QR está à frente, e avisa quando expira em vez
 * de deixar a pessoa tentando.
 */
export default function PainelConexao({ inicial }: { inicial: EstadoConexao }) {
    const [estado, setEstado] = useState<EstadoConexao>(inicial);
    const [pendente, iniciar] = useTransition();
    const [expirou, setExpirou] = useState(false);
    const [aceitou, setAceitou] = useState(false);
    const router = useRouter();

    const aguardando = estado.status === 'aguardando_qr' && !!estado.qrcode;

    useEffect(() => {
        if (!aguardando) return;
        const relogio = setInterval(async () => {
            const s = await statusConexao();
            if (s.status === 'conectada') setEstado(s);
        }, 3000);
        const validade = setTimeout(() => setExpirou(true), 60_000);
        return () => { clearInterval(relogio); clearTimeout(validade); };
    }, [aguardando, estado.qrcode]);

    // Conectado não tem nada que fazer aqui, tenha acabado de escanear o código
    // ou tenha caído nesta URL por engano: a tela segue sozinha para o painel.
    //
    // Não se distingue os dois casos. A distinção existiu por um tempo, para
    // preservar quem viesse pedir outro QR com o número no ar — mas não há
    // botão de desconectar em lugar nenhum, e um número que cai de verdade
    // volta para cá pelo proxy, por causa do `status`. Era uma porta guardada
    // para uma sala que não existe.
    useEffect(() => {
        if (estado.status !== 'conectada') return;
        const saida = setTimeout(() => router.replace('/dashboard'), PAUSA_ANTES_DO_PAINEL_MS);
        return () => clearTimeout(saida);
    }, [estado.status, router]);

    const pedirQr = () => iniciar(async () => {
        setExpirou(false);
        if (estado.precisaAceite) {
            const aceite = await aceitarMonitoramento();
            if (aceite.erro) return setEstado({ ...estado, erro: aceite.erro });
        }
        setEstado(await conectarWhatsapp());
    });

    if (estado.status === 'conectada') {
        return (
            <section className="mt-6 rounded-lg border border-linha bg-superficie p-5">
                <div className="flex items-center gap-2.5">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         className="stroke-verde" strokeWidth="2" strokeLinecap="round">
                        <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span className="display text-[17px] font-semibold">WhatsApp conectado</span>
                </div>
                {estado.numero && (
                    <p className="mt-1.5 text-[13px] text-tinta-2">Número {estado.numero}</p>
                )}
                <p className="mt-3 text-[12.5px] leading-relaxed text-tinta-3">
                    As mensagens novas já entram na análise. O WhatsApp também pode enviar
                    parte do histórico recente em segundo plano. O relatório do dia sai à noite.
                </p>
                {/* Fica sempre, inclusive nos instantes que antecedem o desvio
                    automático: se o router falhar, a tela não volta a ser um
                    beco sem saída. */}
                <Link
                    href="/dashboard"
                    className="display mt-4 flex min-h-[46px] items-center justify-center rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel"
                >
                    Ir para o painel
                </Link>
            </section>
        );
    }

    return (
        <section className="mt-6">
            <h1 className="display text-[25px] font-semibold leading-tight">
                Conecte seu WhatsApp comercial
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-tinta-2">
                Abra o WhatsApp no celular, vá em <strong>Aparelhos conectados</strong> e
                aponte a câmera para o código.
            </p>

            {estado.erro && (
                <p role="alert" className="mt-4 rounded-[10px] border border-vermelho-linha bg-vermelho-sof px-3.5 py-3 text-[12.5px] text-vermelho-texto">
                    {estado.erro}
                </p>
            )}

            {aguardando && (
                <div className="mt-5 flex flex-col items-center gap-3">
                    <div className="rounded-[14px] border border-linha bg-superficie p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={estado.qrcode!.startsWith('data:') ? estado.qrcode! : `data:image/png;base64,${estado.qrcode}`}
                            alt="Código QR para conectar o WhatsApp"
                            width={232} height={232}
                            className={expirou ? 'opacity-25' : ''}
                        />
                    </div>
                    {expirou
                        ? <p className="text-[12.5px] text-ambar-texto">O código expirou. Peça outro.</p>
                        : <p className="text-[12.5px] text-tinta-3">Esperando você ler o código…</p>}
                </div>
            )}

            <button
                type="button" onClick={pedirQr} disabled={pendente || (!!estado.precisaAceite && !aceitou)}
                className="display mt-6 min-h-[50px] w-full rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel disabled:opacity-60"
            >
                {pendente ? 'Preparando…' : aguardando ? 'Gerar outro código' : 'Gerar código'}
            </button>

            {estado.precisaAceite && (
                <label className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-linha-quente bg-ocre-sof px-4 py-3.5 text-[12px] leading-relaxed text-ocre-texto-2">
                    <input type="checkbox" className="mt-0.5" checked={aceitou} onChange={(e) => setAceitou(e.target.checked)} />
                    <span>Estou conectando um número comercial e fui informado de que suas conversas serão armazenadas e analisadas para gestão e treinamento. Grupos, status e contatos bloqueados ficam de fora.</span>
                </label>
            )}

            <div className="mt-4 flex gap-2.5 rounded-[12px] bg-papel-2 px-4 py-3.5">
                <svg className="shrink-0 stroke-tinta-2" width="16" height="16" viewBox="0 0 24 24"
                     fill="none" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                </svg>
                <span className="text-[12.5px] leading-relaxed text-tinta-2">
                    Mensagens novas e o histórico que o próprio WhatsApp disponibilizar podem ser lidos.
                    A importação antiga não é garantida. Grupos, status e contatos bloqueados ficam de fora.
                </span>
            </div>
        </section>
    );
}
