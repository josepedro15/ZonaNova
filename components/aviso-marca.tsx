import type { ReactNode } from 'react';
import { Botao, Icone, SELO } from '@/components/ui';

/**
 * O retorno de uma marca na conversa ("Não é atendimento", "Fechado
 * presencialmente"), com o caminho de volta. O piloto apertava o botão, nada
 * mudava na tela e achava que não tinha funcionado (08/10/2026).
 */
export function AvisoMarca({ tom, titulo, children, desfazer }: {
    tom: 'bom' | 'neutro'; titulo: string; children?: ReactNode;
    desfazer?: { acao: (form: FormData) => Promise<void>; conversaId: string; voltar?: 'dashboard' };
}) {
    return (
        <div role="status" className={`flex flex-col gap-3 rounded-card p-4 sm:flex-row sm:items-center ${SELO[tom]}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-superficie">
                <Icone nome="check" />
            </span>
            <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="text-sm font-bold">{titulo}</span>
                {children && <span className="text-[12.5px] leading-snug text-tinta-2">{children}</span>}
            </div>
            {desfazer && (
                <form action={desfazer.acao}>
                    <input type="hidden" name="conversaId" value={desfazer.conversaId} />
                    {desfazer.voltar && <input type="hidden" name="voltar" value={desfazer.voltar} />}
                    <Botao variante="secundario" type="submit">Desfazer</Botao>
                </form>
            )}
        </div>
    );
}
