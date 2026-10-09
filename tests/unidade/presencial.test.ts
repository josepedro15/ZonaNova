import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comVendaPresencial, diaDaVendaPresencial, MARCA_PRESENCIAL, semVendaPresencial } from '../../lib/presencial.ts';

const daIa = { tipo_conversa: 'negociacao', status: 'em_andamento', payload: { resumo: 'pediu orçamento' } };

test('marcar presencial vira negociação com venda feita', () => {
    const marcada = comVendaPresencial(daIa);
    assert.equal(marcada.tipo_conversa, 'negociacao');
    assert.equal(marcada.status, 'venda_feita');
    assert.equal(marcada.payload[MARCA_PRESENCIAL], true);
    assert.equal(marcada.payload.resumo, 'pediu orçamento');
});

// Suporte que o vendedor diz ter virado venda: conta como negociação, senão a
// venda ficaria fora das conversões (que só olham negociações).
test('suporte marcado presencial passa a contar como negociação', () => {
    assert.equal(comVendaPresencial({ ...daIa, tipo_conversa: 'suporte' }).tipo_conversa, 'negociacao');
});

test('desfazer devolve o que a IA disse e limpa as marcas', () => {
    const volta = semVendaPresencial(comVendaPresencial({ ...daIa, tipo_conversa: 'suporte' }));
    assert.deepEqual(volta, { ...daIa, tipo_conversa: 'suporte' });
});

// O worker reaplica a marca a cada nova análise do dia, e a server action pode
// rodar duas vezes: o original não pode virar "venda_feita".
test('marcar duas vezes não perde o original', () => {
    assert.deepEqual(semVendaPresencial(comVendaPresencial(comVendaPresencial(daIa))), daIa);
});

test('desfazer em análise sem marca não muda nada', () => {
    assert.deepEqual(semVendaPresencial(daIa), daIa);
});

test('payload nulo não quebra', () => {
    const marcada = comVendaPresencial({ tipo_conversa: null, status: null, payload: null });
    assert.equal(marcada.status, 'venda_feita');
    assert.deepEqual(semVendaPresencial(marcada), { tipo_conversa: null, status: null, payload: {} });
});

// --- em que dia a venda conta ------------------------------------------------

test('a venda conta no dia da última análise', () => {
    assert.equal(diaDaVendaPresencial('2026-10-07', '2026-10-07', '2026-10-08'), '2026-10-07');
});

// Marcada pela lista "Esperando você" às 9h: o cliente escreveu hoje, e a
// análise de hoje ainda não rodou. A de ontem não pode levar a venda.
test('cliente que escreveu depois da última análise leva a venda para o dia dele', () => {
    assert.equal(diaDaVendaPresencial('2026-10-07', '2026-10-08', '2026-10-08'), '2026-10-08');
});

test('sem análise nem fala do cliente, conta hoje', () => {
    assert.equal(diaDaVendaPresencial(null, null, '2026-10-08'), '2026-10-08');
});
