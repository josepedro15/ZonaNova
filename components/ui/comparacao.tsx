import type { ReactNode } from 'react';
import { setaDoTom, tomDelta, type Sentido } from '@/lib/visual';
import { TEXTO } from './tom';

/** "▲ 4 acima da sua média": cor e seta saem do sinal e do que é melhorar. */
export function Comparacao({ delta, melhorQuando = 'maior', className = '', children }: {
    delta: number | null; melhorQuando?: Sentido; className?: string; children: ReactNode;
}) {
    const tom = tomDelta(delta, melhorQuando);
    return (
        <span className={`text-[12.5px] font-semibold ${TEXTO[tom]} ${className}`}>
            {delta !== null && <span aria-hidden="true">{setaDoTom(tom)} </span>}{children}
        </span>
    );
}
