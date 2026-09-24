import type { Tom } from '@/lib/visual';

// Classes escritas por extenso: o Tailwind só gera o que encontra literal no código.
export const SELO: Record<Tom, string> = {
    bom: 'bg-bom-sof text-bom-texto',
    atencao: 'bg-atencao-sof text-atencao-texto',
    risco: 'bg-risco-sof text-risco-texto',
    neutro: 'bg-superficie-2 text-tinta-2',
    azul: 'bg-azul-sof text-azul',
};

export const TEXTO: Record<Tom, string> = {
    bom: 'text-bom-texto',
    atencao: 'text-atencao-texto',
    risco: 'text-risco-texto',
    neutro: 'text-tinta-2',
    azul: 'text-azul',
};

export const PREENCHIMENTO: Record<Tom, string> = {
    bom: 'bg-bom',
    atencao: 'bg-atencao',
    risco: 'bg-risco',
    neutro: 'bg-tinta-3',
    azul: 'bg-azul',
};
