import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { aposFalha } from '@/lib/fila';
import { transcrever } from '@/lib/transcricao';
import { analisarConversa, consolidarVendedor } from '@/lib/openai-analise';
import { custoEstimado, hashTranscript, janelaDoDia, montarTranscript, type MensagemAnalise } from '@/lib/analise';
import { foiRespondido, respostaMediaEmMinutos, temposDeResposta, type Msg } from '@/lib/painel';
import { decifrar } from '@/lib/crypto';
import { Uazapi } from '@/lib/uazapi/cliente';
import { drenarEntradas, expurgarEntradas } from '@/lib/uazapi/ingestao';

export const maxDuration = 300;

// Quatro análises reais levaram ~40s. O pg_net espera no máximo 60s; lote
// maior fazia o banco registrar timeout apesar de a Vercel continuar rodando.
const LOTE = 4;

// Acima de maxDuration com folga: item `processando` há mais que isso não tem
// mais nenhuma função trabalhando nele.
const PRAZO_PROCESSANDO_MS = 10 * 60_000;

// Depois disto o worker não começa a reprocessar entrada nova do webhook.
// Folga para o maxDuration de 300s, mesmo com a entrada em curso.
const PRAZO_DRENO_MS = 120_000;

/**
 * Worker da fila (doc 3 §3.4). Roda a cada 5 minutos.
 *
 * Trata a cadeia inteira: transcrição → análise → relatório → unidade → rede.
 * Depois, com o tempo que sobrar, reprocessa o que o webhook não terminou —
 * nessa ordem para que uma entrada pesada nunca impeça a fila de andar.
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) {
        return Response.json({ erro: 'não autorizado' }, { status: 401 });
    }

    const supabase = criarClienteAdmin();
    const agora = new Date();

    // Nenhuma das manutenções pode derrubar o worker.
    const resgatados = await resgatarPresos(supabase, agora).catch((e) => {
        console.error('processar-fila: falha ao resgatar itens presos', e);
        return 0;
    });

    let fila: Record<string, unknown>;
    try {
        fila = await processarLote(supabase, agora);
    } catch (e) {
        return Response.json({ erro: String(e) }, { status: 500 });
    }

    const entradas = await drenarEntradas(new Date(agora.getTime() + PRAZO_DRENO_MS)).catch((e) => {
        console.error('processar-fila: falha ao drenar webhook_entrada', e);
        return null;
    });
    const entradasExpurgadas = await expurgarEntradas(agora).catch((e) => {
        console.error('processar-fila: falha ao expurgar webhook_entrada', e);
        return null;
    });

    return Response.json({ ...fila, resgatados, entradas, entradasExpurgadas });
}

async function processarLote(supabase: Admin, agora: Date): Promise<Record<string, unknown>> {
    const apiKey = process.env.OPENAI_API_KEY;
    const { data: candidatos, error } = await supabase
        .from('fila_processamento')
        .select('id, tipo, referencia_id, data_ref, tentativas')
        .eq('status', 'pendente')
        .in('tipo', ['transcricao', 'analise_conversa', 'relatorio_vendedor', 'rollup_unidade', 'rollup_rede'])
        .lte('proxima_tentativa_em', agora.toISOString())
        .order('proxima_tentativa_em')
        .limit(LOTE)
        .returns<{ id: string; tipo: ItemTipo; referencia_id: string; data_ref: string; tentativas: number }[]>();

    if (error) throw new Error(error.message);
    if (!candidatos?.length) return { pegos: 0, concluidos: 0, falhados: 0 };

    if (!apiKey && candidatos.some((c) => ['transcricao', 'analise_conversa', 'relatorio_vendedor'].includes(c.tipo))) {
        // Sem chave não há como transcrever. Deixar na fila é melhor que
        // gastar tentativa: quando a chave chegar, o áudio ainda está lá.
        return { pegos: 0, concluidos: 0, falhados: 0, aguardando: 'OPENAI_API_KEY' };
    }

    // Marca `processando` só no que ainda está `pendente`: se outro worker
    // passou antes, a condição não bate e o item não é pego duas vezes.
    const reivindicar = (campos: Record<string, string>) => supabase
        .from('fila_processamento')
        .update(campos)
        .in('id', candidatos.map((c) => c.id))
        .eq('status', 'pendente')
        .select('id')
        .returns<{ id: string }[]>();
    const claim = await reivindicar({ status: 'processando', iniciado_em: agora.toISOString() });
    // Sem a coluna (migration 0014 ainda não aplicada), reivindica como antes.
    const { data: pegos } = claim.error && COLUNA_AUSENTE.has(claim.error.code)
        ? await reivindicar({ status: 'processando' })
        : claim;

    const meus = new Set((pegos ?? []).map((p) => p.id));
    let concluidos = 0, falhados = 0, reagendados = 0, reenfileirados = 0;

    for (const item of candidatos.filter((c) => meus.has(c.id))) {
        // Começa limpando a marca de reabertura: o que for reaberto a partir
        // daqui mudou DEPOIS do início desta execução, e só isso justifica
        // rodar o item de novo (ver 0017). Se a linha não está mais em
        // `processando`, alguém a resgatou — não é mais nossa.
        const { data: ainda } = await supabase.from('fila_processamento').update({ reaberto: false })
            .eq('id', item.id).eq('status', 'processando').select('id');
        if (!ainda?.length) continue;

        let desfecho: Record<string, unknown>;
        let encadeia = true;
        try {
            if (item.tipo === 'transcricao') await transcreverMensagem(supabase, item.referencia_id, apiKey!);
            else if (item.tipo === 'analise_conversa') await analisarItem(supabase, item.referencia_id, item.data_ref);
            else if (item.tipo === 'relatorio_vendedor') await consolidarItem(supabase, item.referencia_id, item.data_ref);
            else if (item.tipo === 'rollup_unidade') await rollupUnidade(supabase, item.referencia_id, item.data_ref);
            else if (item.tipo === 'rollup_rede') await rollupRede(supabase, item.data_ref);
            desfecho = { status: 'concluido', processado_em: new Date().toISOString() };
        } catch (e) {
            if (e instanceof IgnorarItem) {
                desfecho = { status: 'ignorado', ultimo_erro: e.message, processado_em: new Date().toISOString() };
            } else {
                const falha = aposFalha(item.tentativas);
                desfecho = {
                    status: falha.status,
                    tentativas: falha.tentativas,
                    ultimo_erro: String(e).slice(0, 500),
                    ...(falha.status === 'pendente'
                        ? { proxima_tentativa_em: falha.proximaTentativaEm.toISOString() }
                        : { processado_em: new Date().toISOString() }),
                };
                // Retry não encadeia: o próximo passo espera. Falha definitiva
                // encadeia — o relatório sai sem esta conversa em vez de nunca.
                encadeia = falha.status === 'falhou';
            }
        }

        const fechado = await fechar(supabase, item.id, desfecho);
        if (fechado === 'reenfileirado') { reenfileirados++; continue; }
        if (fechado === 'perdido') continue;
        if (encadeia) await encadearSemFalhar(supabase, item.tipo, item.referencia_id, item.data_ref);
        if (desfecho.status === 'concluido') concluidos++;
        else if (desfecho.status === 'falhou') falhados++;
        else if (desfecho.status === 'pendente') reagendados++;
    }

    return { pegos: meus.size, concluidos, falhados, reagendados, reenfileirados };
}

type Admin = ReturnType<typeof criarClienteAdmin>;

/** 42703 vem do Postgres; PGRST204 é como o PostgREST diz o mesmo. */
const COLUNA_AUSENTE = new Set(['42703', 'PGRST204']);

/**
 * Grava o desfecho de um item — se ele ainda é deste worker e não foi
 * reaberto durante a execução. Reaberto no meio do caminho, o resultado
 * desta execução já está velho: o item volta para a fila, do zero, e não
 * encadeia (quem encadeia é a execução que vier a seguir).
 */
async function fechar(supabase: Admin, id: string, desfecho: Record<string, unknown>): Promise<'fechado' | 'reenfileirado' | 'perdido'> {
    const { data: fechou } = await supabase.from('fila_processamento').update(desfecho)
        .eq('id', id).eq('status', 'processando').eq('reaberto', false).select('id');
    if (fechou?.length) return 'fechado';
    const { data: voltou } = await supabase.from('fila_processamento').update({
        status: 'pendente', reaberto: false, tentativas: 0, ultimo_erro: null, processado_em: null,
        proxima_tentativa_em: new Date().toISOString(),
    }).eq('id', id).eq('status', 'processando').eq('reaberto', true).select('id');
    return voltou?.length ? 'reenfileirado' : 'perdido';
}

/**
 * Item em `processando` além do prazo: a função que o pegou morreu (timeout,
 * deploy, queda) sem gravar o desfecho. Conta como uma falha — assim um item
 * que derruba o worker sempre acaba em `falhou` em vez de girar para sempre.
 *
 * `iniciado_em` nulo é item reivindicado antes da migration 0014; aí o
 * `created_at` é a melhor pista que existe.
 */
async function resgatarPresos(supabase: Admin, agora: Date): Promise<number> {
    const limite = new Date(agora.getTime() - PRAZO_PROCESSANDO_MS).toISOString();
    const { data: presos, error } = await supabase.from('fila_processamento')
        .select('id, tipo, referencia_id, data_ref, tentativas')
        .eq('status', 'processando')
        .or(`iniciado_em.lt.${limite},and(iniciado_em.is.null,created_at.lt.${limite})`)
        .limit(50)
        .returns<{ id: string; tipo: ItemTipo; referencia_id: string; data_ref: string; tentativas: number }[]>();
    if (error) throw new Error(error.message);

    for (const item of presos ?? []) {
        const desfecho = aposFalha(item.tentativas, agora);
        await supabase.from('fila_processamento').update({
            status: desfecho.status,
            tentativas: desfecho.tentativas,
            ultimo_erro: 'interrompido: ficou em processando além do prazo',
            reaberto: false,
            ...(desfecho.status === 'pendente'
                ? { proxima_tentativa_em: desfecho.proximaTentativaEm.toISOString() }
                : { processado_em: agora.toISOString() }),
        }).eq('id', item.id).eq('status', 'processando');
        if (desfecho.status === 'falhou') await encadearSemFalhar(supabase, item.tipo, item.referencia_id, item.data_ref);
    }
    return presos?.length ?? 0;
}

type ItemTipo = 'transcricao' | 'analise_conversa' | 'relatorio_vendedor' | 'rollup_unidade' | 'rollup_rede';
class IgnorarItem extends Error {}

async function transcreverMensagem(supabase: Admin, mensagemId: string, apiKey: string) {
    const { data: msg } = await supabase
        .from('mensagens')
        .select('id, conversa_id, wa_message_id, midia_url, transcricao')
        .eq('id', mensagemId)
        .maybeSingle<{ id: string; conversa_id: string; wa_message_id: string; midia_url: string | null; transcricao: string | null }>();

    if (!msg) throw new Error('mensagem não existe mais');
    if (msg.transcricao) return;          // já transcrita: nada a fazer
    let midiaUrl = msg.midia_url;
    if (!midiaUrl) {
        const { data: conversa } = await supabase.from('conversas').select('user_id').eq('id', msg.conversa_id)
            .maybeSingle<{ user_id: string }>();
        const { data: conexao } = conversa ? await supabase.from('conexoes_whatsapp').select('instance_token')
            .eq('user_id', conversa.user_id).maybeSingle<{ instance_token: string | null }>() : { data: null };
        const apiUrl = process.env.UAZAPI_API_URL;
        const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
        if (!conexao?.instance_token || !apiUrl || !adminToken) throw new Error('não foi possível recuperar a mídia do áudio');
        const token = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex'));
        const midia = await new Uazapi(apiUrl, adminToken).baixarMidia(token, msg.wa_message_id);
        midiaUrl = midia.fileURL;
        await supabase.from('mensagens').update({ midia_url: midiaUrl }).eq('id', msg.id);
    }

    const { texto, hash } = await transcrever(midiaUrl, {
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

async function doutrinaMec(supabase: Admin): Promise<{ texto: string; playbookId: string | null }> {
    const { data: playbook } = await supabase.from('playbooks').select('id,nome,versao').is('vigente_ate', null)
        .maybeSingle<{ id: string; nome: string; versao: string }>();
    if (!playbook) return { playbookId: null, texto: 'Avalie acolhida, sondagem, solução completa, contorno de objeções, estratégia de preço, fechamento e acompanhamento conforme aplicabilidade.' };
    const { data: etapas } = await supabase.from('playbook_etapas').select('id,chave,nome,descricao,criterios,ordem').eq('playbook_id', playbook.id).order('ordem');
    const ids = (etapas ?? []).map((e) => e.id as string);
    const { data: itens } = ids.length ? await supabase.from('playbook_itens').select('etapa_id,chave,rotulo,detalhe,ordem').in('etapa_id', ids).order('ordem') : { data: [] };
    return {
        playbookId: playbook.id,
        texto: `${playbook.nome} (${playbook.versao})\n${(etapas ?? []).map((e) => {
            const seus = (itens ?? []).filter((i) => i.etapa_id === e.id).map((i) => `- ${i.rotulo}${i.detalhe ? `: ${i.detalhe}` : ''}`).join('\n');
            return `${e.nome}: ${e.descricao}\n${seus}`;
        }).join('\n\n')}`,
    };
}

async function analisarItem(supabase: Admin, conversaId: string, dataRef: string) {
    const { inicio, fim } = janelaDoDia(dataRef);
    const { data: conversa } = await supabase.from('conversas').select('id,user_id,unidade_id')
        .eq('id', conversaId).maybeSingle<{ id: string; user_id: string; unidade_id: string }>();
    if (!conversa) throw new IgnorarItem('conversa não existe mais');
    const { data: mensagens, error } = await supabase.from('mensagens')
        .select('direcao,tipo,conteudo,transcricao,automatica,enviada_em')
        .eq('conversa_id', conversaId).gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString())
        .order('enviada_em').returns<MensagemAnalise[]>();
    if (error) throw error;
    if (!mensagens?.length) throw new IgnorarItem('sem mensagens no dia');
    if (!mensagens.some((m) => m.direcao === 'entrada')) throw new IgnorarItem('disparo sem resposta do cliente');
    if (mensagens.some((m) => /feliz anivers[aá]rio|parab[eé]ns pelo seu dia/i.test(m.conteudo ?? '')))
        throw new IgnorarItem('conversa de aniversário');

    const primeiraEntrada = mensagens.findIndex((m) => m.direcao === 'entrada');
    const recorte = primeiraEntrada > 0 && mensagens.slice(0, primeiraEntrada).every((m) => m.automatica)
        ? mensagens.slice(primeiraEntrada) : mensagens;
    const transcript = montarTranscript(recorte);
    const hash = hashTranscript(transcript);
    const { data: existente } = await supabase.from('analises_conversa').select('id,transcript_hash')
        .eq('conversa_id', conversaId).eq('data_ref', dataRef).maybeSingle<{ id: string; transcript_hash: string | null }>();
    if (existente?.transcript_hash === hash) return;

    const doutrina = await doutrinaMec(supabase);
    const { resultado, modelo, entrada, saida } = await analisarConversa({ transcript, doutrina: doutrina.texto });
    const { error: erroAnalise } = await supabase.from('analises_conversa').upsert({
        conversa_id: conversaId, user_id: conversa.user_id, unidade_id: conversa.unidade_id, data_ref: dataRef,
        tipo_conversa: resultado.tipo_conversa, status: resultado.status, sentiment: resultado.sentiment,
        score_atendimento: resultado.score_atendimento, score_oportunidade: resultado.score_oportunidade,
        score_risco: resultado.score_risco, estagio_funil: resultado.estagio_funil,
        potencial_venda: resultado.potencial_venda, urgencia: resultado.urgencia,
        payload: resultado, modelo, tokens_entrada: entrada, tokens_saida: saida,
        custo_estimado: custoEstimado(modelo, entrada, saida), transcript_hash: hash, updated_at: new Date().toISOString(),
    }, { onConflict: 'conversa_id,data_ref' });
    if (erroAnalise) throw erroAnalise;

    if (doutrina.playbookId && resultado.tipo_conversa === 'negociacao') {
        await supabase.from('aderencia_conversa').upsert(resultado.mec.map((m) => ({
            conversa_id: conversaId, user_id: conversa.user_id, unidade_id: conversa.unidade_id,
            data_ref: dataRef, playbook_id: doutrina.playbookId, etapa: m.etapa,
            aplicavel: m.aplicavel, aplicado: m.aplicado, justificativa: m.justificativa,
            evidencias: m.evidencias, itens: m.itens,
        })), { onConflict: 'conversa_id,data_ref,etapa' });
    }
}

async function consolidarItem(supabase: Admin, userId: string, dataRef: string) {
    const { data: analises, error } = await supabase.from('analises_conversa')
        .select('conversa_id,unidade_id,tipo_conversa,status,score_atendimento,payload')
        .eq('user_id', userId).eq('data_ref', dataRef);
    if (error) throw error;
    if (!analises?.length) throw new IgnorarItem('nenhuma análise para consolidar');
    const negociacoes = analises.filter((a) => a.tipo_conversa === 'negociacao');
    const conversaIds = analises.map((a) => a.conversa_id as string);
    const { inicio, fim } = janelaDoDia(dataRef);
    // Paginado e em lotes de ids: o PostgREST corta em 1000 linhas sem avisar,
    // e um dia movimentado passa disso — as métricas sairiam de uma amostra.
    const porConversa = new Map<string, Msg[]>();
    for (let i = 0; i < conversaIds.length; i += 100) {
        const lote = conversaIds.slice(i, i + 100);
        for (let de = 0; ; de += 1000) {
            const { data: mensagens, error: erroMensagens } = await supabase.from('mensagens')
                .select('conversa_id,direcao,automatica,enviada_em').in('conversa_id', lote)
                .gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString())
                .order('id').range(de, de + 999)
                .returns<(Msg & { conversa_id: string })[]>();
            if (erroMensagens) throw erroMensagens;
            for (const m of mensagens ?? []) porConversa.set(m.conversa_id, [...(porConversa.get(m.conversa_id) ?? []), m]);
            if ((mensagens ?? []).length < 1000) break;
        }
    }
    const tempos = [...porConversa.values()].flatMap(temposDeResposta);
    const respostas = [...porConversa.values()].map(foiRespondido).filter((v): v is boolean => v !== null);
    const metricas = {
        score_geral: negociacoes.length ? negociacoes.reduce((s, a) => s + Number(a.score_atendimento ?? 0), 0) / negociacoes.length : null,
        leads_atendidos: porConversa.size,
        conversoes_confirmadas: negociacoes.filter((a) => a.status === 'venda_feita').length,
        oportunidades_perdidas: negociacoes.filter((a) => a.status === 'perdida' || a.status === 'lead_frio').length,
        tempo_medio_resposta_s: respostaMediaEmMinutos(tempos) === null ? null : respostaMediaEmMinutos(tempos)! * 60,
        taxa_resposta: respostas.length ? respostas.filter(Boolean).length / respostas.length * 100 : null,
    };
    // O coaching comercial não pode punir o vendedor por suporte, conversa
    // social ou testes técnicos. Esses itens continuam nas métricas de resposta,
    // mas o treino usa negociações quando houver ao menos uma.
    const baseCoaching = negociacoes.length ? negociacoes : analises;
    const consolidado = await consolidarVendedor(baseCoaching.map((a) => a.payload), metricas);
    const unidadeId = String(analises[0].unidade_id);
    const { error: erroRel } = await supabase.from('relatorios_diarios').upsert({
        user_id: userId, unidade_id: unidadeId, data_ref: dataRef, ...metricas,
        pontos_positivos: [consolidado.resultado.elogio, ...consolidado.resultado.padroes_sucesso],
        pontos_negativos: consolidado.resultado.melhorias,
        payload: { ...consolidado.resultado, uso: { modelo: consolidado.modelo, entrada: consolidado.entrada, saida: consolidado.saida, custo: custoEstimado(consolidado.modelo, consolidado.entrada, consolidado.saida) } },
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,data_ref' });
    if (erroRel) throw erroRel;
    await consolidarAderenciaDiaria(supabase, userId, unidadeId, dataRef);
}

async function consolidarAderenciaDiaria(supabase: Admin, userId: string, unidadeId: string, dataRef: string) {
    const { data: linhas } = await supabase.from('aderencia_conversa').select('playbook_id,etapa,aplicavel,aplicado,itens')
        .eq('user_id', userId).eq('data_ref', dataRef);
    if (!linhas?.length) return;
    const aplicaveis = linhas.filter((l) => l.aplicavel);
    const valor = (a: string | null) => a === 'sim' ? 1 : a === 'parcial' ? 0.5 : 0;
    const etapas = [...new Set(aplicaveis.map((l) => String(l.etapa)))];
    const porEtapa = Object.fromEntries(etapas.map((etapa) => {
        const xs = aplicaveis.filter((l) => l.etapa === etapa);
        return [etapa, xs.length ? Math.round(xs.reduce((s, x) => s + valor(x.aplicado), 0) / xs.length * 100) : null];
    }));
    await supabase.from('aderencia_diaria').upsert({
        user_id: userId, unidade_id: unidadeId, data_ref: dataRef, playbook_id: linhas[0].playbook_id,
        aderencia_geral: aplicaveis.length ? aplicaveis.reduce((s, x) => s + valor(x.aplicado), 0) / aplicaveis.length * 100 : null,
        por_etapa: porEtapa,
    }, { onConflict: 'user_id,data_ref' });
}

const mediaPonderada = (linhas: Record<string, unknown>[], campo: string, peso = 'leads_atendidos') => {
    const validas = linhas.filter((l) => l[campo] !== null && l[campo] !== undefined);
    const total = validas.reduce((s, l) => s + Math.max(1, Number(l[peso] ?? 1)), 0);
    return total ? validas.reduce((s, l) => s + Number(l[campo]) * Math.max(1, Number(l[peso] ?? 1)), 0) / total : null;
};

async function rollupUnidade(supabase: Admin, unidadeId: string, dataRef: string) {
    const { data: relatorios, error } = await supabase.from('relatorios_diarios').select('*').eq('unidade_id', unidadeId).eq('data_ref', dataRef);
    if (error) throw error;
    if (!relatorios?.length) throw new IgnorarItem('unidade sem relatórios');
    const r = relatorios as Record<string, unknown>[];
    await supabase.from('relatorios_unidade').upsert({
        unidade_id: unidadeId, data_ref: dataRef, vendedores_ativos: r.length,
        score_geral: mediaPonderada(r, 'score_geral'), leads_atendidos: r.reduce((s, x) => s + Number(x.leads_atendidos ?? 0), 0),
        conversoes_confirmadas: r.reduce((s, x) => s + Number(x.conversoes_confirmadas ?? 0), 0),
        oportunidades_perdidas: r.reduce((s, x) => s + Number(x.oportunidades_perdidas ?? 0), 0),
        tempo_medio_resposta_s: mediaPonderada(r, 'tempo_medio_resposta_s'), taxa_resposta: mediaPonderada(r, 'taxa_resposta'),
        resumo_ia: `A unidade fechou o dia com ${r.length} vendedor${r.length === 1 ? '' : 'es'} com movimento.`, updated_at: new Date().toISOString(),
    }, { onConflict: 'unidade_id,data_ref' });
}

async function rollupRede(supabase: Admin, dataRef: string) {
    const { data: unidades, error } = await supabase.from('relatorios_unidade').select('*').eq('data_ref', dataRef);
    if (error) throw error;
    if (!unidades?.length) throw new IgnorarItem('rede sem unidades consolidadas');
    const r = unidades as Record<string, unknown>[];
    await supabase.from('relatorios_rede').upsert({
        data_ref: dataRef, unidades_ativas: r.length, vendedores_ativos: r.reduce((s, x) => s + Number(x.vendedores_ativos ?? 0), 0),
        score_geral: mediaPonderada(r, 'score_geral'), leads_atendidos: r.reduce((s, x) => s + Number(x.leads_atendidos ?? 0), 0),
        conversoes_confirmadas: r.reduce((s, x) => s + Number(x.conversoes_confirmadas ?? 0), 0),
        oportunidades_perdidas: r.reduce((s, x) => s + Number(x.oportunidades_perdidas ?? 0), 0),
        tempo_medio_resposta_s: mediaPonderada(r, 'tempo_medio_resposta_s'), taxa_resposta: mediaPonderada(r, 'taxa_resposta'),
        resumo_ia: `A rede fechou ${r.length} unidade${r.length === 1 ? '' : 's'} com movimento.`, updated_at: new Date().toISOString(),
    }, { onConflict: 'data_ref' });
}

/**
 * Coloca o passo seguinte na fila — ou o recoloca, se já rodou.
 *
 * Reabrir em vez de ignorar a duplicata é o que mantém a cadeia correta com
 * retries: se uma análise atrasada termina depois do relatório, o relatório
 * refaz; se um vendedor entra depois do rollup da unidade, a unidade refaz; e
 * a rede, depois dela. Um item que está rodando não é interrompido nem
 * duplicado: ganha a marca `reaberto` e só volta à fila ao terminar, se a
 * marca apareceu depois de ele começar (ver `fechar` e a migration 0017).
 */
async function reabrir(supabase: Admin, tipo: ItemTipo, referenciaId: string, dataRef: string) {
    const { error } = await supabase.rpc('zn_reabrir_item', { p_tipo: tipo, p_referencia: referenciaId, p_data: dataRef });
    if (error) throw new Error(error.message);
}

const EM_ABERTO = ['pendente', 'processando'];

/** Ainda há análise do vendedor para o dia na fila (pendente, em retry ou rodando)? */
async function vendedorTemAnalisePendente(supabase: Admin, userId: string, dataRef: string): Promise<boolean> {
    for (let de = 0; ; de += 1000) {
        const { data: abertas, error } = await supabase.from('fila_processamento')
            .select('referencia_id').eq('tipo', 'analise_conversa').eq('data_ref', dataRef).in('status', EM_ABERTO)
            .order('id').range(de, de + 999).returns<{ referencia_id: string }[]>();
        if (error) throw new Error(error.message);
        const ids = (abertas ?? []).map((a) => a.referencia_id);
        for (let i = 0; i < ids.length; i += 100) {
            const { count, error: erro } = await supabase.from('conversas').select('id', { count: 'exact', head: true })
                .eq('user_id', userId).in('id', ids.slice(i, i + 100));
            if (erro) throw new Error(erro.message);
            if (count) return true;
        }
        if (ids.length < 1000) return false;
    }
}

async function encadear(supabase: Admin, tipo: ItemTipo, referenciaId: string, dataRef: string) {
    if (tipo === 'analise_conversa') {
        const { data: conversa } = await supabase.from('conversas').select('user_id').eq('id', referenciaId).maybeSingle<{ user_id: string }>();
        if (!conversa) return;
        if (!await vendedorTemAnalisePendente(supabase, conversa.user_id, dataRef)) {
            await reabrir(supabase, 'relatorio_vendedor', conversa.user_id, dataRef);
        }
    } else if (tipo === 'relatorio_vendedor') {
        // A unidade do relatório, não a do perfil: o dia pertence a onde as
        // conversas aconteceram, mesmo que o vendedor já tenha mudado.
        const { data: relatorio } = await supabase.from('relatorios_diarios').select('unidade_id')
            .eq('user_id', referenciaId).eq('data_ref', dataRef).maybeSingle<{ unidade_id: string }>();
        if (relatorio) await reabrir(supabase, 'rollup_unidade', relatorio.unidade_id, dataRef);
        // Sem relatório (vendedor só com disparo ou aniversário, ou falha),
        // ninguém mais encadeia: se este era o último passo aberto do dia, é
        // daqui que a rede tem de sair.
        await talvezFecharRede(supabase, dataRef);
    } else if (tipo === 'rollup_unidade') {
        await talvezFecharRede(supabase, dataRef);
    }
}

/**
 * A rede fecha quando nada do dia que a alimenta está em aberto. Se algo
 * reabrir depois (análise atrasada), a cadeia passa por aqui de novo e a rede
 * é reaberta — nunca fica com um dia parcial para sempre.
 */
async function talvezFecharRede(supabase: Admin, dataRef: string) {
    const { count, error } = await supabase.from('fila_processamento').select('id', { count: 'exact', head: true })
        .in('tipo', ['analise_conversa', 'relatorio_vendedor', 'rollup_unidade']).eq('data_ref', dataRef).in('status', EM_ABERTO);
    if (error) throw new Error(error.message);
    if (!count) await reabrir(supabase, 'rollup_rede', '00000000-0000-0000-0000-000000000000', dataRef);
}

/**
 * O item já foi fechado quando isto roda: uma falha aqui não pode virar falha
 * dele. Fica no log; o próximo item do mesmo vendedor ou unidade encadeia de
 * novo.
 */
async function encadearSemFalhar(supabase: Admin, tipo: ItemTipo, referenciaId: string, dataRef: string) {
    await encadear(supabase, tipo, referenciaId, dataRef).catch((e) => {
        console.error(`processar-fila: falha ao encadear ${tipo} ${referenciaId} ${dataRef}`, e);
    });
}
