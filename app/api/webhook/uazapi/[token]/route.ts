import { after } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { decifrar, segredoIgual } from '@/lib/crypto';
import { conexaoDoToken } from '@/lib/uazapi/rota';
import { mensagensDoEvento, normalizarMensagem, statusDeConexao, type EventoUazapi, type MensagemUazapi } from '@/lib/uazapi/normalizar';

/**
 * Ingestão do WhatsApp (doc 3 §3.2).
 *
 * A ordem aqui não é estética. A UAZAPI reentrega o que demora, então a regra
 * é: autenticar, responder 200, e só depois trabalhar — dentro do `after()`,
 * que o Next executa com a resposta já enviada.
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

    after(() => processar(evento, conexao).catch((e) => {
        console.error(`webhook ${conexaoId}: falha ao processar`, e);
    }));

    return Response.json({ ok: true });
}

type Conexao = { id: string; user_id: string; unidade_id: string };

async function processar(evento: EventoUazapi, conexao: Conexao) {
    const supabase = criarClienteAdmin();

    // Evento de conexão: é o que alimenta o alerta de número caído.
    const status = statusDeConexao(evento);
    if (status && !evento.message) {
        await supabase.from('conexoes_whatsapp')
            .update({ status, ...(status === 'conectada' ? { historico_status: 'recebendo' } : {}), ultimo_evento_em: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', conexao.id);
        return;
    }

    const mensagens = mensagensDoEvento(evento);
    if (!mensagens.length) return;
    for (const mensagem of mensagens) await processarMensagem(mensagem, conexao);
    if (evento.EventType?.toLowerCase() === 'history') {
        await supabase.from('conexoes_whatsapp').update({
            historico_status: 'recebido', historico_ultimo_em: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', conexao.id);
    }
}

async function processarMensagem(mensagem: MensagemUazapi, conexao: Conexao) {
    const supabase = criarClienteAdmin();
    const m = normalizarMensagem({ message: mensagem });
    if ('descartar' in m) return;

    // Contato bloqueado é escolha do vendedor: "isto não é atendimento".
    // Barrar aqui e não na análise evita guardar o que ele pediu para não ser
    // guardado.
    const { data: bloqueado } = await supabase
        .from('contatos_bloqueados')
        .select('id')
        .eq('user_id', conexao.user_id)
        .eq('telefone', m.clienteTelefone)
        .maybeSingle();
    if (bloqueado) return;

    // A unidade é carimbada na conversa no momento da criação: se o vendedor
    // mudar de unidade amanhã, o histórico continua pertencendo a onde
    // aconteceu.
    const { data: conversa, error: erroConversa } = await supabase
        .from('conversas')
        .upsert(
            {
                user_id: conexao.user_id,
                unidade_id: conexao.unidade_id,
                cliente_telefone: m.clienteTelefone,
                ...(m.clienteNome ? { cliente_nome: m.clienteNome } : {}),
            },
            { onConflict: 'user_id,cliente_telefone' },
        )
        .select('id')
        .single<{ id: string }>();

    if (erroConversa || !conversa) {
        throw erroConversa ?? new Error('conversa não resolvida');
    }

    // Idempotência: reentrega da UAZAPI não pode duplicar mensagem. O UNIQUE
    // em wa_message_id é quem garante; aqui só se pede para não reclamar.
    // `ultima_mensagem_em` e `total_mensagens` são mantidos por trigger (0005)
    // justamente para a reentrega não inflar contador.
    const { error: erroMensagem } = await supabase
        .from('mensagens')
        .upsert(
            {
                conversa_id: conversa.id,
                wa_message_id: m.waMessageId,
                direcao: m.direcao,
                tipo: m.tipo,
                conteudo: m.conteudo,
                midia_url: m.midiaUrl,
                automatica: m.automatica,
                enviada_em: m.enviadaEm.toISOString(),
            },
            { onConflict: 'wa_message_id', ignoreDuplicates: true },
        );

    if (erroMensagem) throw erroMensagem;

    if (m.tipo === 'audio') {
        const { data: linha } = await supabase
            .from('mensagens').select('id').eq('wa_message_id', m.waMessageId)
            .maybeSingle<{ id: string }>();
        if (linha) {
            await supabase.from('fila_processamento').upsert(
                {
                    tipo: 'transcricao',
                    referencia_id: linha.id,
                    data_ref: m.enviadaEm.toISOString().slice(0, 10),
                },
                { onConflict: 'tipo,referencia_id,data_ref', ignoreDuplicates: true },
            );
        }
    }
}
