'use client';

import { useEffect, useState, useTransition } from 'react';
import { conectarWhatsapp, statusConexao, type EstadoConexao } from '@/app/actions/conexao';

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

    const pedirQr = () => iniciar(async () => {
        setExpirou(false);
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
                    Suas conversas passam a ser analisadas a partir de agora. O relatório
                    do dia sai à noite.
                </p>
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
                type="button" onClick={pedirQr} disabled={pendente}
                className="display mt-6 min-h-[50px] w-full rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel disabled:opacity-60"
            >
                {pendente ? 'Preparando…' : aguardando ? 'Gerar outro código' : 'Gerar código'}
            </button>

            <div className="mt-4 flex gap-2.5 rounded-[12px] bg-papel-2 px-4 py-3.5">
                <svg className="shrink-0 stroke-tinta-2" width="16" height="16" viewBox="0 0 24 24"
                     fill="none" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                </svg>
                <span className="text-[12.5px] leading-relaxed text-tinta-2">
                    Só as conversas do seu número comercial são lidas. Conversa de grupo e
                    status ficam de fora, e você pode marcar contatos para nunca analisar.
                </span>
            </div>
        </section>
    );
}
