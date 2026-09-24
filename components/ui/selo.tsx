import type { ReactNode } from 'react';
import type { Tom } from '@/lib/visual';
import { PREENCHIMENTO, SELO } from './tom';

export function Selo({ tom = 'neutro', ponto = false, className = '', children }: {
    tom?: Tom; ponto?: boolean; className?: string; children: ReactNode;
}) {
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${SELO[tom]} ${className}`}>
            {ponto && <span className={`size-[7px] rounded-full ${PREENCHIMENTO[tom]}`} aria-hidden="true" />}
            {children}
        </span>
    );
}
