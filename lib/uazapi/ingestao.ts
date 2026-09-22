import 'server-only';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { variantesTelefone } from '@/lib/painel';
import { mensagensDoEvento, normalizarMensagem, statusDeConexao, type EventoUazapi, type MensagemUazapi } from '@/lib/uazapi/normalizar';

/**
 * O trabalho do webhook depois de autenticado (doc 3 §3.2). Fica fora da rota
 * porque tem dois chamadores: o próprio webhook, logo após responder, e o
 * worker da fila, que reprocessa o que ficou em `webhook_entrada`.
 */
export type Conexao = { id: string; user_id: string; unidade_id: string };

export async function processar(evento: EventoUazapi, conexao: Conexao) {
    const supabase = criarClienteAdmin();

    // Evento de conexão: é o que alimenta o alerta de número caído.
    // Só quando não é uma mensagem avulsa: nela, `status` pode ser o da
    // mensagem. Um lote (`messages[]`) com status traz os dois — atualiza a
    // conexão e segue para as mensagens em vez de descartá-las.
    const status = statusDeConexao(evento);
    if (status && !evento.message) {
        await supabase.from('conexoes_whatsapp')
            .update({ status, ...(status === 'conectada' ? { historico_status: 'recebendo' } : {}), ultimo_evento_em: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', conexao.id);
    }

    const mensagens = mensagensDoEvento(evento);
    if (!mensagens.length) return;

    // Quem foi desativado (ou recusado) não é mais monitorado, ainda que a
    // instância na UAZAPI continue de pé — desligá-la pode ter falhado. O
    // status da conexão acima continua sendo atualizado; a mensagem, não.
    const { data: dono, error: erroDono } = await supabase.from('profiles').select('status')
        .eq('id', conexao.user_id).maybeSingle<{ status: string }>();
    // Falha de leitura não é "dono inativo": lançar mantém a entrada em
    // webhook_entrada para o worker tentar de novo, em vez de apagar mensagens.
    if (erroDono) throw erroDono;
    if (dono?.status !== 'ativo') return;

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
    // Compara com e sem o nono dígito: o JID e o que o vendedor digitou nem
    // sempre concordam.
    const { data: bloqueado } = await supabase
        .from('contatos_bloqueados')
        .select('id')
        .eq('user_id', conexao.user_id)
        .in('telefone', variantesTelefone(m.clienteTelefone))
        .limit(1);
    if (bloqueado?.length) return;

    // A conversa pertence à unidade VIGENTE do vendedor, a da conexão: se ele
    // é transferido, a próxima mensagem de um cliente antigo leva a conversa
    // junto, e é o gestor novo quem passa a vê-la. O histórico por dia não se
    // perde — cada análise e relatório guarda a unidade do dia em que foi
    // feito (doc 2, rollup histórico).
    const { data: conversa, error: erroConversa } = await supabase.from('conversas')
        .upsert({
            user_id: conexao.user_id,
            cliente_telefone: m.clienteTelefone,
            unidade_id: conexao.unidade_id,
            ...(m.clienteNome ? { cliente_nome: m.clienteNome } : {}),
        }, { onConflict: 'user_id,cliente_telefone' })
        .select('id').single<{ id: string }>();

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

/** Uma linha que ficou em `webhook_entrada`: falhou ou não chegou a ser processada. */
type Entrada = { id: string; conexao_id: string; payload: EventoUazapi; tentativas: number };

/** Desiste depois disso: o payload fica na tabela para inspeção manual. */
export const MAX_TENTATIVAS_ENTRADA = 5;

/**
 * Processa uma entrada e a apaga. Em falha, registra o erro e deixa a linha
 * para a próxima rodada do worker. `tentativaJaContada` é o caso do worker,
 * que soma a tentativa antes de começar (ver `drenarEntradas`).
 */
export async function processarEntrada(entradaId: string, evento: EventoUazapi, conexao: Conexao, tentativas = 0, tentativaJaContada = false) {
    const supabase = criarClienteAdmin();
    try {
        await processar(evento, conexao);
        await supabase.from('webhook_entrada').delete().eq('id', entradaId);
    } catch (e) {
        await supabase.from('webhook_entrada')
            .update({ ...(tentativaJaContada ? {} : { tentativas: tentativas + 1 }), ultimo_erro: String(e).slice(0, 500) })
            .eq('id', entradaId);
        throw e;
    }
}

/**
 * Reprocessa entradas esquecidas. Só pega as que têm mais de `idadeMinima` ms
 * para não disputar com o `after()` do webhook que ainda está trabalhando.
 *
 * A tentativa é somada ANTES de processar. Somada só no erro, uma entrada
 * grande demais para o tempo da função (um `history` com centenas de
 * mensagens) morria sem nunca contar, e voltava a cada rodada para sempre. A
 * soma é condicional ao valor lido, o que também impede dois workers de
 * pegarem a mesma entrada. `ate` é o instante a partir do qual não se começa
 * entrada nova: o worker tem outras coisas para fazer no mesmo tempo.
 */
export async function drenarEntradas(ate: Date, limite = 5, idadeMinima = 10 * 60_000): Promise<{ reprocessadas: number; falhas: number }> {
    const supabase = criarClienteAdmin();
    const { data, error } = await supabase.from('webhook_entrada')
        .select('id, conexao_id, payload, tentativas')
        .lt('recebido_em', new Date(Date.now() - idadeMinima).toISOString())
        .lt('tentativas', MAX_TENTATIVAS_ENTRADA)
        .order('recebido_em').limit(limite)
        .returns<Entrada[]>();
    if (error) throw new Error(error.message);

    let reprocessadas = 0, falhas = 0;
    for (const entrada of data ?? []) {
        if (Date.now() >= ate.getTime()) break;
        const { data: conexao } = await supabase.from('conexoes_whatsapp')
            .select('id, user_id, unidade_id').eq('id', entrada.conexao_id)
            .maybeSingle<Conexao>();
        if (!conexao) {
            await supabase.from('webhook_entrada').delete().eq('id', entrada.id);
            continue;
        }
        const { data: minha } = await supabase.from('webhook_entrada')
            .update({ tentativas: entrada.tentativas + 1 })
            .eq('id', entrada.id).eq('tentativas', entrada.tentativas)
            .select('id');
        if (!minha?.length) continue;
        try {
            await processarEntrada(entrada.id, entrada.payload, conexao, entrada.tentativas, true);
            reprocessadas++;
        } catch (e) {
            console.error(`webhook_entrada ${entrada.id}: falha ao reprocessar`, e);
            falhas++;
        }
    }
    return { reprocessadas, falhas };
}

/** Quanto uma entrada não processada fica guardada para investigação. */
export const RETENCAO_ENTRADA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Apaga entradas com mais de `RETENCAO_ENTRADA_MS`. Na prática são as que
 * esgotaram as tentativas: uma entrada saudável some em segundos. Ficam uma
 * semana para dar tempo de ler o `ultimo_erro`; depois disso são só conteúdo
 * de mensagem guardado sem propósito.
 */
export async function expurgarEntradas(agora = new Date()): Promise<number> {
    const supabase = criarClienteAdmin();
    const { data, error } = await supabase.from('webhook_entrada')
        .delete()
        .lt('recebido_em', new Date(agora.getTime() - RETENCAO_ENTRADA_MS).toISOString())
        .select('id');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}
