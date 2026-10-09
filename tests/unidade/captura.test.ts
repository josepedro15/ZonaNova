import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    emSilencio, capturaDoDia, recuperarMensagens, ancorasDoHistorico, resumoErrosWebhook, LIMIAR_SILENCIO_MS,
} from '../../lib/captura.ts';
import { Uazapi } from '../../lib/uazapi/cliente.ts';
import type { MensagemUazapi } from '../../lib/uazapi/normalizar.ts';

/** Horário de Brasília (UTC−3) em 07/10/2026, uma quarta-feira. */
const brt = (dia: string, hhmm: string) => new Date(`2026-10-${dia}T${hhmm}:00-03:00`);
const HORA = 60 * 60 * 1000;

// --- conectada mas em silêncio ------------------------------------------------

test('o caso do Vitor: 2h de expediente sem nada enquanto a unidade conversa', () => {
    assert.equal(emSilencio({
        ultima: brt('07', '10:56'), agora: brt('07', '13:00'),
        outrasDaUnidade: [brt('07', '12:58'), null],
    }), true);
});

test('menos que o limiar de expediente ainda não é silêncio', () => {
    assert.equal(emSilencio({
        ultima: brt('07', '10:56'), agora: brt('07', '12:30'), outrasDaUnidade: [brt('07', '12:29')],
    }), false);
});

test('o relógio do silêncio só corre no expediente: sexta 17h30 → sábado 9h é 1h30', () => {
    assert.equal(emSilencio({
        ultima: brt('09', '17:30'), agora: brt('10', '09:00'), outrasDaUnidade: [brt('10', '08:59')],
    }), false);
});

test('a unidade inteira quieta (feriado, loja fechada) não é falha de captura', () => {
    // A colega também parou logo depois: ninguém conversou durante o silêncio.
    assert.equal(emSilencio({
        ultima: brt('07', '10:56'), agora: brt('07', '15:00'), outrasDaUnidade: [brt('07', '11:30')],
    }), false);
});

test('sem colega na unidade não há com o que comparar', () => {
    assert.equal(emSilencio({ ultima: brt('07', '10:56'), agora: brt('07', '18:00'), outrasDaUnidade: [] }), false);
});

test('conexão que nunca recebeu mensagem não entra na regra', () => {
    assert.equal(emSilencio({ ultima: null, agora: brt('07', '18:00'), outrasDaUnidade: [brt('07', '17:00')] }), false);
});

test('o limiar é de duas horas de expediente', () => {
    assert.equal(LIMIAR_SILENCIO_MS, 2 * HORA);
});

// --- o buraco no relatório do dia ---------------------------------------------

const buracoVitor = { inicio: brt('07', '10:56').toISOString(), fim: brt('08', '07:35').toISOString() };

test('o dia do buraco fica com captura incompleta, cortado no fim do dia', () => {
    const c = capturaDoDia([buracoVitor], '2026-10-07', brt('09', '00:00'));
    assert.equal(c.incompleta, true);
    assert.deepEqual(c.intervalos, [{
        de: brt('07', '10:56').toISOString(),
        ate: brt('08', '00:00').toISOString(),
        // 10:56 → 18:00
        expediente_ms: 7 * HORA + 4 * 60_000,
    }]);
});

test('o dia seguinte não herda o buraco que só tocou a madrugada', () => {
    const c = capturaDoDia([buracoVitor], '2026-10-08', brt('09', '00:00'));
    assert.equal(c.incompleta, false);
    assert.deepEqual(c.intervalos, []);
});

test('buraco ainda aberto vale até agora', () => {
    const c = capturaDoDia([{ inicio: buracoVitor.inicio, fim: null }], '2026-10-07', brt('07', '15:00'));
    assert.equal(c.incompleta, true);
    assert.equal(c.intervalos[0].ate, brt('07', '15:00').toISOString());
    assert.equal(c.intervalos[0].expediente_ms, 4 * HORA + 4 * 60_000);
});

test('buraco que encolheu com a recuperação e ficou curto no dia não marca', () => {
    const c = capturaDoDia([{ inicio: brt('07', '10:56').toISOString(), fim: brt('07', '11:10').toISOString() }], '2026-10-07', brt('09', '00:00'));
    assert.equal(c.incompleta, false);
});

// --- recuperação pela /message/find (simulada) --------------------------------

const DONO = '555199990000';

/** Uma mensagem como a /message/find devolve: `id` interno, `messageid` do WhatsApp, timestamp em ms. */
const achada = (messageid: string, quando: Date, extra: Partial<MensagemUazapi> = {}): MensagemUazapi => ({
    id: `r${messageid.slice(-7).toLowerCase()}`, messageid, owner: DONO,
    chatid: '5551981009857@s.whatsapp.net', fromMe: true, messageType: 'conversation',
    text: `texto ${messageid}`, messageTimestamp: quando.getTime(), ...extra,
});

/** UAZAPI de mentira: devolve as mensagens em páginas, mais recentes primeiro, como a real. */
function uazapiFalsa(todas: MensagemUazapi[]) {
    const pedidos: unknown[] = [];
    const buscar = (async (url: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(url), 'https://uaz/message/find');
        const corpo = JSON.parse(String(init?.body)) as { limit: number; offset: number };
        pedidos.push(corpo);
        const pagina = todas.slice(corpo.offset, corpo.offset + corpo.limit);
        const hasMore = corpo.offset + corpo.limit < todas.length;
        return new Response(JSON.stringify({
            messages: pagina, pagination: { limit: corpo.limit, offset: corpo.offset, hasMore, nextOffset: corpo.offset + corpo.limit },
        }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    return { uaz: new Uazapi('https://uaz', 'adm', buscar), pedidos };
}

/** O que o banco já tem: os ids no formato do webhook (`dono:messageid`). */
function bancoFalso(ids: string[]) {
    const gravados = new Set(ids);
    const ingeridas: MensagemUazapi[][] = [];
    return {
        gravados,
        ingeridas,
        idsGravados: async (candidatos: string[]) => new Set(candidatos.filter((id) => gravados.has(id))),
        ingerir: async (mensagens: MensagemUazapi[]) => {
            ingeridas.push(mensagens);
            for (const m of mensagens) gravados.add(m.id!);
        },
    };
}

test('recupera o buraco: reinjeta só o que faltou, com o id no formato do webhook', async () => {
    const desde = brt('07', '10:56');
    // Mais recentes primeiro. A das 10:56 é a última que o webhook gravou.
    const { uaz, pedidos } = uazapiFalsa([
        achada('3EB0AAA0003', brt('07', '16:40')),
        achada('3EB0AAA0002', brt('07', '14:05'), { fromMe: false, text: 'pode mandar o piso amanhã?' }),
        achada('3EB0AAA0001', brt('07', '11:20')),
        achada('3EB0AAA0000', desde),
        achada('3EB0AAA9999', brt('07', '09:00')),
    ]);
    const banco = bancoFalso([`${DONO}:3EB0AAA0000`, `${DONO}:3EB0AAA9999`, `${DONO}:3EB0AAA0003`]);

    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, porPagina: 2,
    });

    assert.deepEqual(r, { encontradas: 3, recuperadas: 2, motivo: null });
    assert.deepEqual(banco.ingeridas.flat().map((m) => m.id), [`${DONO}:3EB0AAA0002`, `${DONO}:3EB0AAA0001`]);
    // Parou na página que alcançou a última mensagem gravada.
    assert.deepEqual(pedidos, [{ limit: 2, offset: 0 }, { limit: 2, offset: 2 }]);
    // E a reinjeção é idempotente: rodar de novo não acha mais nada a gravar.
    const deNovo = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, porPagina: 2,
    });
    assert.deepEqual(deNovo, { encontradas: 3, recuperadas: 0, motivo: null });
});

test('id em formato que o banco não reconhece: não reinjeta nada (duplicaria tudo)', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([achada('3EB0AAA0001', brt('07', '11:20')), achada('3EB0AAA0000', desde)]);
    const banco = bancoFalso(['outro-formato-3EB0AAA0000']);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 1, recuperadas: 0, motivo: 'formato_id_divergente' });
    assert.equal(banco.ingeridas.length, 0);
});

test('o banco guarda o messageid puro: a conferência descobre e usa esse formato', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([achada('3EB0AAA0001', brt('07', '11:20')), achada('3EB0AAA0000', desde)]);
    const banco = bancoFalso(['3EB0AAA0000']);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 1, recuperadas: 1, motivo: null });
    assert.deepEqual(banco.ingeridas.flat().map((m) => m.id), ['3EB0AAA0001']);
});

test('a UAZAPI também não tem nada depois do buraco: a sessão é que caiu', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([achada('3EB0AAA0000', desde)]);
    const banco = bancoFalso([`${DONO}:3EB0AAA0000`]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 0, recuperadas: 0, motivo: 'uazapi_sem_mensagens' });
});

test('mensagem de grupo não serve de âncora: só conta o que o banco guardaria', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([
        achada('3EB0AAA0001', brt('07', '11:20')),
        achada('3EB0GRUPO01', desde, { chatid: '120363000000000001@g.us', isGroup: true }),
    ]);
    const banco = bancoFalso([]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 1, recuperadas: 0, motivo: 'sem_ancora' });
    assert.equal(banco.ingeridas.length, 0);
});

test('para de paginar no teto, sem varrer a instância inteira', async () => {
    const desde = brt('07', '08:00');
    const muitas = Array.from({ length: 50 }, (_, i) => achada(`3EB0X${String(i).padStart(6, '0')}`, new Date(brt('07', '17:00').getTime() - i * 60_000)));
    const { uaz, pedidos } = uazapiFalsa(muitas);
    const banco = bancoFalso([]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, porPagina: 10, maxPaginas: 3,
    });
    assert.equal(pedidos.length, 3);
    assert.equal(r.motivo, 'sem_ancora');
});

// --- histórico sob demanda, depois que o buraco fecha -------------------------

test('âncora do histórico: a primeira mensagem de cada conversa depois do buraco', () => {
    assert.deepEqual(ancorasDoHistorico([
        { cliente_telefone: '5551981009857', wa_message_id: `${DONO}:3EB0DEPOIS1` },
        { cliente_telefone: 'lid:141562256314579', wa_message_id: `${DONO}:3EB0DEPOIS2` },
        { cliente_telefone: '5551981009857', wa_message_id: `${DONO}:3EB0DEPOIS3` },
        { cliente_telefone: '5551999990000', wa_message_id: '3EB0PURO' },
    ]), [
        { number: '5551981009857@s.whatsapp.net', messageid: '3EB0DEPOIS1' },
        { number: '141562256314579@lid', messageid: '3EB0DEPOIS2' },
        { number: '5551999990000@s.whatsapp.net', messageid: '3EB0PURO' },
    ]);
});

// --- o que a UAZAPI diz da entrega do webhook ---------------------------------

test('erros do webhook: só os do buraco, sem o payload (tem fala de cliente)', () => {
    const erros = [
        { created: '2026-10-07T13:00:00Z', event: 'messages', status_code: 502, attempts: 3, error: 'antes do buraco', stage: 'http', payload: { text: 'x' } },
        { created: '2026-10-07T14:10:00Z', event: 'messages', status_code: 401, attempts: 3, error: 'webhook returned non-success status: 401', stage: 'http', payload: { text: 'pode mandar o piso?' }, url: 'https://zonanova/api/webhook/SEGREDO' },
        { created: '2026-10-07T15:00:00Z', event: 'messages', attempts: 0, error: 'queue full', stage: 'queue' },
    ];
    assert.deepEqual(resumoErrosWebhook(erros, brt('07', '10:56')), [
        { created: '2026-10-07T14:10:00Z', event: 'messages', status_code: 401, attempts: 3, error: 'webhook returned non-success status: 401', stage: 'http' },
        { created: '2026-10-07T15:00:00Z', event: 'messages', status_code: null, attempts: 0, error: 'queue full', stage: 'queue' },
    ]);
    assert.deepEqual(resumoErrosWebhook(null, brt('07', '10:56')), []);
});
