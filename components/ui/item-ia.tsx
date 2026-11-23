import Link from 'next/link';
import { iaLiberada } from '@/lib/ia-acesso';
import { Icone } from './icone';

/**
 * "Conversar com a IA" no menu, só para quem está liberado (0037). No
 * computador é um item da barra lateral; no celular, um ícone no topo, porque
 * a barra de baixo só cabe cinco.
 */
export async function ItemIa({ atual, compacto = false }: { atual: string; compacto?: boolean }) {
    if (!(await iaLiberada())) return null;
    const ativo = atual === '/ia';
    if (compacto) {
        return (
            <Link href="/ia" aria-label="Conversar com a IA" aria-current={ativo ? 'page' : undefined}
                  className={`flex size-11 items-center justify-center ${ativo ? 'text-azul-2' : 'text-azul'}`}>
                <Icone nome="faisca" />
            </Link>
        );
    }
    return (
        <Link href="/ia" aria-current={ativo ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition ${ativo ? 'bg-white/13 font-semibold text-white' : 'font-medium text-white/75 hover:bg-white/8 hover:text-white'}`}>
            <Icone nome="faisca" />
            Conversar com a IA
            {ativo && <span aria-hidden="true" className="ml-auto size-[7px] rotate-45 rounded-[1.5px] bg-verde-marca" />}
        </Link>
    );
}
