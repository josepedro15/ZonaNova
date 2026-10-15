import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recuperarMensagens } from '../../lib/captura.ts';
import type { MensagemUazapi } from '../../lib/uazapi/normalizar.ts';

const DONO = '5551999990000';
const DESDE = new Date('2026-10-08T19:00:00Z');

/** Mensagem do vendedor, `minutos` depois (positivo) ou antes (negativo) do início do buraco. */
const msg = (n: number, minutos: number): MensagemUazapi => ({
    id: `id${n}`, messageid: `M${n}`, owner: DONO, chatid: '5551981009857@s.whatsapp.net', fromMe: true,
    messageType: 'conversation', text: `texto ${n}`, messageTimestamp: DESDE.getTime() + minutos * 60_000,
});

/**
 * UAZAPI como a busca sem chat responde de verdade: páginas das mais recentes
 * para trás e `pagination: null` (instância do Rafael, 15/10/2026).
 */
function semPaginacao(todas: MensagemUazapi[]) {
    const offsets: number[] = [];
    const buscar = async (offset: number, limite: number) => {
        offsets.push(offset);
        return { messages: todas.slice(offset, offset + limite), pagination: null };
    };
    return { buscar, offsets };
}

// Buraco com 5 mensagens novas e 2 de antes dele (as âncoras), em páginas de 3.
const novas = [5, 4, 3, 2, 1].map((n) => msg(n, n));
const ancoras = [msg(0, -1), msg(-1, -2)];

test('sem pagination, página cheia continua até achar a âncora do buraco', async () => {
    const { buscar, offsets } = semPaginacao([...novas, ...ancoras]);
    let ingeridas: MensagemUazapi[] = [];
    const r = await recuperarMensagens({
        buscar, desde: DESDE, dono: DONO, porPagina: 3, maxPaginas: 5,
        idsGravados: async (ids) => new Set(ids.filter((id) => id.endsWith(':M0') || id.endsWith(':M-1'))),
        ingerir: async (m) => { ingeridas = m; },
    });
    assert.deepEqual(offsets, [0, 3]); // a âncora já vem na 2ª página
    assert.ok(!r.motivo);
    assert.equal(r.encontradas, 5);
    assert.equal(r.recuperadas, 5);
    assert.equal(ingeridas.length, 5);
});

test('sem pagination, página incompleta é a última', async () => {
    const { buscar, offsets } = semPaginacao(novas.slice(0, 2));
    const r = await recuperarMensagens({
        buscar, desde: DESDE, dono: DONO, porPagina: 3, maxPaginas: 5,
        idsGravados: async () => new Set(), ingerir: async () => {},
    });
    assert.deepEqual(offsets, [0]);
    assert.equal(r.motivo, 'sem_ancora');
});

test('com hasMore false, para mesmo com página cheia', async () => {
    const offsets: number[] = [];
    const r = await recuperarMensagens({
        buscar: async (offset, limite) => { offsets.push(offset); return { messages: novas.slice(offset, offset + limite), pagination: { hasMore: false } }; },
        desde: DESDE, dono: DONO, porPagina: 3, maxPaginas: 5,
        idsGravados: async () => new Set(), ingerir: async () => {},
    });
    assert.deepEqual(offsets, [0]);
    assert.equal(r.motivo, 'sem_ancora');
});
