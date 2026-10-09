import 'server-only';
import type { criarClienteAdmin } from '@/lib/supabase/admin';
import { msDeExpediente } from '@/lib/painel';
import { ancorasDoHistorico, emSilencio, LIMIAR_SILENCIO_MS, recuperarMensagens, resumoErrosWebhook, type ErroWebhookResumido, type ResultadoRecuperacao } from '@/lib/captura';
import { comNomesConhecidos, contatosConhecidos, estaFora } from '@/lib/exclusao';
import type { Uazapi } from '@/lib/uazapi/cliente';
import type { MensagemUazapi } from '@/lib/uazapi/normalizar';

type Admin = ReturnType<typeof criarClienteAdmin>;

/** A conexão como o checar-conexoes a lê. */
export type ConexaoVigiada = {
    id: string;
    user_id: string;
    unidade_id: string;
    numero: string | null;
    ultima_mensagem_em: string | null;
};

export type BuracoAberto = { id: string; inicio: string; tentativas: number; encontradas: number; recuperadas: number };

/** Mensagens por linha de `webhook_entrada`: um lote que o worker processa folgado no tempo dele. */
const POR_ENTRADA = 50;

/**
 * A reinjeção não processa na hora: grava em `webhook_entrada`, como o
 * webhook faz, e o worker da fila ingere com as mesmas retentativas. Na hora,
 * centenas de mensagens não cabiam no tempo do cron. O `recebido_em` vai 10
 * minutos para trás porque o worker só pega entrada com essa idade (para não
 * disputar com o webhook que ainda está processando).
 */
async function enfileirar(supabase: Admin, conexaoId: string, mensagens: MensagemUazapi[]) {
    const recebidoEm = new Date(Date.now() - 10 * 60_000).toISOString();
    const linhas = [];
    for (let i = 0; i < mensagens.length; i += POR_ENTRADA) {
        linhas.push({ conexao_id: conexaoId, recebido_em: recebidoEm, payload: { EventType: 'recuperacao', messages: mensagens.slice(i, i + POR_ENTRADA) } });
    }
    const { error } = await supabase.from('webhook_entrada').insert(linhas);
    if (error) throw error;
}

async function idsGravados(supabase: Admin, ids: string[]): Promise<Set<string>> {
    const achados = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('mensagens').select('wa_message_id')
            .in('wa_message_id', ids.slice(i, i + 100)).returns<{ wa_message_id: string }[]>();
        if (error) throw error;
        for (const m of data ?? []) achados.add(m.wa_message_id);
    }
    return achados;
}

/**
 * As listas que a ingestão usa para descartar (lib/uazapi/ingestao.ts): a
 * pessoal do vendedor, a interna da unidade e os números dos colegas
 * conectados — com o LID de cada um, como lá.
 */
async function regraDeExclusao(supabase: Admin, c: ConexaoVigiada): Promise<(telefone: string) => boolean> {
    const [pessoais, internos, colegas] = await Promise.all([
        supabase.from('contatos_bloqueados').select('telefone').eq('user_id', c.user_id).returns<{ telefone: string }[]>(),
        supabase.from('contatos_internos').select('telefone').eq('unidade_id', c.unidade_id).returns<{ telefone: string }[]>(),
        supabase.from('conexoes_whatsapp').select('numero').neq('id', c.id).not('numero', 'is', null).returns<{ numero: string }[]>(),
    ]);
    for (const r of [pessoais, internos, colegas]) if (r.error) throw r.error;
    const listas = {
        pessoais: (pessoais.data ?? []).map((x) => x.telefone),
        internos: (internos.data ?? []).map((x) => x.telefone),
        colegas: (colegas.data ?? []).map((x) => x.numero),
    };
    // A /message/find traz o contato só como `lid:` quando não sabe o número:
    // as listas ganham o LID que as conversas do vendedor ligam a cada telefone.
    const conhecidos = await contatosConhecidos(supabase, c.user_id, [...listas.pessoais, ...listas.internos, ...listas.colegas]);
    const comLids = comNomesConhecidos(listas, conhecidos);
    return (telefone) => estaFora(telefone, comLids);
}

async function recuperar(supabase: Admin, uaz: Uazapi, token: string, c: ConexaoVigiada, desde: Date): Promise<ResultadoRecuperacao> {
    return recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens(token, { limit: limite, offset }),
        idsGravados: (ids) => idsGravados(supabase, ids),
        ingerir: (mensagens) => enfileirar(supabase, c.id, mensagens),
        desde,
        dono: c.numero,
        fora: await regraDeExclusao(supabase, c),
    });
}

/**
 * A UAZAPI recebeu depois do "buraco", só que de contatos fora da análise
 * (`so_contatos_fora`): a captura nunca parou, quem ficou quieto foram os
 * clientes. Não é buraco — apagar evita o alerta do gestor e o
 * `captura_incompleta` no relatório do dia. Se o silêncio continuar, a próxima
 * rodada abre e descarta de novo, ao custo de uma /message/find.
 */
async function descartar(supabase: Admin, c: ConexaoVigiada, buracoId: string) {
    const { error } = await supabase.from('buracos_captura').delete().eq('id', buracoId);
    if (error) throw error;
    await supabase.from('conexoes_whatsapp').update({ silencio_desde: null }).eq('id', c.id);
}

/**
 * Lido a cada tentativa: a UAZAPI só guarda os últimos 20 erros, em memória, e
 * perde tudo quando reinicia. Falha na leitura não impede a recuperação.
 */
async function errosDoBuraco(uaz: Uazapi, token: string, desde: Date): Promise<ErroWebhookResumido[] | null> {
    try {
        return resumoErrosWebhook(await uaz.errosDoWebhook(token), desde);
    } catch {
        return null;
    }
}

/** Conversas para as quais se pede histórico ao celular depois de um buraco. */
const MAX_CONVERSAS_HISTORICO = 15;

/**
 * O buraco fechou sem nada recuperado pela /message/find: a UAZAPI também não
 * tinha as mensagens. Resta pedir ao celular o histórico das conversas que
 * voltaram a andar depois dele, cada uma ancorada na primeira mensagem de
 * depois. O que vier chega pelo webhook `history`, como no primeiro contato.
 */
async function pedirHistorico(supabase: Admin, uaz: Uazapi, token: string, c: ConexaoVigiada, fim: Date): Promise<number> {
    const { data, error } = await supabase.from('mensagens')
        .select('wa_message_id, enviada_em, conversas!inner(cliente_telefone, user_id)')
        .eq('conversas.user_id', c.user_id)
        .gte('enviada_em', fim.toISOString())
        .lt('enviada_em', new Date(fim.getTime() + 24 * 60 * 60 * 1000).toISOString())
        .order('enviada_em').limit(300)
        .returns<{ wa_message_id: string; conversas: { cliente_telefone: string } }[]>();
    if (error) throw error;
    const ancoras = ancorasDoHistorico((data ?? []).map((m) => ({ cliente_telefone: m.conversas.cliente_telefone, wa_message_id: m.wa_message_id })))
        .slice(0, MAX_CONVERSAS_HISTORICO);
    let pedidas = 0;
    for (const a of ancoras) {
        try {
            await uaz.sincronizarHistorico(token, a.number, 100, a.messageid);
            pedidas++;
        } catch (e) {
            console.error(`checar-conexoes: histórico ${c.id} ${a.number}`, e);
        }
    }
    return pedidas;
}

export type DesfechoVigia = 'aberto' | 'recuperando' | 'fechado' | 'descartado' | null;

/**
 * A captura de uma conexão conectada, numa rodada do checar-conexoes:
 *
 * - buraco aberto e a mensagem voltou: fecha-o na primeira mensagem de depois
 *   e, se nada tinha sido recuperado, pede o histórico ao celular;
 * - buraco aberto e ainda em silêncio: tenta de novo a /message/find;
 * - sem buraco e em silêncio (lib/captura.ts `emSilencio`): abre um, marca o
 *   alerta do gestor (`silencio_desde`) e já tenta recuperar;
 * - nos dois últimos, se a UAZAPI só tem conversa fora da análise depois do
 *   início, não era buraco: descarta (ver `descartar`).
 */
export async function vigiarCaptura(supabase: Admin, uaz: Uazapi, token: string, c: ConexaoVigiada, outrasDaUnidade: (Date | null)[], aberto: BuracoAberto | undefined, agora: Date): Promise<DesfechoVigia> {
    const ultima = c.ultima_mensagem_em ? new Date(c.ultima_mensagem_em) : null;
    const carimbo = agora.toISOString();

    if (aberto) {
        const inicio = new Date(aberto.inicio);
        if (ultima && ultima > inicio) {
            const { data: primeira, error } = await supabase.from('mensagens')
                .select('enviada_em, conversas!inner(user_id)')
                .eq('conversas.user_id', c.user_id).gt('enviada_em', aberto.inicio)
                .order('enviada_em').limit(1)
                .maybeSingle<{ enviada_em: string }>();
            if (error) throw error;
            const fim = new Date(primeira?.enviada_em ?? ultima);
            const historico = aberto.recuperadas === 0 && msDeExpediente(inicio, fim) >= LIMIAR_SILENCIO_MS
                ? await pedirHistorico(supabase, uaz, token, c, fim)
                : null;
            await supabase.from('buracos_captura').update({
                fim: fim.toISOString(), updated_at: carimbo,
                ...(historico !== null ? { historico_pedido_em: carimbo, historico_conversas: historico } : {}),
            }).eq('id', aberto.id);
            await supabase.from('conexoes_whatsapp').update({ silencio_desde: null }).eq('id', c.id);
            return 'fechado';
        }
        const erros = await errosDoBuraco(uaz, token, inicio);
        const r = await recuperar(supabase, uaz, token, c, inicio);
        if (r.motivo === 'so_contatos_fora') {
            await descartar(supabase, c, aberto.id);
            return 'descartado';
        }
        await supabase.from('buracos_captura').update({
            // Máximo, não soma: o que uma rodada reinjeta e não chega ao banco
            // volta a faltar na seguinte e seria contado de novo.
            tentativas: aberto.tentativas + 1, encontradas: Math.max(aberto.encontradas, r.encontradas),
            recuperadas: Math.max(aberto.recuperadas, r.recuperadas), motivo: r.motivo, updated_at: carimbo,
            // Só substitui quando há o que mostrar: um reinício da UAZAPI zera a lista dela.
            ...(erros?.length ? { erros_webhook: erros } : {}),
        }).eq('id', aberto.id);
        return 'recuperando';
    }

    if (!emSilencio({ ultima, agora, outrasDaUnidade })) return null;

    const { data: novo, error } = await supabase.from('buracos_captura').insert({
        conexao_id: c.id, user_id: c.user_id, unidade_id: c.unidade_id, inicio: ultima!.toISOString(), detectado_em: carimbo,
    }).select('id').single<{ id: string }>();
    // Outra rodada abriu o mesmo buraco no meio tempo (índice único do aberto).
    if (error) return null;
    await supabase.from('conexoes_whatsapp').update({ silencio_desde: ultima!.toISOString() }).eq('id', c.id);
    const erros = await errosDoBuraco(uaz, token, ultima!);
    const r = await recuperar(supabase, uaz, token, c, ultima!);
    if (r.motivo === 'so_contatos_fora') {
        await descartar(supabase, c, novo.id);
        return 'descartado';
    }
    await supabase.from('buracos_captura').update({
        tentativas: 1, encontradas: r.encontradas, recuperadas: r.recuperadas, motivo: r.motivo, updated_at: carimbo,
        erros_webhook: erros,
    }).eq('id', novo.id);
    return 'aberto';
}
