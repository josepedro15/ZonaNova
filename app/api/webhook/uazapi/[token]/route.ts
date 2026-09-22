import { after } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { decifrar, segredoIgual } from '@/lib/crypto';
import { conexaoDoToken } from '@/lib/uazapi/rota';
import { type EventoUazapi } from '@/lib/uazapi/normalizar';
import { processar, processarEntrada } from '@/lib/uazapi/ingestao';

/**
 * Ingestão do WhatsApp (doc 3 §3.2).
 *
 * A ordem aqui não é estética. A UAZAPI reentrega o que demora, então a regra
 * é: autenticar, gravar o payload bruto, responder 200, e só depois trabalhar —
 * dentro do `after()`, que o Next executa com a resposta já enviada.
 *
 * Responder 200 a payload que não serve é de propósito: é o que faz a UAZAPI
 * parar de reentregar uma mensagem de grupo para sempre. Só 401 quando a
 * chamada não se prova — aí reentregar também não vai adiantar, mas o silêncio
 * é melhor que aceitar.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> },
) {
    const segredo = process.env.UAZAPI_WEBHOOK_SECRET;
    if (!segredo) {
        console.error('webhook chamado sem UAZAPI_WEBHOOK_SECRET configurado');
        return Response.json({ erro: 'não configurado' }, { status: 500 });
    }

    const { token } = await params;
    const conexaoId = conexaoDoToken(token, segredo);
    if (!conexaoId) return Response.json({ erro: 'não autorizado' }, { status: 401 });

    let evento: EventoUazapi;
    try {
        evento = await req.json();
    } catch {
        return Response.json({ erro: 'payload inválido' }, { status: 400 });
    }

    const supabase = criarClienteAdmin();
    const { data: conexao } = await supabase
        .from('conexoes_whatsapp')
        .select('id, user_id, unidade_id, instance_token')
        .eq('id', conexaoId)
        .maybeSingle<{ id: string; user_id: string; unidade_id: string; instance_token: string | null }>();

    if (!conexao) return Response.json({ erro: 'não autorizado' }, { status: 401 });

    // Segunda pergunta: a mensagem veio mesmo da instância deste vendedor? O
    // token de rota prova de quem é a URL; este prova de quem é a instância.
    // Quem tivesse a URL de um vendedor não conseguiria empurrar tráfego de
    // outra instância por ela.
    const tokenPayload = evento.token ?? evento.instance?.token;
    if (tokenPayload && conexao.instance_token) {
        let guardado: string;
        try {
            guardado = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex'));
        } catch {
            console.error(`conexão ${conexaoId}: instance_token ilegível`);
            return Response.json({ erro: 'não autorizado' }, { status: 401 });
        }
        if (!segredoIgual(tokenPayload, guardado)) {
            return Response.json({ erro: 'não autorizado' }, { status: 401 });
        }
    }

    // Grava o payload bruto ANTES do 200. Depois do 200 a UAZAPI não reentrega;
    // o que falhar a partir daqui fica em `webhook_entrada` e o worker da fila
    // reprocessa.
    const { data: entrada, error: erroEntrada } = await supabase
        .from('webhook_entrada')
        .insert({ conexao_id: conexao.id, payload: semToken(evento) })
        .select('id')
        .single<{ id: string }>();

    if (erroEntrada) {
        // Tabela ainda não existe (migration 0014 não aplicada): volta ao
        // comportamento anterior em vez de recusar todo o tráfego.
        if (!TABELA_AUSENTE.has(erroEntrada.code)) {
            console.error(`webhook ${conexaoId}: não gravou a entrada`, erroEntrada);
            return Response.json({ erro: 'indisponível' }, { status: 503 });
        }
        after(() => processar(evento, conexao).catch((e) => {
            console.error(`webhook ${conexaoId}: falha ao processar`, e);
        }));
        return Response.json({ ok: true });
    }

    after(() => processarEntrada(entrada.id, evento, conexao).catch((e) => {
        console.error(`webhook ${conexaoId}: falha ao processar, fica para o worker`, e);
    }));

    return Response.json({ ok: true });
}

/** 42P01 vem do Postgres; PGRST205 é como o PostgREST diz o mesmo. */
const TABELA_AUSENTE = new Set(['42P01', 'PGRST205']);

/**
 * O payload sem o token da instância. Ele já cumpriu o papel na autenticação
 * acima e é credencial: não pode ficar em claro numa tabela de trânsito.
 */
function semToken(evento: EventoUazapi): EventoUazapi {
    const copia: EventoUazapi = { ...evento };
    delete copia.token;
    if (copia.instance) {
        copia.instance = { ...copia.instance };
        delete copia.instance.token;
    }
    return copia;
}
