import Link from 'next/link';
import type { Route } from 'next';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icone } from './icone';

const VARIANTE = {
    primario: 'bg-azul px-4 text-white hover:bg-azul-2',
    secundario: 'border border-linha bg-superficie px-4 text-azul hover:bg-superficie-2',
    texto: 'text-azul hover:text-azul-2',
} as const;
const BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl text-[13.5px] font-semibold transition disabled:opacity-50';

export function Botao({ variante = 'primario', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTE }) {
    return <button className={`${BASE} ${VARIANTE[variante]} ${className}`} {...props} />;
}

/** `externo` abre em outra aba (WhatsApp) e ganha o ícone de saída. */
export function BotaoLink({ href, externo = false, variante = 'primario', className = '', children }: {
    href: string; externo?: boolean; variante?: keyof typeof VARIANTE; className?: string; children: ReactNode;
}) {
    const classe = `${BASE} ${VARIANTE[variante]} ${className}`;
    if (externo) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className={classe}>{children}<Icone nome="externo" tamanho={14} /></a>;
    }
    return <Link href={href as Route} className={classe}>{children}</Link>;
}
