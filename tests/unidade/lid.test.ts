import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lotesDeConsulta, planejar, telefonesDoCheck, type ConversaLida } from '../../lib/lid.ts';

test('LIDs vão ao /chat/check como @lid, em lotes', () => {
    const lotes = lotesDeConsulta(['1', '2', '3'], 2);
    assert.deepEqual(lotes, [['1@lid', '2@lid'], ['3@lid']]);
});

test('só o jid pelo número resolve um LID', () => {
    const mapa = telefonesDoCheck([
        { query: '141562256314579@lid', jid: '555181009857@s.whatsapp.net', lid: '141562256314579@lid', isInWhatsapp: true },
        { query: '222222222222222@lid', jid: '222222222222222@lid', isInWhatsapp: true },
        { query: '333333333333333@lid', jid: '5551999990000@s.whatsapp.net', isInWhatsapp: false },
        { query: '444444444444444@lid', error: 'not found' },
        { jid: '5554988887777:3@s.whatsapp.net', lid: '555555555555555@lid' },
    ]);
    assert.deepEqual([...mapa], [['141562256314579', '555181009857'], ['555555555555555', '5554988887777']]);
});

const c = (id: string, tel: string, user = 'u1'): ConversaLida => ({ id, user_id: user, cliente_telefone: tel });

test('LID resolvido une na conversa do telefone, com ou sem o nono dígito', () => {
    const acoes = planejar(
        [c('L1', 'lid:141562256314579'), c('T1', '555181009857'), c('L2', 'lid:9'), c('T2', '5554999998888')],
        new Map([['141562256314579', '555181009857'], ['9', '555499998888']]),
    );
    assert.deepEqual(acoes, [
        { acao: 'unificar', origem: 'L1', destino: 'T1', userId: 'u1', lid: '141562256314579', telefone: '555181009857' },
        { acao: 'unificar', origem: 'L2', destino: 'T2', userId: 'u1', lid: '9', telefone: '555499998888' },
    ]);
});

test('sem conversa do telefone, a lid: ganha o telefone; o segundo LID igual é unido a ela', () => {
    const acoes = planejar(
        [c('L1', 'lid:1'), c('L2', 'lid:2'), c('L3', 'lid:3')],
        new Map([['1', '5551999990000'], ['2', '5551999990000']]),
    );
    assert.deepEqual(acoes.map((a) => [a.acao, a.origem, 'destino' in a ? a.destino : null]), [
        ['renomear', 'L1', null], ['unificar', 'L2', 'L1'], ['sem_resolucao', 'L3', null],
    ]);
});

test('o telefone de outro vendedor não é destino', () => {
    const acoes = planejar([c('L1', 'lid:1', 'u1'), c('T1', '5551999990000', 'u2')], new Map([['1', '5551999990000']]));
    assert.equal(acoes[0]!.acao, 'renomear');
});
