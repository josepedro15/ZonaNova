import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desde, esperaDoCliente, temposDeResposta, foiRespondido, telefoneBonito, type Msg } from '../../lib/painel.ts';

const AGORA = new Date('2026-09-21T18:00:00Z');
const em = (hhmm: string) => `2026-09-21T${hhmm}:00Z`;
const cliente = (hhmm: string): Msg => ({ direcao: 'entrada', automatica: false, enviada_em: em(hhmm) });
const vendedor = (hhmm: string): Msg => ({ direcao: 'saida', automatica: false, enviada_em: em(hhmm) });
const robo = (hhmm: string): Msg => ({ direcao: 'saida', automatica: true, enviada_em: em(hhmm) });

// --- quem está esperando -----------------------------------------------------

test('cliente falou por último: espera desde essa mensagem', () => {
    assert.equal(esperaDoCliente([vendedor('14:00'), cliente('17:00')], AGORA), 60 * 60 * 1000);
});

test('vendedor respondeu por último: ninguém espera', () => {
    assert.equal(esperaDoCliente([cliente('14:00'), vendedor('14:30')], AGORA), null);
});

// O cliente mandou três mensagens seguidas. Ele espera desde a PRIMEIRA — é há
// quanto tempo está sem resposta, não desde quando parou de escrever.
test('mensagens seguidas do cliente: conta desde a primeira', () => {
    assert.equal(
        esperaDoCliente([vendedor('10:00'), cliente('15:00'), cliente('15:02'), cliente('15:05')], AGORA),
        3 * 60 * 60 * 1000,
    );
});

// O caso que mais engana: a resposta automática marca a conversa como
// respondida sem ninguém ter lido nada. Quem manda "recebemos sua mensagem"
// não respondeu ao cliente.
test('resposta automática não tira o cliente da espera', () => {
    assert.equal(esperaDoCliente([cliente('16:00'), robo('16:00')], AGORA), 2 * 60 * 60 * 1000);
});

test('conversa só com mensagens do vendedor: ninguém espera', () => {
    assert.equal(esperaDoCliente([vendedor('09:00'), vendedor('09:05')], AGORA), null);
});

test('conversa vazia: ninguém espera', () => {
    assert.equal(esperaDoCliente([], AGORA), null);
});

// --- tempo de resposta -------------------------------------------------------

test('um bloco do cliente respondido: um tempo', () => {
    assert.deepEqual(temposDeResposta([cliente('14:00'), vendedor('14:10')]), [10 * 60 * 1000]);
});

test('dois blocos: um tempo cada, medidos da primeira mensagem do bloco', () => {
    assert.deepEqual(
        temposDeResposta([cliente('09:00'), cliente('09:03'), vendedor('09:10'), cliente('11:00'), vendedor('11:05')]),
        [10 * 60 * 1000, 5 * 60 * 1000],
    );
});

test('bloco ainda sem resposta não entra na média', () => {
    assert.deepEqual(temposDeResposta([cliente('09:00'), vendedor('09:10'), cliente('17:00')]), [10 * 60 * 1000]);
});

test('a automática não conta como resposta, a humana seguinte sim', () => {
    assert.deepEqual(
        temposDeResposta([cliente('09:00'), robo('09:00'), vendedor('09:20')]),
        [20 * 60 * 1000],
    );
});

// Disparo em massa: o vendedor falou, o cliente nunca. Não há tempo de
// resposta nenhum a medir — e incluir isso como 0 rebaixaria a média de todos.
test('conversa sem fala do cliente não produz tempo', () => {
    assert.deepEqual(temposDeResposta([vendedor('09:00'), vendedor('09:01')]), []);
});

// --- taxa de resposta --------------------------------------------------------

test('cliente falou e foi respondido', () => {
    assert.equal(foiRespondido([cliente('09:00'), vendedor('09:10')]), true);
});

test('cliente falou e só a automática respondeu: não conta', () => {
    assert.equal(foiRespondido([cliente('09:00'), robo('09:00')]), false);
});

test('cliente nunca falou: fora da conta', () => {
    assert.equal(foiRespondido([vendedor('09:00')]), null);
});

// --- telefone na tela --------------------------------------------------------

test('celular com nono dígito vira (DD) 9 XXXX-XXXX', () => {
    assert.equal(telefoneBonito('5554998124471'), '(54) 9 9812-4471');
});

test('fixo de oito dígitos vira (DD) XXXX-XXXX', () => {
    assert.equal(telefoneBonito('555433334444'), '(54) 3333-4444');
});

// Número de fora do Brasil, ou lixo: melhor devolver como veio do que inventar
// uma formatação brasileira em cima de algo que não é.
test('o que não for brasileiro sai como veio', () => {
    assert.equal(telefoneBonito('12025550147'), '12025550147');
    assert.equal(telefoneBonito('abc'), 'abc');
});

// --- corte do dia ------------------------------------------------------------

// O cliente que escreveu antes do corte e foi respondido depois não pode virar
// um "tempo de resposta de hoje" de horas: a espera começou em outro dia.
test('desde() descarta o que veio antes do corte', () => {
    const msgs = [cliente('07:00'), vendedor('09:00'), cliente('10:00'), vendedor('10:05')];
    const hoje = desde(msgs, new Date(em('08:00')));
    assert.deepEqual(hoje.map((m) => m.enviada_em), [em('09:00'), em('10:00'), em('10:05')]);
    assert.deepEqual(temposDeResposta(hoje), [5 * 60_000]);
});

test('desde() inclui a mensagem exatamente no corte', () => {
    assert.equal(desde([cliente('08:00')], new Date(em('08:00'))).length, 1);
});
