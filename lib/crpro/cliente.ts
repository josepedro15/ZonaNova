/**
 * Cliente da API pública do CRPRO (`docs/api/openapi.yaml` do repositório
 * Batepapo). A chave define a organização: a de produção é a da Zona Nova2.
 *
 * Toda escrita leva `connected_phone`, a linha de WhatsApp do CRPRO a que o
 * contato pertence — sem ela a API recusa.
 */
import { refExterna } from '../crm.ts';

type Fetch = typeof globalThis.fetch;

// Sem "parameter properties" neste arquivo: o `node --test` roda em
// strip-only mode, que as recusa.
export class ErroCrpro extends Error {
    readonly status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ErroCrpro';
        this.status = status;
    }
}

export type DestinoCrm = { pipelineId: string; stageId: string; linha: string };

export class Crpro {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly buscar: Fetch;

    constructor(baseUrl: string, apiKey: string, buscar: Fetch = globalThis.fetch) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.buscar = buscar;
    }

    private async chamar<T>(caminho: string, { metodo = 'GET', corpo }: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
        const r = await this.buscar(`${this.baseUrl}${caminho}`, {
            method: metodo,
            // Sem prazo, um CRPRO travado segurava o worker até o maxDuration.
            signal: AbortSignal.timeout(15_000),
            headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
            ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        });
        const texto = await r.text();
        // Sem a query: ela leva o telefone do cliente, e a mensagem vai para
        // `fila_processamento.ultimo_erro`.
        if (!r.ok) throw new ErroCrpro(`${metodo} ${caminho.split('?')[0]}: ${r.status} ${texto.slice(0, 300)}`, r.status);
        return (texto ? JSON.parse(texto) : {}) as T;
    }

    /** O card que já tem este external_ref, se houver. */
    async cardPorRef(ref: string): Promise<{ id: string } | null> {
        const r = await this.chamar<{ data?: { id: string }[] }>(`/deals?external_ref=${encodeURIComponent(ref)}&limit=1`);
        return r.data?.[0] ?? null;
    }

    /**
     * Cria ou atualiza pelo telefone (o CRPRO casa com e sem o nono dígito).
     * Nunca manda `tags`: neste endpoint elas SUBSTITUEM as do contato.
     */
    async salvarContato(c: { nome: string; telefone: string; linha: string }): Promise<{ id: string }> {
        const r = await this.chamar<{ contact?: { id?: string } }>('/contacts', {
            metodo: 'POST',
            corpo: { name: c.nome, phone: c.telefone, connected_phone: c.linha },
        });
        if (!r.contact?.id) throw new ErroCrpro('o CRPRO não devolveu o contato salvo');
        return { id: r.contact.id };
    }

    /** Soma às etiquetas que o contato já tem. */
    async etiquetar(contatoId: string, tags: string[], linha: string): Promise<void> {
        await this.chamar(`/contacts/${contatoId}/tags`, { metodo: 'POST', corpo: { tags, connected_phone: linha } });
    }

    async anotar(contatoId: string, texto: string, linha: string): Promise<void> {
        await this.chamar(`/contacts/${contatoId}/notes`, { metodo: 'POST', corpo: { content: texto, connected_phone: linha } });
    }

    async criarCard(c: { titulo: string; contatoId: string; ref: string; destino: DestinoCrm }): Promise<{ id: string }> {
        const r = await this.chamar<{ deal?: { id?: string } }>('/deals', {
            metodo: 'POST',
            corpo: {
                title: c.titulo, contact_id: c.contatoId, connected_phone: c.destino.linha,
                pipeline_id: c.destino.pipelineId, stage_id: c.destino.stageId, external_ref: c.ref,
            },
        });
        if (!r.deal?.id) throw new ErroCrpro('o CRPRO não devolveu o card criado');
        return { id: r.deal.id };
    }
}

export type Lead = { telefone: string; nome: string; titulo: string; etiqueta: string; nota: string };
export type Enviado = { contatoId: string; cardId: string; jaExistia: boolean };

/**
 * A sequência do envio. Contato e etiqueta primeiro: repetir é inofensivo.
 * O card só se o external_ref ainda não existe — o POST /deals com um ref
 * conhecido MOVERIA o card de volta para Lead. É isso que deixa a nova
 * tentativa, depois de uma falha no meio, sem duplicar nem desfazer nada.
 * A nota vem por último e só com card novo: se falhar, a nova tentativa acha
 * o card e segue sem ela, em vez de repetir a nota.
 */
export async function enviarLead(crpro: Crpro, lead: Lead, destino: DestinoCrm): Promise<Enviado> {
    const contato = await crpro.salvarContato({ nome: lead.nome, telefone: lead.telefone, linha: destino.linha });
    await crpro.etiquetar(contato.id, [lead.etiqueta], destino.linha);
    const ref = refExterna(lead.telefone);
    const existente = await crpro.cardPorRef(ref);
    if (existente) return { contatoId: contato.id, cardId: existente.id, jaExistia: true };
    const card = await crpro.criarCard({ titulo: lead.titulo, contatoId: contato.id, ref, destino });
    await crpro.anotar(contato.id, lead.nota, destino.linha);
    return { contatoId: contato.id, cardId: card.id, jaExistia: false };
}
