/**
 * Buracos de captura: a conexão diz "conectada" e mesmo assim nada chega.
 *
 * Em 07/10/2026 o Vitor ficou das 10:56 até as 7:35 do dia seguinte sem
 * nenhuma mensagem gravada, nas duas direções, embora tenha negociado no
 * período (no dia 8 ele avisa ao cliente que "o piso vai durante a manhã").
 * O `/instance/status` respondia `connected`, a `webhook_entrada` estava vazia
 * e nenhum histórico chegou depois. O `ultimo_evento_em` não ajuda: só muda em
 * evento de conexão. Por isso a conexão passou a guardar a hora da última
 * mensagem (0030), e o `checar-conexoes` compara com o resto da unidade.
 *
 * Aqui só a decisão, sem I/O: a regra do silêncio, o recorte do buraco no dia
 * do relatório e a recuperação pela /message/find com as dependências
 * injetadas (o teste simula a UAZAPI e o banco).
 */

import { msDeExpediente, PREFIXO_LID } from './painel.ts';
import { normalizarMensagem, paraData, type MensagemUazapi } from './uazapi/normalizar.ts';

/**
 * Horas de expediente sem mensagem nenhuma, nas duas direções, para a conexão
 * ser tratada como "em silêncio". O cron roda de 2 em 2 horas: com este
 * limiar, o buraco do Vitor seria visto às 13h, e não no relatório do dia.
 */
export const LIMIAR_SILENCIO_MS = 2 * 60 * 60 * 1000;

/**
 * Abaixo disto de expediente dentro do dia, o buraco não marca o relatório:
 * um buraco que começou às 17h59 de sexta não diz nada da sexta.
 */
export const MIN_BURACO_NO_DIA_MS = 30 * 60 * 1000;

/**
 * A conexão está "conectada mas em silêncio"?
 *
 * Silêncio sozinho não basta: a loja fecha, há feriado, há vendedor com pouco
 * cliente. O que denuncia a captura é a UNIDADE continuar conversando — outra
 * conexão dela recebeu mensagem depois de passado o limiar do silêncio desta.
 * Unidade de um vendedor só nunca acusa: não há com o que comparar. (A
 * Lidiane, que faltou em 07/10, não cai aqui: os clientes continuaram
 * escrevendo para ela, e entrada também conta.)
 */
export function emSilencio({ ultima, agora, outrasDaUnidade }: {
    ultima: Date | null;
    agora: Date;
    outrasDaUnidade: readonly (Date | null)[];
}): boolean {
    if (!ultima) return false;
    if (msDeExpediente(ultima, agora) < LIMIAR_SILENCIO_MS) return false;
    return outrasDaUnidade.some((outra) => !!outra && msDeExpediente(ultima, outra) >= LIMIAR_SILENCIO_MS);
}

/** Um buraco gravado: `inicio` é a última mensagem antes dele; `fim`, a primeira depois (null enquanto aberto). */
export type Buraco = { inicio: string; fim: string | null };

export type IntervaloSemCaptura = { de: string; ate: string; expediente_ms: number };

/** Brasília é UTC−3 o ano todo (ver `msDeExpediente`). */
const janela = (dataRef: string) => ({
    inicio: new Date(`${dataRef}T00:00:00-03:00`),
    fim: new Date(new Date(`${dataRef}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000),
});

/**
 * Os buracos que tocam o expediente do dia, cortados nele. O relatório do
 * vendedor fica com `captura_incompleta` quando sobra algum: a IA e o gestor
 * não podem ler o silêncio desse intervalo como abandono do cliente.
 */
export function capturaDoDia(buracos: readonly Buraco[], dataRef: string, agora: Date): { incompleta: boolean; intervalos: IntervaloSemCaptura[] } {
    const dia = janela(dataRef);
    const intervalos: IntervaloSemCaptura[] = [];
    for (const b of buracos) {
        const de = new Date(Math.max(Date.parse(b.inicio), dia.inicio.getTime()));
        const ate = new Date(Math.min(b.fim ? Date.parse(b.fim) : agora.getTime(), dia.fim.getTime()));
        const expediente = msDeExpediente(de, ate);
        if (expediente >= MIN_BURACO_NO_DIA_MS) intervalos.push({ de: de.toISOString(), ate: ate.toISOString(), expediente_ms: expediente });
    }
    return { incompleta: intervalos.length > 0, intervalos };
}

/** Uma página da /message/find, mais recentes primeiro. */
export type PaginaMensagens = {
    messages?: MensagemUazapi[] | null;
    pagination?: { hasMore?: boolean; nextOffset?: number } | null;
};

export type ResultadoRecuperacao = {
    /** Mensagens que a UAZAPI tem depois do início do buraco e que o banco guardaria. */
    encontradas: number;
    /** As que faltavam no banco e foram reinjetadas. */
    recuperadas: number;
    /**
     * As de depois do buraco com contato fora da análise (bloqueado, interno,
     * colega conectado). A ingestão as descarta: não faltam no banco.
     */
    excluidas: number;
    /**
     * Por que nada foi reinjetado, quando é o caso:
     * - `uazapi_sem_mensagens`: a UAZAPI também não tem nada depois do buraco —
     *   a sessão é que parou de receber, não o webhook que deixou de entregar;
     * - `so_contatos_fora`: a UAZAPI recebeu, mas só de contatos fora da
     *   análise. A captura está em dia; quem ficou quieto foram os clientes;
     * - `sem_ancora`: não deu para achar, entre as que o banco já tem, uma
     *   mensagem para conferir o formato do id;
     * - `formato_id_divergente`: o id da /message/find não bate com o que o
     *   webhook gravou. Reinjetar duplicaria cada mensagem.
     */
    motivo: 'uazapi_sem_mensagens' | 'so_contatos_fora' | 'sem_ancora' | 'formato_id_divergente' | null;
};

/**
 * Os jeitos de montar, a partir do que a /message/find devolve, o id que o
 * webhook gravou em `wa_message_id`. O webhook manda `dono:messageid`; a
 * documentação da /message/find descreve o `id` como interno (`r` + hex).
 * Em vez de apostar, a recuperação confere numa mensagem que o banco já tem.
 */
const FORMATOS_DE_ID: ((m: MensagemUazapi, dono: string | null) => string | undefined)[] = [
    (m, dono) => (m.messageid && (m.owner ?? dono) ? `${m.owner ?? dono}:${m.messageid}` : undefined),
    (m) => m.id,
    (m) => m.messageid,
];

/** O telefone com que a ingestão gravaria a mensagem, ou null se ela nem chega ao banco (grupo, status, canal). */
const telefoneGuardavel = (m: MensagemUazapi): string | null => {
    const n = normalizarMensagem({ message: m });
    return 'descartar' in n ? null : n.clienteTelefone;
};

/** Teto de páginas por tentativa: um buraco de um dia cabe com folga. */
export const MAX_PAGINAS_RECUPERACAO = 5;

/**
 * Pede à UAZAPI o que ela tem desde o começo do buraco e reinjeta o que falta.
 *
 * A /message/find sem `chatid` devolve as mensagens da instância inteira, das
 * mais recentes para trás; pagina até alcançar o começo do buraco (ou o
 * teto). As que vêm daí para trás são as âncoras: ao menos uma delas tem de
 * estar no banco para se saber em que formato gravar o id. A ingestão é
 * idempotente por `wa_message_id`, então rodar duas vezes não duplica nada.
 *
 * `fora` é a regra de exclusão da ingestão (lib/exclusao.ts `estaFora`). Sem
 * ela, a conversa com um colega bloqueado "faltava" no banco a cada rodada,
 * era reinjetada, descartada de novo pela ingestão, e o buraco nunca fechava
 * (o Marco, 08–09/10).
 */
export async function recuperarMensagens({ buscar, idsGravados, ingerir, desde, dono, fora = () => false, porPagina = 200, maxPaginas = MAX_PAGINAS_RECUPERACAO }: {
    buscar: (offset: number, limite: number) => Promise<PaginaMensagens>;
    idsGravados: (ids: string[]) => Promise<Set<string>>;
    ingerir: (mensagens: MensagemUazapi[]) => Promise<void>;
    desde: Date;
    dono: string | null;
    fora?: (telefone: string) => boolean;
    porPagina?: number;
    maxPaginas?: number;
}): Promise<ResultadoRecuperacao> {
    const novas: MensagemUazapi[] = [];
    const ancoras: MensagemUazapi[] = [];
    let excluidas = 0;
    let offset = 0;
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
        const r = await buscar(offset, porPagina);
        const mensagens = r.messages ?? [];
        for (const m of mensagens) {
            const telefone = telefoneGuardavel(m);
            if (!telefone) continue;
            const depois = paraData(m.messageTimestamp ?? m.timestamp).getTime() > desde.getTime();
            if (depois && fora(telefone)) excluidas++;
            else if (!fora(telefone)) (depois ? novas : ancoras).push(m);
        }
        if (ancoras.length || !mensagens.length || !r.pagination?.hasMore) break;
        offset = r.pagination.nextOffset ?? offset + mensagens.length;
    }

    if (!novas.length) return { encontradas: 0, recuperadas: 0, excluidas, motivo: excluidas ? 'so_contatos_fora' : 'uazapi_sem_mensagens' };
    if (!ancoras.length) return { encontradas: novas.length, recuperadas: 0, excluidas, motivo: 'sem_ancora' };

    let formato: (typeof FORMATOS_DE_ID)[number] | null = null;
    for (const f of FORMATOS_DE_ID) {
        const ids = ancoras.slice(0, 50).map((m) => f(m, dono)).filter((id): id is string => !!id);
        if (ids.length && (await idsGravados(ids)).size > 0) { formato = f; break; }
    }
    if (!formato) return { encontradas: novas.length, recuperadas: 0, excluidas, motivo: 'formato_id_divergente' };

    const comId = novas.flatMap((m) => {
        const id = formato(m, dono);
        return id ? [{ ...m, id }] : [];
    });
    const jaGravados = await idsGravados(comId.map((m) => m.id));
    const faltam = comId.filter((m) => !jaGravados.has(m.id));
    if (faltam.length) await ingerir(faltam);
    return { encontradas: novas.length, recuperadas: faltam.length, excluidas, motivo: null };
}

/**
 * Quando a UAZAPI também não tinha nada (`uazapi_sem_mensagens`), o que
 * resta é pedir ao celular o histórico de cada conversa. O /message/history-sync
 * busca para TRÁS de uma mensagem âncora: a âncora é a primeira mensagem de
 * cada conversa depois do buraco, e o que vem antes dela é o buraco.
 * Uma por conversa (a primeira que aparecer: a lista vem em ordem de envio).
 */
export function ancorasDoHistorico(primeiras: readonly { cliente_telefone: string; wa_message_id: string }[]): { number: string; messageid: string }[] {
    const vistas = new Set<string>();
    const ancoras: { number: string; messageid: string }[] = [];
    for (const p of primeiras) {
        if (vistas.has(p.cliente_telefone)) continue;
        vistas.add(p.cliente_telefone);
        const number = p.cliente_telefone.startsWith(PREFIXO_LID)
            ? `${p.cliente_telefone.slice(PREFIXO_LID.length)}@lid`
            : `${p.cliente_telefone}@s.whatsapp.net`;
        ancoras.push({ number, messageid: p.wa_message_id.split(':').pop()! });
    }
    return ancoras;
}

/** Um erro de entrega do webhook, como a UAZAPI guarda em memória (GET /webhook/errors). */
export type ErroWebhook = {
    created?: string;
    event?: string;
    status_code?: number | null;
    attempts?: number;
    error?: string;
    stage?: string;
    payload?: unknown;
    url?: string;
};

export type ErroWebhookResumido = { created: string; event: string | null; status_code: number | null; attempts: number | null; error: string | null; stage: string | null };

/**
 * Os erros de entrega desde o começo do buraco, sem `payload` (é a fala do
 * cliente) nem `url` (leva o segredo do webhook). É o que responde se o
 * silêncio foi o webhook recusando (401/5xx, fila cheia) ou a sessão parada:
 * a UAZAPI só guarda os últimos 20, em memória, então é lido ao abrir o buraco.
 */
export function resumoErrosWebhook(erros: readonly ErroWebhook[] | null | undefined, desde: Date): ErroWebhookResumido[] {
    return (erros ?? [])
        .filter((e) => !!e.created && Date.parse(e.created) >= desde.getTime())
        .map((e) => ({
            created: e.created!, event: e.event ?? null, status_code: e.status_code ?? null,
            attempts: e.attempts ?? null, error: e.error?.slice(0, 300) ?? null, stage: e.stage ?? null,
        }));
}
