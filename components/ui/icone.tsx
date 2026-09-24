import type { ReactNode } from 'react';

const TRACOS = {
    casa: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    conversa: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    tendencia: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
    mec: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" /></>,
    pessoa: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
    equipe: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" /><circle cx="17" cy="9" r="2.8" /><path d="M16.5 14.2c2.4.2 4.2 1.8 5 4.3" /></>,
    rede: <><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M9 21v-6h6v6" /></>,
    relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    seta_direita: <path d="M9 6l6 6-6 6" />,
    seta_esquerda: <path d="M15 6l-6 6 6 6" />,
    externo: <path d="M7 17L17 7M9 7h8v8" />,
    sair: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />,
    check: <path d="M20 6L9 17l-5-5" />,
    engrenagem: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
    lampada: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
    wifi: <path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0M12 19.5h.01" />,
    wifi_off: <><path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0M12 19.5h.01" /><path d="M3 3l18 18" /></>,
    copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
    alerta: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></>,
    operacao: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    lista: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    microfone: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    cadastro: <><circle cx="10" cy="8" r="3.6" /><path d="M3 20c1.3-3.4 3.9-5.2 7-5.2 1.3 0 2.5.3 3.5.9" /><path d="M18 14v6M15 17h6" /></>,
} satisfies Record<string, ReactNode>;

export type NomeIcone = keyof typeof TRACOS;

/** Conjunto fechado de ícones de traço. Ícone novo entra aqui, nunca solto numa página. */
export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
    return (
        <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
            {TRACOS[nome]}
        </svg>
    );
}
