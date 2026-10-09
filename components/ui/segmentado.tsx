import Link from 'next/link';
import type { Route } from 'next';

/**
 * Troca um parâmetro da URL por link: funciona sem JavaScript e fica no
 * histórico. `manter` são os outros parâmetros da tela (um filtro já
 * escolhido), que o link leva junto.
 */
export function Segmentado({ rotulo, opcoes, atual, base, param, manter = {} }: {
    rotulo: string; opcoes: { valor: string; rotulo: string }[]; atual: string; base: string; param: string; manter?: Record<string, string | undefined>;
}) {
    const fixos = Object.entries(manter).filter((e): e is [string, string] => !!e[1] && e[0] !== param);
    return (
        <nav aria-label={rotulo} className="inline-flex rounded-[10px] border border-linha bg-superficie p-[3px]">
            {opcoes.map((o) => (
                <Link key={o.valor} href={`${base}?${new URLSearchParams([...fixos, [param, o.valor]])}` as Route} aria-current={o.valor === atual ? 'page' : undefined}
                      className={`flex min-h-11 items-center rounded-[7px] px-3.5 text-[13px] font-semibold ${o.valor === atual ? 'bg-azul text-white' : 'text-tinta-2 hover:bg-superficie-2'}`}>
                    {o.rotulo}
                </Link>
            ))}
        </nav>
    );
}
