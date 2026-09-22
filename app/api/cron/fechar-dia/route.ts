import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { dataEmSaoPaulo, janelaDoDia } from '@/lib/analise';
import { conversasComMensagemNoDia } from '@/lib/fechamento';

export const maxDuration = 300;

/**
 * Fecha o dia comercial e enfileira uma análise por conversa com movimento.
 * Por padrão fecha ontem; `?data=AAAA-MM-DD` permite operação/reprocessamento.
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) return Response.json({ erro: 'não autorizado' }, { status: 401 });

    const url = new URL(req.url);
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dataRef = url.searchParams.get('data') || dataEmSaoPaulo(ontem);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) return Response.json({ erro: 'data inválida' }, { status: 400 });

    const { inicio, fim } = janelaDoDia(dataRef);
    const supabase = criarClienteAdmin();
    const { data: vendedores, error: erroVendedores } = await supabase.from('profiles')
        .select('id').eq('role', 'vendedor').eq('status', 'ativo')
        .returns<{ id: string }[]>();
    if (erroVendedores) return Response.json({ erro: erroVendedores.message }, { status: 500 });

    let conversas = 0;
    for (const vendedor of vendedores ?? []) {
        let lista: string[];
        try {
            lista = await conversasComMensagemNoDia(supabase, inicio, fim, vendedor.id);
        } catch (e) {
            return Response.json({ erro: String(e) }, { status: 500 });
        }
        if (!lista.length) continue;
        const { error: erroFila } = await supabase.from('fila_processamento').upsert(
            lista.map((id) => ({ tipo: 'analise_conversa', referencia_id: id, data_ref: dataRef })),
            { onConflict: 'tipo,referencia_id,data_ref', ignoreDuplicates: true },
        );
        if (erroFila) return Response.json({ erro: erroFila.message }, { status: 500 });
        conversas += lista.length;
    }

    return Response.json({ data_ref: dataRef, vendedores: vendedores?.length ?? 0, conversas_enfileiradas: conversas });
}

