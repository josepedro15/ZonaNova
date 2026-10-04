import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crpro, ErroCrpro, enviarLead, type DestinoCrm, type Lead } from '../../lib/crpro/cliente.ts';

type Chamada = { chave: string; headers: Record<string, string>; corpo: unknown };

/**
 * fetch de mentira: responde pela chave "MÉTODO caminho" (caminho com a query)
 * e grava o que foi chamado, na ordem.
 */
function falso(respostas: Record<string, { status?: number; corpo: unknown }>) {
    const chamadas: Chamada[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
        const chave = `${init?.method ?? 'GET'} ${String(url).replace('https://crm', '')}`;
        chamadas.push({
            chave,
            headers: (init?.headers ?? {}) as Record<string, string>,
            corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const r = respostas[chave];
        if (!r) return new Response('{"error":{"message":"não mapeado"}}', { status: 404 });
        return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
    }) as unknown as typeof globalThis.fetch;
    return { f, chamadas };
}

const destino: DestinoCrm = { pipelineId: 'pipe-1', stageId: 'lead-1', linha: '5554900000000' };
const lead: Lead = {
    telefone: '5554998124471', nome: 'Maria Souza', titulo: 'Maria Souza · pedreira',
    etiqueta: 'Rafael', nota: 'Lead quente identificado pelo ZonaNova.',
};
const BUSCA = 'GET /deals?external_ref=zonanova%3A5554998124471&limit=1';

const comum = {
    'POST /contacts': { corpo: { success: true, contact: { id: 'c1' } } },
    'POST /contacts/c1/tags': { corpo: { success: true } },
    'POST /contacts/c1/notes': { corpo: { success: true, note: { id: 'n1' } } },
};

test('lead novo: contato, etiqueta, consulta, card e nota, nessa ordem', async () => {
    const { f, chamadas } = falso({
        ...comum,
        [BUSCA]: { corpo: { success: true, data: [] } },
        'POST /deals': { status: 201, corpo: { success: true, deal: { id: 'd1' } } },
    });
    const r = await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(r, { contatoId: 'c1', cardId: 'd1', jaExistia: false });
    assert.deepEqual(chamadas.map((c) => c.chave), [
        'POST /contacts', 'POST /contacts/c1/tags', BUSCA, 'POST /deals', 'POST /contacts/c1/notes',
    ]);
    assert.equal(chamadas[0].headers['x-api-key'], 'chave');
    assert.deepEqual(chamadas[3].corpo, {
        title: 'Maria Souza · pedreira', contact_id: 'c1', connected_phone: '5554900000000',
        pipeline_id: 'pipe-1', stage_id: 'lead-1', external_ref: 'zonanova:5554998124471',
    });
    assert.deepEqual(chamadas[1].corpo, { tags: ['Rafael'], connected_phone: '5554900000000' });
});

// No POST /contacts, `tags` SUBSTITUI as etiquetas do contato: um cliente que
// já fosse de outro vendedor perderia a etiqueta dele.
test('salvar contato nunca manda tags', async () => {
    const { f, chamadas } = falso({ ...comum, [BUSCA]: { corpo: { success: true, data: [{ id: 'd0' }] } } });
    await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(chamadas[0].corpo, { name: 'Maria Souza', phone: '5554998124471', connected_phone: '5554900000000' });
});

// O POST /deals com um external_ref conhecido MOVE o card para Lead: a nova
// tentativa depois de uma falha no meio desfaria o que o vendedor andou.
test('card que já existe não é recriado nem movido', async () => {
    const { f, chamadas } = falso({ ...comum, [BUSCA]: { corpo: { success: true, data: [{ id: 'd0' }] } } });
    const r = await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.deepEqual(r, { contatoId: 'c1', cardId: 'd0', jaExistia: true });
    assert.equal(chamadas.some((c) => c.chave === 'POST /deals'), false);
    assert.equal(chamadas.some((c) => c.chave === 'POST /contacts/c1/notes'), false);
});

// A nova tentativa que o desenho existe para suportar: a anterior criou o card
// e falhou depois (na nota, por exemplo). Contato e etiqueta são idempotentes e
// rodam de novo; o POST /deals nunca, porque moveria o card.
test('nova tentativa depois de card criado: refaz contato e etiqueta, sem POST /deals', async () => {
    const { f, chamadas } = falso({ ...comum, [BUSCA]: { corpo: { success: true, data: [{ id: 'd0' }] } } });
    const r = await enviarLead(new Crpro('https://crm', 'chave', f), lead, destino);
    assert.equal(r.jaExistia, true);
    assert.equal(r.cardId, 'd0');
    const chaves = chamadas.map((c) => c.chave);
    assert.equal(chaves.includes('POST /deals'), false);
    assert.equal(chaves.includes('POST /contacts'), true);
    assert.equal(chaves.includes('POST /contacts/c1/tags'), true);
});

test('erro da API vira ErroCrpro com o status e sem a query', async () => {
    const { f } = falso({
        ...comum,
        [BUSCA]: { status: 429, corpo: { error: { message: 'Too many requests', status: 429 } } },
    });
    await assert.rejects(enviarLead(new Crpro('https://crm', 'chave', f), lead, destino), (e: unknown) => {
        assert.ok(e instanceof ErroCrpro);
        assert.equal(e.status, 429);
        assert.doesNotMatch(e.message, /external_ref|5554998124471/);
        return true;
    });
});

test('resposta sem id do contato é erro, não card órfão', async () => {
    const { f, chamadas } = falso({ 'POST /contacts': { corpo: { success: true } } });
    await assert.rejects(enviarLead(new Crpro('https://crm', 'chave', f), lead, destino), ErroCrpro);
    assert.equal(chamadas.length, 1);
});
