import { iniciais } from '@/lib/visual';
import { Icone } from './icone';

export function Avatar({ nome, tamanho = 38 }: { nome: string | null | undefined; tamanho?: 32 | 38 | 48 }) {
    const letras = iniciais(nome);
    return (
        <span aria-hidden="true" style={{ width: tamanho, height: tamanho }}
              className={`display flex shrink-0 items-center justify-center rounded-full bg-superficie-2 font-bold text-azul ${tamanho === 48 ? 'text-base' : 'text-[12.5px]'}`}>
            {letras ?? <Icone nome="pessoa" tamanho={tamanho === 48 ? 20 : 16} />}
        </span>
    );
}
