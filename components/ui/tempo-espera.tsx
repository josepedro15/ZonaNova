import { esperaEmTexto } from '@/lib/painel';
import { tomEspera } from '@/lib/visual';
import { SELO } from './tom';

export function TempoEspera({ ms, prefixo }: { ms: number; prefixo?: string }) {
    return (
        <span className={`whitespace-nowrap rounded-ctl px-2.5 py-1 text-[12.5px] font-bold ${SELO[tomEspera(ms)]}`}>
            {prefixo && `${prefixo} `}{esperaEmTexto(ms)}
        </span>
    );
}
