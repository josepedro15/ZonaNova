import 'server-only';
import type { criarClienteAdmin } from '@/lib/supabase/admin';

/**
 * Quem entra no fechamento de um dia. Dois chamadores: o cron `fechar-dia`
 * (por vendedor ativo) e o "reprocessar dia" da operação, via
 * `conversasDoFechamento`, com o mesmo filtro. Os dois precisam da mesma
 * resposta, senão reprocessar daria outro dia.
 */
type Admin = ReturnType<typeof criarClienteAdmin>;
const PAGINA = 1000;

/**
 * As conversas com pelo menos uma mensagem dentro da janela — de um vendedor,
 * ou de todos quando `userId` fica de fora (reprocessamento do dia).
 *
 * Não dá para filtrar por `ultima_mensagem_em`: quando o dia fecha, uma
 * negociação que continuou no dia seguinte já tem a última mensagem fora da
 * janela, e quem conversa todo dia nunca seria analisado. O que decide é ter
 * mensagem no dia. `ultima_mensagem_em >= inicio` só pré-filtra: toda conversa
 * com mensagem na janela passa por ele. Contato bloqueado fica de fora.
 */
export async function conversasComMensagemNoDia(supabase: Admin, inicio: Date, fim: Date, userId?: string): Promise<string[]> {
    const candidatas: string[] = [];
    for (let de = 0; ; de += PAGINA) {
        let consulta = supabase.from('conversas')
            .select('id').eq('bloqueada', false)
            .gte('ultima_mensagem_em', inicio.toISOString());
        if (userId) consulta = consulta.eq('user_id', userId);
        const { data, error } = await consulta
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

/**
 * Quem o fechamento do dia analisa: conversas com mensagem na janela, só de
 * vendedor ativo. O "reprocessar dia" usa esta mesma resposta — rodando sem o
 * filtro de vendedor ele reanalisava (e pagava) conversas de inativos,
 * pendentes e gestores, que o fechamento normal nunca olha.
 */
export async function conversasDoFechamento(supabase: Admin, inicio: Date, fim: Date): Promise<string[]> {
    const { data: vendedores, error } = await supabase.from('profiles')
        .select('id').eq('role', 'vendedor').eq('status', 'ativo')
        .returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    const todas: string[] = [];
    for (const v of vendedores ?? []) todas.push(...await conversasComMensagemNoDia(supabase, inicio, fim, v.id));
    return todas;
}
