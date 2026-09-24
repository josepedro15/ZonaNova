import type { Tom } from '@/lib/visual';
import { PREENCHIMENTO } from './tom';

/** Barra de progresso. `null` é "sem dado": fica tracejada, nunca vazia como se fosse zero. */
export function Barra({ pct, tom = 'azul', rotulo }: { pct: number | null; tom?: Tom; rotulo: string }) {
    if (pct === null) {
        return <span role="img" aria-label={`${rotulo}: sem dado`} className="block h-1.5 rounded-full border border-dashed border-linha-campo" />;
    }
    const largura = Math.max(0, Math.min(100, pct));
    return (
        <span role="img" aria-label={`${rotulo}: ${Math.round(largura)}%`} className="block h-1.5 overflow-hidden rounded-full bg-linha-2">
            <span className={`block h-full rounded-full ${PREENCHIMENTO[tom]}`} style={{ width: `${largura}%` }} />
        </span>
    );
}
