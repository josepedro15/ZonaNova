import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { aposFalha } from '@/lib/fila';
import { transcrever } from '@/lib/transcricao';

export const maxDuration = 300;

const LOTE = 20;

/**
 * Worker da fila (doc 3 §3.4). Roda a cada 5 minutos.
 *
 * Nesta fase trata apenas `transcricao` — os outros tipos entram com a Fase 5.
 * Item de tipo ainda não suportado fica quieto na fila: não se marca `falhou`
 * o que ninguém tentou processar, senão ele queima as tentativas antes de o
 * worker dele existir.
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) {
        return Response.json({ erro: 'não autorizado' }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const supabase = criarClienteAdmin();
    const agora = new Date();

    const { data: candidatos, error } = await supabase
        .from('fila_processamento')
        .select('id, tipo, referencia_id, tentativas')
        .eq('status', 'pendente')
        .eq('tipo', 'transcricao')
        .lte('proxima_tentativa_em', agora.toISOString())
        .order('proxima_tentativa_em')
        .limit(LOTE)
        .returns<{ id: string; tipo: string; referencia_id: string; tentativas: number }[]>();

    if (error) return Response.json({ erro: error.message }, { status: 500 });
    if (!candidatos?.length) return Response.json({ pegos: 0, concluidos: 0, falhados: 0 });

    if (!apiKey) {
        // Sem chave não há como transcrever. Deixar na fila é melhor que
        // gastar tentativa: quando a chave chegar, o áudio ainda está lá.
        return Response.json({ pegos: 0, concluidos: 0, falhados: 0, aguardando: 'OPENAI_API_KEY' });
    }

    // Marca `processando` só no que ainda está `pendente`: se outro worker
    // passou antes, a condição não bate e o item não é pego duas vezes.
    const { data: pegos } = await supabase
        .from('fila_processamento')
        .update({ status: 'processando' })
        .in('id', candidatos.map((c) => c.id))
        .eq('status', 'pendente')
        .select('id')
        .returns<{ id: string }[]>();

    const meus = new Set((pegos ?? []).map((p) => p.id));
    let concluidos = 0, falhados = 0, reagendados = 0;

    for (const item of candidatos.filter((c) => meus.has(c.id))) {
        try {
            await transcreverMensagem(supabase, item.referencia_id, apiKey);
            await supabase.from('fila_processamento')
                .update({ status: 'concluido', processado_em: new Date().toISOString() })
                .eq('id', item.id);
            concluidos++;
        } catch (e) {
            const desfecho = aposFalha(item.tentativas);
            await supabase.from('fila_processamento').update({
                status: desfecho.status,
                tentativas: desfecho.tentativas,
                ultimo_erro: String(e).slice(0, 500),
                ...(desfecho.status === 'pendente'
                    ? { proxima_tentativa_em: desfecho.proximaTentativaEm.toISOString() }
                    : { processado_em: new Date().toISOString() }),
            }).eq('id', item.id);
            if (desfecho.status === 'falhou') falhados++; else reagendados++;
        }
    }

    return Response.json({ pegos: meus.size, concluidos, falhados, reagendados });
}

type Admin = ReturnType<typeof criarClienteAdmin>;

async function transcreverMensagem(supabase: Admin, mensagemId: string, apiKey: string) {
    const { data: msg } = await supabase
        .from('mensagens')
        .select('id, midia_url, transcricao')
        .eq('id', mensagemId)
        .maybeSingle<{ id: string; midia_url: string | null; transcricao: string | null }>();

    if (!msg) throw new Error('mensagem não existe mais');
    if (msg.transcricao) return;          // já transcrita: nada a fazer
    if (!msg.midia_url) throw new Error('mensagem de áudio sem midia_url');

    const { texto, hash } = await transcrever(msg.midia_url, {
        apiKey,
        modelo: process.env.OPENAI_MODELO_AUDIO,
        procurarCache: async (h) => {
            const { data } = await supabase
                .from('mensagens').select('transcricao')
                .eq('midia_hash', h).not('transcricao', 'is', null)
                .limit(1).maybeSingle<{ transcricao: string }>();
            return data?.transcricao ?? null;
        },
    });

    await supabase.from('mensagens')
        .update({ transcricao: texto, midia_hash: hash })
        .eq('id', msg.id);
}
