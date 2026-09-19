'use client';

import { useActionState, useState } from 'react';
import { aprovarCadastro, recusarCadastro, type Resultado } from '@/app/actions/auth';

const inicial: Resultado = {};

export default function Decisao({ profileId, podeCriarGestor }: {
    profileId: string;
    podeCriarGestor: boolean;
}) {
    const [aprovado, aprovar, aprovando] = useActionState(aprovarCadastro, inicial);
    const [recusado, recusar, recusando] = useActionState(recusarCadastro, inicial);
    const [confirmandoRecusa, setConfirmandoRecusa] = useState(false);

    const erro = aprovado.erro ?? recusado.erro;
    const ocupado = aprovando || recusando;

    return (
        <div className="mt-6 flex flex-col gap-3">
            {erro && (
                <p role="alert" className="rounded-[10px] border border-vermelho-linha bg-vermelho-sof px-3.5 py-3 text-[12.5px] text-vermelho-texto">
                    {erro}
                </p>
            )}

            <form action={aprovar} className="flex flex-col gap-3">
                <input type="hidden" name="profileId" value={profileId} />
                {podeCriarGestor && (
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-tinta-2">Papel</span>
                        <select name="papel" defaultValue="vendedor"
                                className="min-h-[44px] rounded-[10px] border border-linha-campo bg-superficie px-3 text-sm">
                            <option value="vendedor">Vendedor</option>
                            <option value="gestor">Gestor da unidade</option>
                        </select>
                    </label>
                )}
                <button type="submit" disabled={ocupado}
                        className="display min-h-[48px] rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel disabled:opacity-60">
                    {aprovando ? 'Aprovando…' : 'Aprovar e liberar acesso'}
                </button>
            </form>

            {!confirmandoRecusa ? (
                <button type="button" onClick={() => setConfirmandoRecusa(true)} disabled={ocupado}
                        className="min-h-[44px] rounded-[11px] border border-linha text-sm font-medium text-tinta-2">
                    Recusar
                </button>
            ) : (
                // Recusar é irreversível pela tela: pede confirmação e um motivo,
                // que fica em eventos_admin junto com o nome de quem recusou.
                <form action={recusar} className="flex flex-col gap-2 rounded-[12px] border border-vermelho-linha bg-vermelho-sof p-3.5">
                    <input type="hidden" name="profileId" value={profileId} />
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-vermelho-texto">Por que recusar? (opcional)</span>
                        <input name="motivo" maxLength={300} placeholder="ex.: não trabalha na unidade"
                               className="min-h-[42px] rounded-[10px] border border-vermelho-linha bg-superficie px-3 text-sm" />
                    </label>
                    <div className="flex gap-2">
                        <button type="submit" disabled={ocupado}
                                className="min-h-[42px] flex-1 rounded-[10px] bg-vermelho text-sm font-semibold text-papel disabled:opacity-60">
                            {recusando ? 'Recusando…' : 'Confirmar recusa'}
                        </button>
                        <button type="button" onClick={() => setConfirmandoRecusa(false)}
                                className="min-h-[42px] rounded-[10px] px-4 text-sm text-tinta-2">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            <p className="text-center text-[11.5px] text-tinta-3">Fica registrado com seu nome e a hora.</p>
        </div>
    );
}
