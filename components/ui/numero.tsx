import type { ReactNode } from 'react';

const TAMANHO = { md: 'text-[26px]', lg: 'text-[34px]', xl: 'text-[48px] lg:text-[56px]' } as const;

/** Número de KPI: Montserrat, algarismos tabulares, unidade menor e mais apagada. */
export function Numero({ valor, unidade, tamanho = 'lg', className = '' }: {
    valor: ReactNode; unidade?: string; tamanho?: keyof typeof TAMANHO; className?: string;
}) {
    return (
        <span className={`display num font-bold leading-none ${TAMANHO[tamanho]} ${className}`}>
            {valor}
            {unidade && <span className="text-[0.45em] font-semibold opacity-60">{unidade}</span>}
        </span>
    );
}
