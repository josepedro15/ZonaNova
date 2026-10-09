import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { aposFalha, aposFalhaDoItem } from '@/lib/fila';
import { baixarMidiaSegura, hashDoAudio, promptDeTranscricao, transcrever } from '@/lib/transcricao';
import { descreverMidia, formatoLegivel, MAX_BYTES_MIDIA, midiaLigada } from '@/lib/midia';
import { analisarConversa, consolidarVendedor, RespostaIncompleta } from '@/lib/openai-analise';
import { ajustarAcolhida, aderenciaPercentual, custoEstimado, diaFechado, hashTranscript, janelaDoDia, marcaRetomada, montarTranscript, saudacaoInvisivel, type MensagemAnalise } from '@/lib/analise';
import { conferirDetalhe, detalheLigado, observacoesDoDetalhe, resumirObservacoes, type DetalheMec, type LinhaObservacao } from '@/lib/mec';
import { doutrinaMec } from '@/lib/pedido-analise';
import { cadastrosNaRede, DESCARTADA, naturezaSuspeita, sinalDoContato } from '@/lib/natureza';
import { comVendaPresencial } from '@/lib/presencial';
import { semAtividadeDeSaida } from '@/lib/consolidacao';
import { paginar } from '@/lib/paginar';
import { capturaDoDia, type Buraco } from '@/lib/captura';
import { numerosDoFechamento, respostasPorBloco, temposDeResposta, type Msg } from '@/lib/painel';
import { decifrar } from '@/lib/crypto';
import { Uazapi } from '@/lib/uazapi/cliente';
import { drenarEntradas, expurgarEntradas } from '@/lib/uazapi/ingestao';
import { decidirEnvio, etiquetaDoVendedor, faltandoParaEnviar, lerConfigCrm, nomeDoContato, notaDoCard, tituloDoCard, type Candidato } from '@/lib/crm';
import { Crpro, enviarLead } from '@/lib/crpro/cliente';

export const maxDuration = 300;

// Itens pegos de uma vez, processados em paralelo. Uma análise leva ~12s; o
// lote demora o que demora o item mais lento, então 8 juntos cabem ~3 vezes
// no orçamento abaixo.
const LOTE = 8;

// O pg_net espera no máximo 60s pela resposta; passando disso o banco registra
// timeout apesar de a Vercel continuar rodando. O worker pega lotes novos
// enquanto couber neste orçamento — com 4 itens por execução (48/h) a fila
// perdia para as transcrições do pico e a análise do meio-dia saía 2h depois.
const ORCAMENTO_LOTES_MS = 40_000;

// Acima de maxDuration com folga: item `processando` há mais que isso não tem
// mais nenhuma função trabalhando nele.
const PRAZO_PROCESSANDO_MS = 10 * 60_000;

// Depois disto o worker não começa a reprocessar entrada nova do webhook.
// Folga para o maxDuration de 300s, mesmo com a entrada em curso.
const PRAZO_DRENO_MS = 120_000;

/**
 * Worker da fila (doc 3 §3.4). Roda a cada 5 minutos.
 *
 * Trata a cadeia inteira: transcrição e descrição de mídia → análise → relatório → unidade → rede.
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

    const fila: Record<string, number> = { lotes: 0, pegos: 0, concluidos: 0, falhados: 0, reagendados: 0, reenfileirados: 0 };
    try {
        while (Date.now() - agora.getTime() < ORCAMENTO_LOTES_MS) {
            const lote = await processarLote(supabase, new Date());
            if ('aguardando' in lote) return Response.json({ ...lote, resgatados });
            fila.lotes++;
            for (const [k, v] of Object.entries(lote)) if (typeof v === 'number') fila[k] = (fila[k] ?? 0) + v;
            if (!lote.pegos) break;
        }
    } catch (e) {
        return Response.json({ erro: String(e), ...fila }, { status: 500 });
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
        .in('tipo', ['transcricao', 'descricao_midia', 'analise_conversa', 'relatorio_vendedor', 'rollup_unidade', 'rollup_rede', 'envio_crm'])
        .lte('proxima_tentativa_em', agora.toISOString())
        .order('proxima_tentativa_em')
        .limit(LOTE)
        .returns<{ id: string; tipo: ItemTipo; referencia_id: string; data_ref: string; tentativas: number }[]>();

    if (error) throw new Error(error.message);
    if (!candidatos?.length) return { pegos: 0, concluidos: 0, falhados: 0 };

    if (!apiKey && candidatos.some((c) => ['transcricao', 'descricao_midia', 'analise_conversa', 'relatorio_vendedor'].includes(c.tipo))) {
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
    // Cada item do lote é independente (uma linha da fila): rodam juntos.
    const desfechos = await Promise.all(candidatos.filter((c) => meus.has(c.id)).map((item) => processarItem(supabase, item, apiKey)));
    const contar = (d: string) => desfechos.filter((x) => x === d).length;
    return { pegos: meus.size, concluidos: contar('concluido'), falhados: contar('falhou'), reagendados: contar('pendente'), reenfileirados: contar('reenfileirado') };
}

type ItemFila = { id: string; tipo: ItemTipo; referencia_id: string; data_ref: string; tentativas: number };

async function processarItem(supabase: Admin, item: ItemFila, apiKey: string | undefined): Promise<string | null> {
    // Começa limpando a marca de reabertura: o que for reaberto a partir
    // daqui mudou DEPOIS do início desta execução, e só isso justifica
    // rodar o item de novo (ver 0017). Se a linha não está mais em
    // `processando`, alguém a resgatou — não é mais nossa.
    const { data: ainda } = await supabase.from('fila_processamento').update({ reaberto: false })
        .eq('id', item.id).eq('status', 'processando').select('id');
    if (!ainda?.length) return null;

    let desfecho: Record<string, unknown>;
    let encadeia = true;
    let encadeiaSeMudou = true;
    try {
        if (item.tipo === 'transcricao') await transcreverMensagem(supabase, item.referencia_id, apiKey!);
        else if (item.tipo === 'descricao_midia') await descreverMensagem(supabase, item.referencia_id, apiKey!);
        else if (item.tipo === 'analise_conversa') encadeiaSeMudou = await analisarItem(supabase, item.referencia_id, item.data_ref);
        else if (item.tipo === 'relatorio_vendedor') await consolidarItem(supabase, item.referencia_id, item.data_ref);
        else if (item.tipo === 'rollup_unidade') await rollupUnidade(supabase, item.referencia_id, item.data_ref);
        else if (item.tipo === 'rollup_rede') await rollupRede(supabase, item.data_ref);
        else if (item.tipo === 'envio_crm') await enviarAoCrmItem(supabase, item.referencia_id, item.data_ref);
        desfecho = { status: 'concluido', processado_em: new Date().toISOString() };
        encadeia = encadeiaSeMudou;
    } catch (e) {
        if (e instanceof IgnorarItem) {
            desfecho = { status: 'ignorado', ultimo_erro: e.message, processado_em: new Date().toISOString() };
        } else {
            // Resposta cortada da OpenAI: na análise se repete igual e
            // desiste já; no relatório, tenta de novo (ver `aposFalhaDoItem`).
            const falha = aposFalhaDoItem(item.tipo, e instanceof RespostaIncompleta, item.tentativas);
            desfecho = {
                status: falha.status,
                tentativas: falha.tentativas,
                ultimo_erro: String(e).slice(0, 500),
                ...('proximaTentativaEm' in falha
                    ? { proxima_tentativa_em: falha.proximaTentativaEm.toISOString() }
                    : { processado_em: new Date().toISOString() }),
            };
            // Retry não encadeia: o próximo passo espera. Falha definitiva
            // encadeia — o relatório sai sem esta conversa em vez de nunca.
            encadeia = falha.status === 'falhou';
        }
    }

    const fechado = await fechar(supabase, item.id, desfecho);
    if (fechado === 'reenfileirado') return 'reenfileirado';
    if (fechado === 'perdido') return null;
    if (encadeia) await encadearSemFalhar(supabase, item.tipo, item.referencia_id, item.data_ref);
    return String(desfecho.status);
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
        .select('id, tipo, referencia_id, data_ref, tentativas, reaberto')
        .eq('status', 'processando')
        .or(`iniciado_em.lt.${limite},and(iniciado_em.is.null,created_at.lt.${limite})`)
        .limit(50)
        .returns<{ id: string; tipo: ItemTipo; referencia_id: string; data_ref: string; tentativas: number; reaberto: boolean }[]>();
    if (error) throw new Error(error.message);

    for (const item of presos ?? []) {
        // Reaberto enquanto rodava: há dado novo esperando por ele. Volta à
        // fila do zero, como faria o `fechar` — contar a falha e, na última
        // tentativa, marcar `falhou` jogaria fora a reabertura e deixaria o
        // relatório (ou a unidade) parcial.
        if (item.reaberto) {
            await supabase.from('fila_processamento').update({
                status: 'pendente', reaberto: false, tentativas: 0, ultimo_erro: null, processado_em: null,
                proxima_tentativa_em: agora.toISOString(),
            }).eq('id', item.id).eq('status', 'processando');
            continue;
        }
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

type ItemTipo = 'transcricao' | 'descricao_midia' | 'analise_conversa' | 'relatorio_vendedor' | 'rollup_unidade' | 'rollup_rede' | 'envio_crm';
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
        midiaUrl = (await pedirMidiaAUazapi(supabase, msg)).fileURL;
        await supabase.from('mensagens').update({ midia_url: midiaUrl }).eq('id', msg.id);
    }

    // Os nomes de quem fala vão na pista de vocabulário: nome próprio é o que
    // a transcrição mais erra.
    const { data: conversa } = await supabase.from('conversas').select('cliente_nome,profiles!conversas_user_id_fkey(nome)').eq('id', msg.conversa_id)
        .maybeSingle<{ cliente_nome: string | null; profiles: { nome: string } | null }>();
    const { texto, hash } = await transcrever(midiaUrl, {
        apiKey,
        modelo: process.env.OPENAI_MODELO_AUDIO,
        prompt: promptDeTranscricao({ vendedor: conversa?.profiles?.nome, contato: conversa?.cliente_nome }),
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

/** URL temporária (2 dias) da mídia de uma mensagem, pedida à instância do vendedor. */
async function pedirMidiaAUazapi(supabase: Admin, msg: { conversa_id: string; wa_message_id: string }): Promise<{ fileURL: string; mimetype?: string }> {
    const { data: conversa } = await supabase.from('conversas').select('user_id').eq('id', msg.conversa_id)
        .maybeSingle<{ user_id: string }>();
    const { data: conexao } = conversa ? await supabase.from('conexoes_whatsapp').select('instance_token')
        .eq('user_id', conversa.user_id).maybeSingle<{ instance_token: string | null }>() : { data: null };
    const apiUrl = process.env.UAZAPI_API_URL;
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
    if (!conexao?.instance_token || !apiUrl || !adminToken) throw new Error('não foi possível recuperar a mídia');
    const token = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex'));
    return new Uazapi(apiUrl, adminToken).baixarMidia(token, msg.wa_message_id);
}

/**
 * Uma linha sobre a imagem ou o documento (lib/midia.ts). A mesma foto de
 * catálogo encaminhada por vários vendedores é descrita uma vez só: o hash do
 * arquivo é procurado antes da chamada paga, como no áudio.
 */
async function descreverMensagem(supabase: Admin, mensagemId: string, apiKey: string) {
    const { data: msg } = await supabase.from('mensagens')
        .select('id, conversa_id, wa_message_id, midia_nome, midia_descricao')
        .eq('id', mensagemId)
        .maybeSingle<{ id: string; conversa_id: string; wa_message_id: string; midia_nome: string | null; midia_descricao: string | null }>();
    if (!msg) throw new IgnorarItem('mensagem não existe mais');
    if (msg.midia_descricao) return;

    // Sempre uma URL nova: a mídia de imagem e documento não vem no webhook, e
    // a UAZAPI informa o mimetype antes de qualquer byte baixado.
    const midia = await pedirMidiaAUazapi(supabase, msg);
    const formato = formatoLegivel(midia.mimetype, msg.midia_nome);
    // Planilha, Word, áudio como documento: fica só o nome do arquivo.
    if (!formato) throw new IgnorarItem(`formato sem leitura: ${midia.mimetype ?? 'desconhecido'}`);

    const bytes = await baixarMidiaSegura(midia.fileURL, MAX_BYTES_MIDIA);
    const hash = hashDoAudio(bytes);
    const { data: igual } = await supabase.from('mensagens').select('midia_descricao')
        .eq('midia_hash', hash).not('midia_descricao', 'is', null)
        .limit(1).maybeSingle<{ midia_descricao: string }>();
    const descricao = igual?.midia_descricao ?? (await descreverMidia(bytes, formato, {
        // Modelo próprio para comparar mini e nano na leitura de orçamento sem
        // mexer no da análise; vazio, usa o mesmo.
        apiKey, nome: msg.midia_nome, mimetype: midia.mimetype, modelo: process.env.OPENAI_MODELO_MIDIA || process.env.OPENAI_MODEL,
    })).descricao;

    const { error } = await supabase.from('mensagens').update({ midia_descricao: descricao, midia_hash: hash }).eq('id', msg.id);
    if (error) throw error;
}

/**
 * O relatório do vendedor no dia é mais velho que alguma análise dele no
 * mesmo dia (ou não existe)? Compara com a MAIS RECENTE, não só com a
 * análise da vez: duas análises no mesmo lote — uma nova, outra repetida —
 * faziam a nova achar a irmã ainda rodando e a repetida achar o relatório em
 * dia com ela, e ninguém reabria o relatório.
 */
async function relatorioDesatualizado(supabase: Admin, userId: string, dataRef: string): Promise<boolean> {
    const [{ data: ultima, error: e1 }, { data: relatorio, error: e2 }] = await Promise.all([
        supabase.from('analises_conversa').select('updated_at').eq('user_id', userId).eq('data_ref', dataRef)
            .order('updated_at', { ascending: false }).limit(1).maybeSingle<{ updated_at: string }>(),
        supabase.from('relatorios_diarios').select('updated_at').eq('user_id', userId).eq('data_ref', dataRef)
            .maybeSingle<{ updated_at: string }>(),
    ]);
    if (e1 || e2) throw new Error((e1 ?? e2)!.message);
    if (!relatorio) return true;
    return !!ultima && Date.parse(relatorio.updated_at) < Date.parse(ultima.updated_at);
}

/**
 * Grava o detalhe do MEC de uma conversa num dia. Reanálise troca o detalhe
 * inteiro: apaga o que havia e grava o novo (ou nada, se a conversa deixou de
 * ser negociação ou a unidade está fora do piloto).
 */
async function gravarObservacoes(
    supabase: Admin,
    alvo: { conversaId: string; userId: string; unidadeId: string; dataRef: string; playbookId: string | null },
    detalhe: DetalheMec | null,
) {
    const { error: erroApagar } = await supabase.from('mec_observacoes').delete()
        .eq('conversa_id', alvo.conversaId).eq('data_ref', alvo.dataRef);
    if (erroApagar) throw erroApagar;
    if (!detalhe || !alvo.playbookId) return;
    const { error } = await supabase.from('mec_observacoes').insert(observacoesDoDetalhe(detalhe).map((o) => ({
        conversa_id: alvo.conversaId, user_id: alvo.userId, unidade_id: alvo.unidadeId,
        data_ref: alvo.dataRef, playbook_id: alvo.playbookId, ...o,
    })));
    if (error) throw error;
}

/**
 * Analisa uma conversa do dia. Devolve se o passo seguinte (o relatório do
 * vendedor) precisa rodar: análise nova, sim; transcript igual ao já
 * analisado, só se o relatório ainda não a incorporou.
 */
async function analisarItem(supabase: Admin, conversaId: string, dataRef: string): Promise<boolean> {
    const { inicio, fim } = janelaDoDia(dataRef);
    const { data: conversa } = await supabase.from('conversas').select('id,user_id,unidade_id,dispensada_em,fechada_presencial_ref,cliente_telefone,cliente_nome')
        .eq('id', conversaId).maybeSingle<{ id: string; user_id: string; unidade_id: string; dispensada_em: string | null; fechada_presencial_ref: string | null; cliente_telefone: string; cliente_nome: string | null }>();
    if (!conversa) throw new IgnorarItem('conversa não existe mais');
    // "Não é atendimento" (0027): a marca some sozinha quando o cliente escreve
    // de novo, e aí a conversa volta a ser analisada.
    if (conversa.dispensada_em) throw new IgnorarItem('marcada como não é atendimento');
    // A unidade vigente do vendedor HOJE, não a de quando a conversa nasceu
    // (doc 3 §3.3): depois de uma transferência, a carteira antiga dele
    // passaria a contar para sempre na unidade que ele deixou.
    const { data: perfil } = await supabase.from('profiles').select('unidade_id')
        .eq('id', conversa.user_id).maybeSingle<{ unidade_id: string | null }>();
    const unidadeId = perfil?.unidade_id ?? conversa.unidade_id;
    // Imagem e documento por unidade (lib/midia.ts): desligada, a consulta e
    // o transcript são os de antes, e as colunas novas nem são lidas.
    const comMidia = midiaLigada(unidadeId, process.env.MIDIA_UNIDADES);
    const { data: mensagens, error } = await supabase.from('mensagens')
        .select(`direcao,tipo,conteudo,transcricao,automatica,enviada_em${comMidia ? ',midia_nome,midia_descricao' : ''}`)
        .eq('conversa_id', conversaId).gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString())
        .order('enviada_em').returns<MensagemAnalise[]>();
    if (error) throw error;
    if (!mensagens?.length) throw new IgnorarItem('sem mensagens no dia');
    // A ausência automática da empresa do cliente não é resposta dele.
    if (!mensagens.some((m) => m.direcao === 'entrada' && !m.automatica)) throw new IgnorarItem('disparo sem resposta do cliente');
    if (mensagens.some((m) => /feliz anivers[aá]rio|parab[eé]ns pelo seu dia/i.test(m.conteudo ?? '')))
        throw new IgnorarItem('conversa de aniversário');

    const primeiraEntrada = mensagens.findIndex((m) => m.direcao === 'entrada');
    const recorte = primeiraEntrada > 0 && mensagens.slice(0, primeiraEntrada).every((m) => m.automatica)
        ? mensagens.slice(primeiraEntrada) : mensagens;
    const { data: anterior, error: erroAnterior } = await supabase.from('mensagens').select('enviada_em')
        .eq('conversa_id', conversaId).lt('enviada_em', inicio.toISOString())
        .order('enviada_em', { ascending: false }).limit(1).maybeSingle<{ enviada_em: string }>();
    if (erroAnterior) throw erroAnterior;
    const retomada = marcaRetomada(anterior?.enviada_em ?? null, inicio);
    const transcript = [retomada, montarTranscript(recorte)].filter(Boolean).join('\n');
    const hash = hashTranscript(transcript);
    const { data: existente } = await supabase.from('analises_conversa').select('id,transcript_hash,updated_at')
        .eq('conversa_id', conversaId).eq('data_ref', dataRef).maybeSingle<{ id: string; transcript_hash: string | null; updated_at: string }>();
    if (existente?.transcript_hash === hash) {
        // Nada mudou: reencadear pagaria a consolidação de novo à toa. Só
        // encadeia se o relatório não incorporou alguma análise do dia.
        return relatorioDesatualizado(supabase, conversa.user_id, dataRef);
    }

    // Piloto por unidade (spec §7): fora da lista, a análise é exatamente a de antes.
    const comDetalhe = detalheLigado(unidadeId, process.env.MEC_DETALHE_UNIDADES);
    const doutrina = await doutrinaMec(supabase, comDetalhe);
    const itensDetalhe = doutrina.playbookId && comDetalhe ? doutrina.itens : null;
    // Número cadastrado como interno em outra loja da rede, ou cargo no nome:
    // decide quem é o contato por cima da leitura da IA (lib/natureza.ts).
    const contato = sinalDoContato({ nome: conversa.cliente_nome, cadastros: await cadastrosNaRede(supabase, conversa.cliente_telefone) });
    const analise = await analisarConversa({ transcript, doutrina: doutrina.texto, itens: itensDetalhe, midia: comMidia, contato });
    const { modelo, entrada, saida } = analise;
    const resultado = ajustarAcolhida(analise.resultado, { retomada, invisivel: saudacaoInvisivel(recorte) });
    // As provas do detalhe são conferidas contra a conversa antes de gravar
    // (frase proibida fora da fala do vendedor, trecho que não existe).
    if (itensDetalhe && resultado.mec_detalhe) resultado.mec_detalhe = conferirDetalhe(resultado.mec_detalhe, transcript, itensDetalhe);

    // A análise (que guarda o hash do transcript) é gravada por último: se
    // algo falhar antes, a nova tentativa não cai no atalho de "transcript
    // igual" e refaz tudo.
    if (doutrina.playbookId && resultado.tipo_conversa === 'negociacao') {
        const { error: erroAderencia } = await supabase.from('aderencia_conversa').upsert(resultado.mec.map((m) => ({
            conversa_id: conversaId, user_id: conversa.user_id, unidade_id: unidadeId,
            data_ref: dataRef, playbook_id: doutrina.playbookId, etapa: m.etapa,
            aplicavel: m.aplicavel, aplicado: m.aplicado, justificativa: m.justificativa,
            evidencias: m.evidencias, itens: m.itens,
        })), { onConflict: 'conversa_id,data_ref,etapa' });
        if (erroAderencia) throw erroAderencia;
    }
    await gravarObservacoes(
        supabase,
        { conversaId, userId: conversa.user_id, unidadeId, dataRef, playbookId: doutrina.playbookId },
        resultado.tipo_conversa === 'negociacao' ? resultado.mec_detalhe ?? null : null,
    );
    // O gestor já disse "É cliente" a esta conversa: a marca passa adiante e a
    // sugestão de contato interno não volta (lib/natureza.ts).
    const { data: descartada, error: erroDescartada } = await supabase.from('analises_conversa').select('id')
        .eq('conversa_id', conversaId).eq(`payload->>${DESCARTADA}`, 'true').limit(1);
    if (erroDescartada) throw erroDescartada;
    const comDescarte = descartada?.length ? { ...resultado, [DESCARTADA]: true } : resultado;
    // Venda fechada na loja (lib/presencial.ts): a análise nova do dia marcado
    // continua contando como venda, e guarda o que a IA disse agora.
    const marca = conversa.fechada_presencial_ref === dataRef
        ? comVendaPresencial({ tipo_conversa: resultado.tipo_conversa, status: resultado.status, payload: comDescarte })
        : { tipo_conversa: resultado.tipo_conversa, status: resultado.status, payload: comDescarte };
    const payload = marca.payload;
    const { error: erroAnalise } = await supabase.from('analises_conversa').upsert({
        conversa_id: conversaId, user_id: conversa.user_id, unidade_id: unidadeId, data_ref: dataRef,
        tipo_conversa: marca.tipo_conversa, status: marca.status, sentiment: resultado.sentiment,
        score_atendimento: resultado.score_atendimento, score_oportunidade: resultado.score_oportunidade,
        score_risco: resultado.score_risco, estagio_funil: resultado.estagio_funil,
        potencial_venda: resultado.potencial_venda, urgencia: resultado.urgencia,
        payload, modelo, tokens_entrada: entrada, tokens_saida: saida,
        custo_estimado: custoEstimado(modelo, entrada, saida), transcript_hash: hash, updated_at: new Date().toISOString(),
    }, { onConflict: 'conversa_id,data_ref' });
    if (erroAnalise) throw erroAnalise;
    return true;
}

async function consolidarItem(supabase: Admin, userId: string, dataRef: string) {
    const { data: todas, error } = await supabase.from('analises_conversa')
        .select('conversa_id,unidade_id,tipo_conversa,status,score_atendimento,payload')
        .eq('user_id', userId).eq('data_ref', dataRef);
    if (error) throw error;
    if (!todas?.length) throw new IgnorarItem('nenhuma análise para consolidar');
    // "Não é atendimento" (0027) também fica de fora, enquanto a marca durar,
    // e a conversa bloqueada — contato interno da loja, colega conectado ou
    // bloqueio do vendedor: a análise feita antes do cadastro não pode
    // continuar contando como lead depois dele.
    // Lotes de 100 ids, pela URL do PostgREST, como as mensagens abaixo.
    const doDia = [...new Set(todas.map((a) => a.conversa_id as string))];
    const fora = new Set<string>();
    for (let i = 0; i < doDia.length; i += 100) {
        const { data: dispensadas, error: erroDispensadas } = await supabase.from('conversas').select('id')
            .in('id', doDia.slice(i, i + 100)).or('dispensada_em.not.is.null,bloqueada.eq.true').returns<{ id: string }[]>();
        if (erroDispensadas) throw erroDispensadas;
        for (const c of dispensadas ?? []) fora.add(c.id);
    }
    // Conversa que a análise viu, com confiança, como de colega, fornecedor ou
    // pessoal não entra no relatório — nem nota, nem lead, nem coaching — até
    // o gestor decidir no Perfil (lib/natureza.ts), o mesmo recorte das objeções.
    const analises = todas.filter((a) => !naturezaSuspeita(a.payload) && !fora.has(a.conversa_id as string));
    if (!analises.length) throw new IgnorarItem('só conversas sugeridas como contato interno');
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
                .select('conversa_id,direcao,automatica,enviada_em,tipo,conteudo').in('conversa_id', lote)
                .gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString())
                .order('id').range(de, de + 999)
                .returns<(Msg & { conversa_id: string })[]>();
            if (erroMensagens) throw erroMensagens;
            for (const m of mensagens ?? []) porConversa.set(m.conversa_id, [...(porConversa.get(m.conversa_id) ?? []), m]);
            if ((mensagens ?? []).length < 1000) break;
        }
    }
    // Bloco sem resposta conta até o fim do expediente do dia — ou até agora,
    // quando o relatório é parcial (o dia ainda não acabou).
    const corte = new Date(Math.min(fim.getTime(), Date.now()));
    const tempos = [...porConversa.values()].flatMap((msgs) => temposDeResposta(msgs, corte));
    const respostas = [...porConversa.values()].flatMap((msgs) => respostasPorBloco(msgs, corte));
    const metricas = {
        score_geral: negociacoes.length ? negociacoes.reduce((s, a) => s + Number(a.score_atendimento ?? 0), 0) / negociacoes.length : null,
        leads_atendidos: porConversa.size,
        conversoes_confirmadas: negociacoes.filter((a) => a.status === 'venda_feita').length,
        oportunidades_perdidas: negociacoes.filter((a) => a.status === 'perdida' || a.status === 'lead_frio').length,
        tempo_medio_resposta_s: tempos.length ? Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length / 1000) : null,
        taxa_resposta: respostas.length ? respostas.filter(Boolean).length / respostas.length * 100 : null,
    };
    // O coaching comercial não pode punir o vendedor por suporte, conversa
    // social ou testes técnicos. Esses itens continuam nas métricas de resposta,
    // mas o treino usa negociações quando houver ao menos uma.
    const baseCoaching = negociacoes.length ? negociacoes : analises;
    // O detalhe do MEC não entra no coaching: é o único campo retirado. O resto
    // do payload segue inteiro (perfil_cliente/profissao_cliente inclusive), e
    // erros_vendedor/evidencias são o lastro que lib/consolidacao.ts confere.
    const semDetalhe = (payload: unknown): Record<string, unknown> => {
        const copia = { ...(payload as Record<string, unknown>) };
        delete copia.mec_detalhe;
        return copia;
    };
    const unidadeId = String(analises[0].unidade_id);
    // Buraco de captura no expediente do dia (lib/captura.ts): o relatório é
    // marcado e a IA é avisada, para o silêncio não virar abandono.
    const { data: buracos, error: erroBuracos } = await supabase.from('buracos_captura').select('inicio,fim')
        .eq('user_id', userId).lt('inicio', fim.toISOString()).or(`fim.is.null,fim.gt.${inicio.toISOString()}`)
        .returns<Buraco[]>();
    if (erroBuracos) throw erroBuracos;
    const captura = capturaDoDia(buracos ?? [], dataRef, new Date());
    const marcaCaptura = captura.incompleta
        ? { captura_incompleta: true, payloadCaptura: { captura: { intervalos: captura.intervalos } } }
        : { captura_incompleta: false, payloadCaptura: {} };
    // Nenhuma mensagem do vendedor saiu no dia: sem atendimento não há nota nem
    // treino, e a IA inventava um elogio. Os números de entrada continuam.
    if (semAtividadeDeSaida([...porConversa.values()].flat())) {
        const { error: erroRel } = await supabase.from('relatorios_diarios').upsert({
            user_id: userId, unidade_id: unidadeId, data_ref: dataRef, ...metricas, score_geral: null,
            captura_incompleta: marcaCaptura.captura_incompleta,
            pontos_positivos: [], pontos_negativos: [], payload: { sem_atividade_saida: true, ...marcaCaptura.payloadCaptura },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,data_ref' });
        if (erroRel) throw erroRel;
        await consolidarAderenciaDiaria(supabase, userId, unidadeId, dataRef);
        return;
    }
    const consolidado = await consolidarVendedor(baseCoaching.map((a) => semDetalhe(a.payload)), metricas, baseCoaching.map((a) => a.conversa_id as string), captura.incompleta ? captura : null);
    const { error: erroRel } = await supabase.from('relatorios_diarios').upsert({
        user_id: userId, unidade_id: unidadeId, data_ref: dataRef, ...metricas,
        captura_incompleta: marcaCaptura.captura_incompleta,
        pontos_positivos: [consolidado.resultado.elogio, ...consolidado.resultado.padroes_sucesso].filter(Boolean),
        pontos_negativos: consolidado.resultado.melhorias,
        payload: { ...consolidado.resultado, ...marcaCaptura.payloadCaptura, uso: { modelo: consolidado.modelo, entrada: consolidado.entrada, saida: consolidado.saida, custo: custoEstimado(consolidado.modelo, consolidado.entrada, consolidado.saida) } },
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,data_ref' });
    if (erroRel) throw erroRel;
    await consolidarAderenciaDiaria(supabase, userId, unidadeId, dataRef);
}

async function consolidarAderenciaDiaria(supabase: Admin, userId: string, unidadeId: string, dataRef: string) {
    const [{ data: linhas, error: erroLinhas }, observacoes] = await Promise.all([
        supabase.from('aderencia_conversa').select('conversa_id,playbook_id,etapa,aplicavel,aplicado,itens')
            .eq('user_id', userId).eq('data_ref', dataRef),
        // 20+ linhas por negociação: um dia cheio passa do corte de 1000 do PostgREST.
        paginar<LinhaObservacao>((de, ate) => supabase.from('mec_observacoes').select('conversa_id,etapa,sinal,item_chave,valor,detalhe,trecho')
            .eq('user_id', userId).eq('data_ref', dataRef).order('id').range(de, ate)),
    ]);
    if (erroLinhas) throw erroLinhas;
    if (!linhas?.length) return;
    const aplicaveis = linhas.filter((l) => l.aplicavel);
    const etapas = [...new Set(aplicaveis.map((l) => String(l.etapa)))];
    const porEtapa = Object.fromEntries(etapas.map((etapa) => {
        const nota = aderenciaPercentual(aplicaveis.filter((l) => l.etapa === etapa));
        return [etapa, nota === null ? null : Math.round(nota)];
    }));
    // Detalhe do MEC (spec §5.2): só existe para conversas analisadas com ele.
    const sondagemAplicavel = new Set(aplicaveis.filter((l) => l.etapa === 'sondagem').map((l) => String(l.conversa_id)));
    const resumo = observacoes.length ? resumirObservacoes(observacoes, sondagemAplicavel) : null;
    const { error: erroDiaria } = await supabase.from('aderencia_diaria').upsert({
        user_id: userId, unidade_id: unidadeId, data_ref: dataRef, playbook_id: linhas[0].playbook_id,
        aderencia_geral: aderenciaPercentual(aplicaveis),
        por_etapa: porEtapa,
        sondagem_itens: resumo?.sondagem_itens ?? null,
        frases_proibidas: resumo?.frases_proibidas ?? 0,
        detalhe: resumo?.detalhe ?? {},
    }, { onConflict: 'user_id,data_ref' });
    if (erroDiaria) throw erroDiaria;
}

async function rollupUnidade(supabase: Admin, unidadeId: string, dataRef: string) {
    const { data: relatorios, error } = await supabase.from('relatorios_diarios').select('*').eq('unidade_id', unidadeId).eq('data_ref', dataRef);
    if (error) throw error;
    if (!relatorios?.length) throw new IgnorarItem('unidade sem relatórios');
    const r = relatorios as Record<string, unknown>[];
    // Sem conferir o erro, o item saía "concluído" e o relatório não existia.
    const { error: erroGravar } = await supabase.from('relatorios_unidade').upsert({
        unidade_id: unidadeId, data_ref: dataRef, vendedores_ativos: r.length, ...numerosDoFechamento(r),
        resumo_ia: `A unidade fechou o dia com ${r.length} vendedor${r.length === 1 ? '' : 'es'} com movimento.`, updated_at: new Date().toISOString(),
    }, { onConflict: 'unidade_id,data_ref' });
    if (erroGravar) throw erroGravar;
}

async function rollupRede(supabase: Admin, dataRef: string) {
    const { data: unidades, error } = await supabase.from('relatorios_unidade').select('*').eq('data_ref', dataRef);
    if (error) throw error;
    if (!unidades?.length) throw new IgnorarItem('rede sem unidades consolidadas');
    const r = unidades as Record<string, unknown>[];
    const { error: erroGravar } = await supabase.from('relatorios_rede').upsert({
        data_ref: dataRef, unidades_ativas: r.length, vendedores_ativos: r.reduce((s, x) => s + Number(x.vendedores_ativos ?? 0), 0),
        ...numerosDoFechamento(r),
        resumo_ia: `A rede fechou ${r.length} unidade${r.length === 1 ? '' : 's'} com movimento.`, updated_at: new Date().toISOString(),
    }, { onConflict: 'data_ref' });
    if (erroGravar) throw erroGravar;
}

type CandidatoCrm = {
    dados: Candidato;
    userId: string;
    unidadeId: string;
    nomeCliente: string | null;
    vendedor: string;
    score: number;
    resumo: string;
    proximaAcao: string;
    profissao: string;
};

/** A conversa, a análise DO DIA e o nome do vendedor — o que o envio ao CRM precisa. */
async function candidatoCrm(supabase: Admin, conversaId: string, dataRef: string): Promise<CandidatoCrm | null> {
    const { data: conversa, error } = await supabase.from('conversas')
        .select('user_id, unidade_id, cliente_telefone, cliente_nome, bloqueada, dispensada_em, analises_conversa(unidade_id, tipo_conversa, status, potencial_venda, score_oportunidade, payload)')
        .eq('id', conversaId).eq('analises_conversa.data_ref', dataRef)
        .maybeSingle<{
            user_id: string; unidade_id: string; cliente_telefone: string; cliente_nome: string | null; bloqueada: boolean; dispensada_em: string | null;
            analises_conversa: { unidade_id: string; tipo_conversa: string | null; status: string | null; potencial_venda: string | null; score_oportunidade: number | null; payload: Record<string, unknown> | null }[];
        }>();
    if (error) throw error;
    if (!conversa) return null;
    const { data: perfil, error: erroPerfil } = await supabase.from('profiles').select('nome')
        .eq('id', conversa.user_id).maybeSingle<{ nome: string }>();
    if (erroPerfil) throw erroPerfil;
    const analise = conversa.analises_conversa[0] ?? null;
    // A análise grava a unidade ATUAL do vendedor (`analisarItem`); a da
    // conversa pode ser a antiga se ele foi transferido. Sem análise, o
    // `decidirEnvio` ignora o item e a unidade da conversa não decide nada.
    const unidadeId = analise?.unidade_id ?? conversa.unidade_id;
    // Análise anterior ao perfil do cliente não tem profissão no payload.
    const texto = (campo: string) => typeof analise?.payload?.[campo] === 'string' ? analise.payload[campo] as string : '';
    return {
        dados: {
            // Dispensada ("Não é atendimento") não é lead: o CRM a trata como bloqueada.
            unidadeId, bloqueada: conversa.bloqueada || !!conversa.dispensada_em, telefone: conversa.cliente_telefone,
            suspeitaInterno: naturezaSuspeita(analise?.payload) !== null,
            analise: analise && {
                tipo_conversa: analise.tipo_conversa, status: analise.status,
                potencial_venda: analise.potencial_venda, score_oportunidade: analise.score_oportunidade,
            },
        },
        userId: conversa.user_id,
        unidadeId,
        nomeCliente: conversa.cliente_nome,
        vendedor: perfil?.nome ?? 'Vendedor',
        score: analise?.score_oportunidade ?? 0,
        resumo: texto('resumo'),
        proximaAcao: texto('proxima_acao'),
        profissao: texto('profissao_cliente'),
    };
}

/**
 * Leva o lead quente ao CRPRO — ou, em simulação, só registra que levaria.
 * `envios_crm` garante um card por telefone: o mesmo cliente volta em todo
 * dia que conversa, e pode falar com dois vendedores.
 */
async function enviarAoCrmItem(supabase: Admin, conversaId: string, dataRef: string) {
    const config = lerConfigCrm(process.env);
    const c = await candidatoCrm(supabase, conversaId, dataRef);
    if (!c) throw new IgnorarItem('conversa não encontrada');
    const decisao = decidirEnvio(c.dados, config);
    if (decisao.acao === 'ignorar') throw new IgnorarItem(decisao.motivo);
    const modo = decisao.acao === 'enviar' ? 'envio' : 'simulacao';

    const { data: ja, error: erroJa } = await supabase.from('envios_crm').select('id')
        .eq('telefone', decisao.telefone).eq('modo', modo).maybeSingle();
    if (erroJa) throw erroJa;
    if (ja) throw new IgnorarItem('cliente já está no CRM');

    let ids: { crpro_contato_id: string | null; crpro_card_id: string | null } = { crpro_contato_id: null, crpro_card_id: null };
    if (decisao.acao === 'enviar') {
        const faltam = faltandoParaEnviar(config);
        // Erro, não ignorado: configuração faltando tem de aparecer como falha.
        if (faltam.length) throw new Error(`envio ao CRM sem configuração: ${faltam.join(', ')}`);
        const r = await enviarLead(new Crpro(config.baseUrl, config.apiKey), {
            telefone: decisao.telefone,
            nome: nomeDoContato(c.nomeCliente, decisao.telefone),
            titulo: tituloDoCard(c.nomeCliente, c.profissao, decisao.telefone),
            etiqueta: etiquetaDoVendedor(c.vendedor),
            nota: notaDoCard({ vendedor: c.vendedor, dataRef, score: c.score, resumo: c.resumo, proximaAcao: c.proximaAcao }),
        }, { pipelineId: config.pipelineId, stageId: config.stageId, linha: config.linha });
        ids = { crpro_contato_id: r.contatoId, crpro_card_id: r.cardId };
    }

    // Dois workers com o mesmo cliente ao mesmo tempo: o segundo bate na
    // unique e não grava de novo. No CRPRO o card continua um só (o
    // external_ref o acha antes do POST /deals, ou no pior caso só o move para
    // a mesma etapa), mas a etiqueta do vendedor e a nota podem sair em dobro.
    const { error } = await supabase.from('envios_crm').upsert({
        telefone: decisao.telefone, modo, conversa_id: conversaId, user_id: c.userId,
        unidade_id: c.unidadeId, data_ref: dataRef, ...ids,
    }, { onConflict: 'telefone,modo', ignoreDuplicates: true });
    if (error) throw error;
}

/** Lead quente da análise do dia entra na fila do CRM; o resto nem vira item. */
async function talvezEnfileirarCrm(supabase: Admin, conversaId: string, dataRef: string) {
    const config = lerConfigCrm(process.env);
    // Desligado: nem consulta o banco.
    if (!config.unidades.trim()) return;
    const c = await candidatoCrm(supabase, conversaId, dataRef);
    if (c && decidirEnvio(c.dados, config).acao !== 'ignorar') await reabrir(supabase, 'envio_crm', conversaId, dataRef);
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
    // Uma ida ao banco (migration 0018). A varredura abaixo fica só como
    // reserva enquanto a função não existir.
    const { data, error: erroRpc } = await supabase.rpc('zn_vendedor_tem_analise_aberta', { p_user: userId, p_data: dataRef });
    if (!erroRpc) return data === true;
    if (erroRpc.code !== 'PGRST202') throw new Error(erroRpc.message);
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
        // Análise das 12h e das 18h (dia ainda aberto) só atualiza a conversa:
        // o relatório do dia sai quando ele fecha, no fechar-dia das 00h30.
        if (diaFechado(dataRef, new Date()) && !await vendedorTemAnalisePendente(supabase, conversa.user_id, dataRef)) {
            await reabrir(supabase, 'relatorio_vendedor', conversa.user_id, dataRef);
        }
        // Depois do relatório, e com o próprio catch: o CRM falhar não pode
        // impedir o dia de fechar.
        await talvezEnfileirarCrm(supabase, referenciaId, dataRef).catch((e) => {
            console.error(`processar-fila: falha ao enfileirar envio ao CRM ${referenciaId} ${dataRef}`, e);
        });
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
