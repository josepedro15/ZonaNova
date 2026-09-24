import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './icone';

const FUNDO = { risco: 'bg-risco-sof', atencao: 'bg-atencao-sof', azul: 'bg-azul-sof' } as const;
const ICONE = { risco: 'text-risco', atencao: 'text-atencao', azul: 'text-azul' } as const;
const TITULO = { risco: 'text-risco-texto', atencao: 'text-atencao-texto', azul: 'text-tinta' } as const;
const ACAO = { risco: 'text-risco-texto', atencao: 'text-atencao-texto', azul: 'text-azul' } as const;

export function Alerta({ tom, icone, titulo, children, acao }: {
    tom: keyof typeof FUNDO; icone: NomeIcone; titulo: string; children?: ReactNode; acao?: { href: string; rotulo: string };
}) {
    return (
        <div className={`flex items-center gap-3.5 rounded-card p-4 ${FUNDO[tom]}`}>
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-superficie ${ICONE[tom]}`}>
                <Icone nome={icone} />
            </span>
            <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className={`text-sm font-bold ${TITULO[tom]}`}>{titulo}</span>
                {children && <span className="text-[12.5px] leading-snug text-tinta-2">{children}</span>}
            </div>
            {acao && (
                <Link href={acao.href as Route} className={`flex min-h-11 shrink-0 items-center text-[13px] font-bold ${ACAO[tom]}`}>
                    {acao.rotulo}
                </Link>
            )}
        </div>
    );
}
