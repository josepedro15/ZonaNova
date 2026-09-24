import type { ReactNode } from 'react';

/** O losango da marca, em dose pequena. */
export function Losango({ className = '' }: { className?: string }) {
    return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rotate-45 rounded-[1.5px] bg-azul ${className}`} />;
}

export function RotuloSecao({ children, complemento, acao }: { children: ReactNode; complemento?: ReactNode; acao?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Losango />
                <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-azul">{children}</h2>
                {complemento && <span className="text-[12.5px] text-tinta-3">{complemento}</span>}
            </div>
            {acao}
        </div>
    );
}
