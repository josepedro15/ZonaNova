import { Barra, Cartao } from '@/components/ui';
import type { ContagemObjecao } from '@/lib/derivacoes';

/** As objeções da loja nos últimos 7 dias, a mais citada primeiro. */
export function ObjecoesDaSemana({ objecoes }: { objecoes: readonly ContagemObjecao[] }) {
    const maior = objecoes[0]?.total ?? 1;
    return (
        <Cartao className="flex flex-col gap-3">
            <h2 className="display text-lg font-bold">Objeções da semana</h2>
            {objecoes.length === 0 ? (
                <p className="text-[13px] text-tinta-3">Nenhuma objeção registrada nos últimos 7 dias.</p>
            ) : objecoes.map((o) => (
                // O nome inteiro em cima da barra: numa coluna de 120px ele
                // virava "Cliente já compro…" e ninguém sabia qual era a objeção.
                <div key={o.objecao} className="flex flex-col gap-1.5 text-[13px]">
                    <div className="flex items-start justify-between gap-3">
                        <span className="leading-snug">{o.objecao}</span>
                        <span className="display num shrink-0 text-sm font-bold">{o.total}</span>
                    </div>
                    <Barra pct={(o.total / maior) * 100} rotulo={o.objecao} />
                </div>
            ))}
        </Cartao>
    );
}
