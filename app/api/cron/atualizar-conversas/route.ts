import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { dataEmSaoPaulo, janelaDoDia } from '@/lib/analise';
import { enfileirarAnalisesDoDia } from '@/lib/fechamento';

export const maxDuration = 300;

/**
 * Atualiza as análises das conversas de HOJE, às 12h e às 18h (migration
 * 0025). Só a conversa: status, potencial e lead quente chegam no mesmo dia.
 * O relatório do vendedor não sai daqui — o worker só o encadeia de dia
 * fechado (`diaFechado`), e quem fecha o dia é o `fechar-dia` das 00h30.
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) return Response.json({ erro: 'não autorizado' }, { status: 401 });

    const dataRef = dataEmSaoPaulo(new Date());
    const { inicio, fim } = janelaDoDia(dataRef);
    try {
        const { vendedores, conversas } = await enfileirarAnalisesDoDia(criarClienteAdmin(), dataRef, inicio, fim);
        return Response.json({ data_ref: dataRef, vendedores, conversas_enfileiradas: conversas });
    } catch (e) {
        return Response.json({ erro: String(e) }, { status: 500 });
    }
}
