import type { ReactNode } from 'react';
import { Cartao } from './cartao';
import { Numero } from './numero';

/** Número nunca vem solto: ou traz comparação, ou uma legenda que o situe. */
export function Kpi({ rotulo, valor, unidade, comparacao, legenda, heroi = false }: {
    rotulo: string; valor: ReactNode; unidade?: string; comparacao?: ReactNode; legenda?: ReactNode; heroi?: boolean;
}) {
    return (
        <Cartao variante={heroi ? 'heroi' : 'padrao'} as="div" className="flex flex-col gap-2">
            <span className={`text-[13px] ${heroi ? 'text-white/75' : 'text-tinta-2'}`}>{rotulo}</span>
            <Numero valor={valor} unidade={unidade} />
            {comparacao}
            {legenda && <span className={`text-[12.5px] ${heroi ? 'text-white/75' : 'text-tinta-3'}`}>{legenda}</span>}
        </Cartao>
    );
}
