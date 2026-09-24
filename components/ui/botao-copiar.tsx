'use client';

import { useState } from 'react';
import { Icone } from './icone';

export function BotaoCopiar({ texto }: { texto: string }) {
    const [copiado, setCopiado] = useState(false);
    return (
        <button type="button" aria-live="polite"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(texto);
                        setCopiado(true);
                        setTimeout(() => setCopiado(false), 2000);
                    } catch {
                        setCopiado(false);
                    }
                }}
                className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-ctl border border-linha bg-superficie px-3 text-[13px] font-semibold text-azul">
            <Icone nome={copiado ? 'check' : 'copiar'} tamanho={14} />{copiado ? 'Copiado' : 'Copiar texto'}
        </button>
    );
}
