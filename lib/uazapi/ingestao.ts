import 'server-only';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { variantesTelefone } from '@/lib/painel';
import { valeTranscrever } from '@/lib/transcricao';
import { valeDescrever } from '@/lib/midia';
import { mensagensDoEvento, normalizarMensagem, statusDeConexao, type ChatUazapi, type EventoUazapi, type MensagemUazapi } from '@/lib/uazapi/normalizar';

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

    // O chat que acompanha a mensagem ao vivo pode trazer o telefone de um chat @lid.
    for (const mensagem of mensagens) await processarMensagem(mensagem, evento.message ? evento.chat ?? null : null, conexao);
    if (evento.EventType?.toLowerCase() === 'history') {
        await supabase.from('conexoes_whatsapp').update({
            historico_status: 'recebido', historico_ultimo_em: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', conexao.id);
    }
}

async function processarMensagem(mensagem: MensagemUazapi, chat: ChatUazapi | null, conexao: Conexao) {
    const supabase = criarClienteAdmin();
    const m = normalizarMensagem({ message: mensagem, chat });
    if ('descartar' in m) return;

    // Contato fora da análise não é guardado: barrar aqui e não na análise
    // evita guardar o que pediram para não ser guardado. Três listas, a mesma
    // regra de lib/exclusao.ts:
    // - a pessoal do vendedor ("isto não é atendimento");
    // - a interna da loja (Depósito, caixa), cadastrada pelo gestor;
    // - o número de outro vendedor conectado: conversa de trabalho.
    // Compara com e sem o nono dígito: o JID e o que foi digitado nem sempre concordam.
    const variantes = variantesTelefone(m.clienteTelefone);
    const [pessoal, interno, colega] = await Promise.all([
        supabase.from('contatos_bloqueados').select('id').eq('user_id', conexao.user_id).in('telefone', variantes).limit(1),
        supabase.from('contatos_internos').select('id').eq('unidade_id', conexao.unidade_id).in('telefone', variantes).limit(1),
        supabase.from('conexoes_whatsapp').select('id').neq('id', conexao.id).in('numero', variantes).limit(1),
    ]);
    // Falha de leitura não é "pode guardar": lançar mantém a entrada em
    // webhook_entrada para o worker tentar de novo.
    for (const r of [pessoal, interno, colega]) if (r.error) throw r.error;
    if (pessoal.data?.length || interno.data?.length || colega.data?.length) return;

    // A conversa pertence à unidade VIGENTE do vendedor, a da conexão: se ele
    // é transferido, a próxima mensagem de um cliente antigo leva a conversa
    // junto, e é o gestor novo quem passa a vê-la. O histórico por dia não se
    // perde — cada análise e relatório guarda a unidade do dia em que foi
    // feito (doc 2, rollup histórico).
    const conversa = await conversaDoContato(supabase, conexao, m);

    // Idempotência: reentrega da UAZAPI não pode duplicar mensagem. O UNIQUE
    // em wa_message_id é quem garante; aqui só se pede para não reclamar.
    // `ultima_mensagem_em` e `total_mensagens` são mantidos por trigger (0005)
    // justamente para a reentrega não inflar contador.
    const linha = {
        conversa_id: conversa.id,
        wa_message_id: m.waMessageId,
        direcao: m.direcao,
        tipo: m.tipo,
        conteudo: m.conteudo,
        midia_url: m.midiaUrl,
        automatica: m.automatica,
        enviada_em: m.enviadaEm.toISOString(),
    };
    const gravar = (campos: Record<string, unknown>) => supabase.from('mensagens')
        .upsert(campos, { onConflict: 'wa_message_id', ignoreDuplicates: true });
    let { error: erroMensagem } = await gravar(m.midiaNome ? { ...linha, midia_nome: m.midiaNome } : linha);
    // Sem a coluna (migration 0026 ainda não aplicada), grava sem o nome: perder
    // o nome do arquivo é melhor que perder a mensagem.
    if (erroMensagem && m.midiaNome && COLUNA_AUSENTE.has(erroMensagem.code)) ({ error: erroMensagem } = await gravar(linha));

    if (erroMensagem) throw erroMensagem;

    // Áudio antigo do histórico fica guardado, mas sem transcrição: ver `valeTranscrever`.
    // Imagem e documento só ganham descrição na unidade ligada (lib/midia.ts).
    const fila = m.tipo === 'audio' && valeTranscrever(m.enviadaEm) ? 'transcricao'
        : valeDescrever({ tipo: m.tipo, enviadaEm: m.enviadaEm, unidadeId: conexao.unidade_id }, process.env.MIDIA_UNIDADES) ? 'descricao_midia'
        : null;
    if (fila) {
        const { data: gravada } = await supabase
            .from('mensagens').select('id').eq('wa_message_id', m.waMessageId)
            .maybeSingle<{ id: string }>();
        if (gravada) {
            await supabase.from('fila_processamento').upsert(
                {
                    tipo: fila,
                    referencia_id: gravada.id,
                    data_ref: m.enviadaEm.toISOString().slice(0, 10),
                },
                { onConflict: 'tipo,referencia_id,data_ref', ignoreDuplicates: true },
            );
        }
    }
}

/**
 * A conversa da mensagem. Com LID, quem decide é o banco
 * (`zn_conversa_do_contato`, 0031): a conversa do telefone, unida à `lid:` do
 * mesmo contato — ou, só com o LID, a que já tiver aquele LID. Sem LID, o
 * upsert pelo telefone de sempre.
 */
async function conversaDoContato(
    supabase: ReturnType<typeof criarClienteAdmin>, conexao: Conexao,
    m: { clienteTelefone: string; clienteLid: string | null; clienteNome: string | null },
): Promise<{ id: string }> {
    if (m.clienteLid) {
        const { data, error } = await supabase.rpc('zn_conversa_do_contato', {
            p_user: conexao.user_id, p_unidade: conexao.unidade_id,
            p_telefone: m.clienteTelefone, p_lid: m.clienteLid, p_nome: m.clienteNome,
        });
        if (!error && data) return { id: data as string };
        // Sem a função (0031 ainda não aplicada), o caminho antigo: a mensagem
        // não pode se perder por isso.
        if (!error || !FUNCAO_AUSENTE.has(error.code)) throw error ?? new Error('conversa não resolvida');
    }
    const { data: conversa, error } = await supabase.from('conversas')
        .upsert({
            user_id: conexao.user_id,
            cliente_telefone: m.clienteTelefone,
            unidade_id: conexao.unidade_id,
            ...(m.clienteNome ? { cliente_nome: m.clienteNome } : {}),
        }, { onConflict: 'user_id,cliente_telefone' })
        .select('id').single<{ id: string }>();
    if (error || !conversa) throw error ?? new Error('conversa não resolvida');
    return conversa;
}

/** 42883 vem do Postgres; PGRST202 é como o PostgREST diz o mesmo. */
const FUNCAO_AUSENTE = new Set(['42883', 'PGRST202']);

/** 42703 vem do Postgres; PGRST204 é como o PostgREST diz o mesmo. */
const COLUNA_AUSENTE = new Set(['42703', 'PGRST204']);

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
