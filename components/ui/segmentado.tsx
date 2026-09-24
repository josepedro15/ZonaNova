import Link from 'next/link';
import type { Route } from 'next';

/** Troca um parâmetro da URL por link: funciona sem JavaScript e fica no histórico. */
export function Segmentado({ rotulo, opcoes, atual, base, param }: {
    rotulo: string; opcoes: { valor: string; rotulo: string }[]; atual: string; base: string; param: string;
}) {
    return (
        <nav aria-label={rotulo} className="inline-flex rounded-[10px] border border-linha bg-superficie p-[3px]">
            {opcoes.map((o) => (
                <Link key={o.valor} href={`${base}?${param}=${o.valor}` as Route} aria-current={o.valor === atual ? 'page' : undefined}
                      className={`flex min-h-11 items-center rounded-[7px] px-3.5 text-[13px] font-semibold ${o.valor === atual ? 'bg-azul text-white' : 'text-tinta-2 hover:bg-superficie-2'}`}>
                    {o.rotulo}
                </Link>
            ))}
        </nav>
    );
}
