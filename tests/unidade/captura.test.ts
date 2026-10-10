import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    emSilencio, capturaDoDia, recuperarMensagens, ancorasDoHistorico, resumoErrosWebhook, LIMIAR_SILENCIO_MS,
    falhaDoBuraco, faltaNoRelatorio, alertaDeCaptura, LIMIAR_SILENCIO_LONGO_MS, type Buraco,
} from '../../lib/captura.ts';
import { Uazapi } from '../../lib/uazapi/cliente.ts';
import { comNomesConhecidos, estaFora } from '../../lib/exclusao.ts';
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

/** Um buraco como o checar-conexoes grava; por padrão, com a UAZAPI tão vazia quanto o banco. */
const buraco = (inicio: Date, fim: Date | null, extra: Partial<Buraco> = {}): Buraco => ({
    inicio: inicio.toISOString(), fim: fim?.toISOString() ?? null, encontradas: 0, recuperadas: 0, motivo: 'uazapi_sem_mensagens', ...extra,
});

// 10:56 → 18:00 de quarta: 7h04 de expediente, acima do silêncio longo.
const buracoVitor = buraco(brt('07', '10:56'), brt('08', '07:35'));

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
    const c = capturaDoDia([buraco(brt('07', '10:56'), null)], '2026-10-07', brt('07', '17:30'));
    assert.equal(c.incompleta, true);
    assert.equal(c.intervalos[0].ate, brt('07', '17:30').toISOString());
    assert.equal(c.intervalos[0].expediente_ms, 6 * HORA + 34 * 60_000);
});

test('buraco que encolheu com a recuperação e ficou curto no dia não marca', () => {
    const c = capturaDoDia([buraco(brt('07', '10:56'), brt('07', '11:10'), { encontradas: 4, recuperadas: 4, motivo: null })], '2026-10-07', brt('09', '00:00'));
    assert.equal(c.incompleta, false);
});

test('a Priscila em 09/10: 3h35 de silêncio com a UAZAPI vazia não marca o dia', () => {
    const b = buraco(brt('09', '14:42'), brt('10', '08:18'));
    assert.equal(capturaDoDia([b], '2026-10-09', brt('11', '00:00')).incompleta, false);
    assert.equal(capturaDoDia([b], '2026-10-10', brt('11', '00:00')).incompleta, false);
});

test('buraco longo que atravessa o dia marca os dois lados que somam expediente', () => {
    // Quinta 14h → sexta 11h: 4h + 3h = 7h. A falha é do buraco inteiro.
    const b = buraco(brt('08', '14:00'), brt('09', '11:00'));
    assert.equal(capturaDoDia([b], '2026-10-08', brt('10', '00:00')).incompleta, true);
    assert.equal(capturaDoDia([b], '2026-10-09', brt('10', '00:00')).incompleta, true);
});

test('a UAZAPI tem o que não deu para reinjetar: o dia fica incompleto mesmo com silêncio curto', () => {
    const b = buraco(brt('07', '10:56'), brt('07', '13:30'), { encontradas: 12, motivo: 'formato_id_divergente' });
    assert.equal(capturaDoDia([b], '2026-10-07', brt('08', '00:00')).incompleta, true);
});

// --- falha de fato × vendedor que não conversou --------------------------------

test('silêncio curto com a UAZAPI vazia não é falha: o vendedor só não conversou', () => {
    // O Bruno em 09/10: 10:36 → 13:03, fechou sozinho quando ele voltou.
    assert.equal(falhaDoBuraco(buraco(brt('09', '10:36'), brt('09', '13:03')), brt('09', '13:05')), null);
    // Aberto, ainda curto.
    assert.equal(falhaDoBuraco(buraco(brt('10', '09:50'), null), brt('10', '12:00')), null);
});

test('o limiar do silêncio longo é de seis horas de expediente', () => {
    assert.equal(LIMIAR_SILENCIO_LONGO_MS, 6 * HORA);
    const b = buraco(brt('07', '10:00'), null);
    assert.equal(falhaDoBuraco(b, brt('07', '15:59')), null);
    assert.equal(falhaDoBuraco(b, brt('07', '16:00')), 'silencio_longo');
});

test('a noite e o domingo não contam: sábado 11h → segunda 9h é 2h', () => {
    assert.equal(falhaDoBuraco(buraco(brt('10', '11:00'), null), brt('12', '09:00')), null);
});

test('o Guilherme e a Tainá: quinta 16:40 → sábado 12h são 5h20, segunda às 8h40 vira silêncio longo', () => {
    const b = buraco(brt('09', '16:40'), null);
    assert.equal(falhaDoBuraco(b, brt('10', '13:56')), null);
    assert.equal(falhaDoBuraco(b, brt('12', '08:39')), null);
    assert.equal(falhaDoBuraco(b, brt('12', '08:40')), 'silencio_longo');
});

test('o Vitor em 07/10 seria alertado no mesmo dia, na rodada das 17h', () => {
    assert.equal(falhaDoBuraco(buraco(brt('07', '10:56'), null), brt('07', '17:00')), 'silencio_longo');
});

test('a UAZAPI tinha o que o banco não tinha: falha mesmo com silêncio curto', () => {
    const b = buraco(brt('07', '10:56'), null, { encontradas: 5, recuperadas: 5, motivo: null });
    assert.equal(falhaDoBuraco(b, brt('07', '13:00')), 'uazapi_tem_mensagens');
    // Reinjetado tudo: o relatório não perde nada.
    assert.equal(faltaNoRelatorio(b, brt('07', '13:00')), false);
});

test('encontradas que o banco já tinha não são falha (o vendedor voltou no meio da rodada)', () => {
    const b = buraco(brt('07', '10:56'), null, { encontradas: 3, recuperadas: 0, motivo: null });
    assert.equal(falhaDoBuraco(b, brt('07', '13:00')), null);
});

test('sem âncora ou com id divergente, o que a UAZAPI tem não pôde ser conferido nem reinjetado', () => {
    for (const motivo of ['sem_ancora', 'formato_id_divergente']) {
        const b = buraco(brt('07', '10:56'), null, { encontradas: 8, motivo });
        assert.equal(falhaDoBuraco(b, brt('07', '13:00')), 'uazapi_tem_mensagens');
        assert.equal(faltaNoRelatorio(b, brt('07', '13:00')), true);
    }
});

test('o alerta da tela diz o indício: silêncio longo pede conferência, curto só aparece por falha do webhook', () => {
    assert.equal(alertaDeCaptura(brt('07', '10:56').toISOString(), brt('07', '17:00')), 'silencio_longo');
    assert.equal(alertaDeCaptura(brt('07', '10:56').toISOString(), brt('07', '13:00')), 'uazapi_tem_mensagens');
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

    assert.deepEqual(r, { encontradas: 3, recuperadas: 2, excluidas: 0, motivo: null });
    assert.deepEqual(banco.ingeridas.flat().map((m) => m.id), [`${DONO}:3EB0AAA0002`, `${DONO}:3EB0AAA0001`]);
    // Parou na página que alcançou a última mensagem gravada.
    assert.deepEqual(pedidos, [{ limit: 2, offset: 0 }, { limit: 2, offset: 2 }]);
    // E a reinjeção é idempotente: rodar de novo não acha mais nada a gravar.
    const deNovo = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, porPagina: 2,
    });
    assert.deepEqual(deNovo, { encontradas: 3, recuperadas: 0, excluidas: 0, motivo: null });
});

test('id em formato que o banco não reconhece: não reinjeta nada (duplicaria tudo)', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([achada('3EB0AAA0001', brt('07', '11:20')), achada('3EB0AAA0000', desde)]);
    const banco = bancoFalso(['outro-formato-3EB0AAA0000']);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 1, recuperadas: 0, excluidas: 0, motivo: 'formato_id_divergente' });
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
    assert.deepEqual(r, { encontradas: 1, recuperadas: 1, excluidas: 0, motivo: null });
    assert.deepEqual(banco.ingeridas.flat().map((m) => m.id), ['3EB0AAA0001']);
});

test('a UAZAPI também não tem nada depois do buraco: nada a reinjetar', async () => {
    const desde = brt('07', '10:56');
    const { uaz } = uazapiFalsa([achada('3EB0AAA0000', desde)]);
    const banco = bancoFalso([`${DONO}:3EB0AAA0000`]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO,
    });
    assert.deepEqual(r, { encontradas: 0, recuperadas: 0, excluidas: 0, motivo: 'uazapi_sem_mensagens' });
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
    assert.deepEqual(r, { encontradas: 1, recuperadas: 0, excluidas: 0, motivo: 'sem_ancora' });
    assert.equal(banco.ingeridas.length, 0);
});

// O Marco, 08–09/10: "conectada", nada gravado desde 08/10 17:40 e a unidade
// conversando. A UAZAPI tinha tudo — só que com o Rafael (colega conectado,
// bloqueado por ele como VENDEDOR) e com outro número do Rafael. A ingestão
// descarta essas, então a cada rodada elas "faltavam" de novo, eram
// reinjetadas, descartadas outra vez, e o buraco nunca fechava.
const RAFAEL_CONECTADO = '5551999997768';
const RAFAEL_PESSOAL = '5551999991025';
const foraDoMarco = (telefone: string) => estaFora(telefone, { pessoais: [RAFAEL_CONECTADO, RAFAEL_PESSOAL], internos: [], colegas: [RAFAEL_CONECTADO] });

test('o caso do Marco: depois do buraco só há conversa fora da análise — a captura está em dia', async () => {
    const desde = brt('08', '17:40');
    const { uaz } = uazapiFalsa([
        achada('3EB0MARCO03', brt('09', '15:05'), { chatid: `${RAFAEL_CONECTADO}@s.whatsapp.net` }),
        achada('3EB0MARCO02', brt('09', '09:55'), { chatid: `${RAFAEL_PESSOAL}@s.whatsapp.net`, fromMe: false }),
        achada('3EB0MARCO01', brt('09', '08:27'), { chatid: `${RAFAEL_CONECTADO}@s.whatsapp.net`, fromMe: false }),
        achada('3EB0MARCO00', desde),
    ]);
    const banco = bancoFalso([`${DONO}:3EB0MARCO00`]);
    const recuperar = () => recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, fora: foraDoMarco,
    });

    assert.deepEqual(await recuperar(), { encontradas: 0, recuperadas: 0, excluidas: 3, motivo: 'so_contatos_fora' });
    assert.equal(banco.ingeridas.length, 0);
    // Rodar de novo dá o mesmo: nada se acumula como "recuperado".
    assert.deepEqual(await recuperar(), { encontradas: 0, recuperadas: 0, excluidas: 3, motivo: 'so_contatos_fora' });
});

// A /message/find também traz o Rafael só pelo LID (o chat/check deu
// …2955 → …1025 e …6429 → …7768). Sem ligar o LID ao telefone, essas
// "faltavam" e o buraco virava de verdade.
test('o caso do Marco pelo LID: contato bloqueado pelo telefone continua fora', async () => {
    const desde = brt('08', '17:40');
    const { uaz } = uazapiFalsa([
        achada('3EB0LID0002', brt('09', '15:05'), { chatid: '176800000006429@lid' }),
        achada('3EB0LID0001', brt('09', '09:55'), { chatid: '168500000002955@lid', fromMe: false }),
        achada('3EB0LID0000', desde),
    ]);
    const banco = bancoFalso([`${DONO}:3EB0LID0000`]);
    const listas = comNomesConhecidos({ pessoais: [RAFAEL_CONECTADO, RAFAEL_PESSOAL], internos: [], colegas: [RAFAEL_CONECTADO] }, [
        { telefone: RAFAEL_PESSOAL, lid: '168500000002955' },
        { telefone: RAFAEL_CONECTADO, lid: '176800000006429' },
    ]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, fora: (t) => estaFora(t, listas),
    });
    assert.deepEqual(r, { encontradas: 0, recuperadas: 0, excluidas: 2, motivo: 'so_contatos_fora' });
    assert.equal(banco.ingeridas.length, 0);
});

test('buraco de verdade com conversa fora da análise no meio: reinjeta só a do cliente', async () => {
    const desde = brt('08', '17:40');
    const { uaz } = uazapiFalsa([
        achada('3EB0MISTO02', brt('09', '10:00'), { chatid: `${RAFAEL_CONECTADO}@s.whatsapp.net` }),
        achada('3EB0MISTO01', brt('09', '09:00'), { fromMe: false }),
        achada('3EB0MISTO00', desde),
    ]);
    const banco = bancoFalso([`${DONO}:3EB0MISTO00`]);
    const r = await recuperarMensagens({
        buscar: (offset, limite) => uaz.buscarMensagens('tok', { limit: limite, offset }),
        idsGravados: banco.idsGravados, ingerir: banco.ingerir, desde, dono: DONO, fora: foraDoMarco,
    });
    assert.deepEqual(r, { encontradas: 1, recuperadas: 1, excluidas: 1, motivo: null });
    assert.deepEqual(banco.ingeridas.flat().map((m) => m.id), [`${DONO}:3EB0MISTO01`]);
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
