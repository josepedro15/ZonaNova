import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    comResolvida, comVendaPresencial, contaNaNota, diaDaVendaPresencial, MARCA_PRESENCIAL, MARCA_RESOLVIDA, marcaDeDesfecho, semResolvida, semVendaPresencial, ultimaMarca,
} from '../../lib/presencial.ts';

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

// --- a nota do dia (Silas, 21/10) --------------------------------------------

test('negociação da IA marcada presencial continua na nota', () => {
    assert.equal(contaNaNota(comVendaPresencial(daIa)), true);
    assert.equal(contaNaNota(daIa), true);
});

// Bruno, Capão, 20/10: mídia sem texto, social com nota 0, marcada presencial.
test('social ou suporte que só virou negociação pela marca fica fora da nota', () => {
    assert.equal(contaNaNota(comVendaPresencial({ ...daIa, tipo_conversa: 'social', status: 'encerrada' })), false);
    assert.equal(contaNaNota(comVendaPresencial({ ...daIa, tipo_conversa: 'suporte' })), false);
});

test('suporte e social sem marca nunca entram na nota', () => {
    assert.equal(contaNaNota({ ...daIa, tipo_conversa: 'suporte' }), false);
    assert.equal(contaNaNota({ tipo_conversa: null, status: null, payload: null }), false);
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

// --- "Resolvido": o pós-venda sem venda (Silas, 14/10) -----------------------

const suporte = { tipo_conversa: 'suporte', status: 'em_andamento', payload: { resumo: 'entrega atrasou' } };

test('resolver o suporte deixa a análise encerrada, sem venda', () => {
    const marcada = comResolvida(suporte);
    assert.equal(marcada.tipo_conversa, 'suporte');
    assert.equal(marcada.status, 'encerrada');
    assert.equal(marcada.payload[MARCA_RESOLVIDA], true);
    assert.equal(marcada.payload.resumo, 'entrega atrasou');
});

test('resolver não apaga a venda que a IA viu no mesmo dia', () => {
    assert.equal(comResolvida({ ...suporte, tipo_conversa: 'negociacao', status: 'venda_feita' }).status, 'venda_feita');
});

test('desfazer o resolvido devolve o que a IA disse, mesmo marcado duas vezes', () => {
    assert.deepEqual(semResolvida(comResolvida(comResolvida(suporte))), suporte);
});

test('as duas marcas não se misturam', () => {
    const presencial = comVendaPresencial(suporte);
    assert.deepEqual(semResolvida(presencial), presencial);
});

test('suporte oferece Resolvido; o resto, Fechado presencialmente', () => {
    assert.equal(marcaDeDesfecho('suporte'), 'resolvida');
    assert.equal(marcaDeDesfecho('negociacao'), 'presencial');
    assert.equal(marcaDeDesfecho('social'), 'presencial');
    assert.equal(marcaDeDesfecho(null), 'presencial');
});

test('a marca mais recente é a que a tela mostra', () => {
    assert.equal(ultimaMarca({}), null);
    assert.deepEqual(ultimaMarca({ fechada_presencial_em: '2026-10-09T13:54:37Z' }), { rotulo: 'Fechada presencialmente', em: '2026-10-09T13:54:37Z' });
    assert.equal(ultimaMarca({ fechada_presencial_em: '2026-10-09T13:54:37Z', resolvida_em: '2026-10-14T10:00:00Z' })?.rotulo, 'Resolvida');
});
