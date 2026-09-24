import type { ReactNode } from 'react';
import { Cartao } from './cartao';

/** Ausência de dado é tela de verdade, nunca nota zero (design/README). */
export function EstadoVazio({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
    return (
        <Cartao variante="tracejado" className="flex flex-col items-start gap-2.5">
            <span aria-hidden="true" className="ml-1 mt-1 inline-block size-[22px] rotate-45 rounded-[5px] border-2 border-azul" />
            <h3 className="display text-base font-bold">{titulo}</h3>
            <div className="text-[13px] leading-relaxed text-tinta-2">{children}</div>
            {acao}
        </Cartao>
    );
}
