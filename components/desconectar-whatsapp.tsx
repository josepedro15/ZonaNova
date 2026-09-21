'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { desconectarWhatsapp } from '@/app/actions/conexao';

export default function DesconectarWhatsapp() {
    const [confirmando, setConfirmando] = useState(false);
    const [erro, setErro] = useState<string>();
    const [pendente, iniciar] = useTransition();
    const router = useRouter();

    if (!confirmando) {
        return <button onClick={() => setConfirmando(true)} className="text-[13px] font-semibold text-vermelho">Desconectar este número</button>;
    }

    return (
        <div className="rounded-[10px] border border-vermelho-linha bg-vermelho-sof p-3.5">
            <p className="text-[12.5px] leading-relaxed text-vermelho-texto">Novas conversas deixarão de ser capturadas. O histórico existente será preservado.</p>
            {erro && <p role="alert" className="mt-2 text-[12px] text-vermelho">{erro}</p>}
            <div className="mt-3 flex gap-2">
                <button disabled={pendente} onClick={() => iniciar(async () => {
                    const r = await desconectarWhatsapp();
                    if (r.erro) return setErro(r.erro);
                    router.replace('/conectar');
                })} className="rounded-[9px] bg-vermelho px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60">
                    {pendente ? 'Desconectando…' : 'Confirmar'}
                </button>
                <button disabled={pendente} onClick={() => setConfirmando(false)} className="rounded-[9px] border border-linha bg-superficie px-3 py-2 text-[12px] font-semibold">Cancelar</button>
            </div>
        </div>
    );
}
