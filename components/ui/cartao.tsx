import type { HTMLAttributes, ReactNode } from 'react';

const VARIANTE = {
    padrao: 'border border-linha bg-superficie',
    heroi: 'bg-azul text-white',
    suave: 'bg-azul-sof',
    tracejado: 'border border-dashed border-linha-campo bg-superficie',
    risco: 'bg-risco-sof',
    atencao: 'bg-atencao-sof',
} as const;

export function Cartao({
    variante = 'padrao', recuo = 'normal', as: Tag = 'section', className = '', children, ...resto
}: {
    variante?: keyof typeof VARIANTE;
    recuo?: 'normal' | 'nenhum';
    as?: 'section' | 'div' | 'aside' | 'article';
    className?: string;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
    return (
        <Tag className={`rounded-card ${VARIANTE[variante]} ${recuo === 'normal' ? 'p-4 lg:p-5' : ''} ${className}`} {...resto}>
            {children}
        </Tag>
    );
}
