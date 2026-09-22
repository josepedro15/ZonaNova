import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { dataEmSaoPaulo, janelaDoDia } from '@/lib/analise';

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
            lista = await conversasComMensagemNoDia(supabase, vendedor.id, inicio, fim);
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

type Admin = ReturnType<typeof criarClienteAdmin>;
const PAGINA = 1000;

/**
 * As conversas do vendedor com pelo menos uma mensagem dentro da janela.
 *
 * Não dá para filtrar por `ultima_mensagem_em`: quando o dia fecha, uma
 * negociação que continuou no dia seguinte já tem a última mensagem fora da
 * janela, e quem conversa todo dia nunca seria analisado. O que decide é ter
 * mensagem no dia. `ultima_mensagem_em >= inicio` só pré-filtra: toda conversa
 * com mensagem na janela passa por ele.
 */
async function conversasComMensagemNoDia(supabase: Admin, userId: string, inicio: Date, fim: Date): Promise<string[]> {
    const candidatas: string[] = [];
    for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase.from('conversas')
            .select('id').eq('user_id', userId)
            .gte('ultima_mensagem_em', inicio.toISOString())
            .order('id').range(de, de + PAGINA - 1)
            .returns<{ id: string }[]>();
        if (error) throw new Error(error.message);
        candidatas.push(...(data ?? []).map((c) => c.id));
        if ((data ?? []).length < PAGINA) break;
    }

    const comMensagem = new Set<string>();
    // Lotes de 100 ids mantêm a URL do PostgREST curta.
    for (let i = 0; i < candidatas.length; i += 100) {
        const lote = candidatas.slice(i, i + 100);
        for (let de = 0; ; de += PAGINA) {
            const { data, error } = await supabase.from('mensagens')
                .select('conversa_id').in('conversa_id', lote)
                .gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString())
                .order('id').range(de, de + PAGINA - 1)
                .returns<{ conversa_id: string }[]>();
            if (error) throw new Error(error.message);
            for (const m of data ?? []) comMensagem.add(m.conversa_id);
            if ((data ?? []).length < PAGINA) break;
        }
    }
    return [...comMensagem];
}
