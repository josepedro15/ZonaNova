import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Icone } from './icone';

export function CabecalhoPagina({ sobre, titulo, acoes, voltar }: {
    sobre?: ReactNode; titulo: ReactNode; acoes?: ReactNode; voltar?: { href: Route; rotulo: string };
}) {
    return (
        <header className="flex flex-col gap-3">
            {voltar && (
                <Link href={voltar.href} className="flex min-h-11 items-center gap-1.5 self-start text-[13px] font-semibold text-azul">
                    <Icone nome="seta_esquerda" tamanho={14} />{voltar.rotulo}
                </Link>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    {sobre && <p className="text-[13.5px] text-tinta-3">{sobre}</p>}
                    <h1 className="display mt-1.5 text-[26px] font-bold lg:text-[32px]">{titulo}</h1>
                </div>
                {acoes && <div className="flex flex-wrap items-center gap-2.5">{acoes}</div>}
            </div>
        </header>
    );
}
