import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudancasDaChecagem } from '../../lib/conexao.ts';

test('nada mudou: não escreve', () => {
    assert.equal(
        mudancasDaChecagem({ status: 'conectada', numero: '5554999990000' },
                           { status: 'connected', owner: '5554999990000' }),
        null,
    );
});

// O caso que deixava o número perdido: a instância subiu `conectada` na
// primeira tentativa e ficou. O status nunca mudou, e o número — que só a
// UAZAPI sabe — nunca era gravado.
test('status igual mas número novo: grava só o número', () => {
    assert.deepEqual(
        mudancasDaChecagem({ status: 'conectada', numero: null },
                           { status: 'connected', owner: '5554999990000' }),
        { numero: '5554999990000' },
    );
});

test('caiu: grava o status', () => {
    assert.deepEqual(
        mudancasDaChecagem({ status: 'conectada', numero: '5554999990000' },
                           { status: 'disconnected' }),
        { status: 'caida' },
    );
});

// Cair é ter estado no ar antes. Quem nunca ligou continua 'desconectada' —
// a tela do gestor alerta número caído, e alertar quem nunca conectou é ruído.
test('quem nunca ligou continua desconectada, não caída', () => {
    assert.equal(
        mudancasDaChecagem({ status: 'desconectada', numero: null },
                           { status: 'disconnected' }),
        null,
    );
});

test('conectou agora e o número veio junto: grava os dois', () => {
    assert.deepEqual(
        mudancasDaChecagem({ status: 'aguardando_qr', numero: null },
                           { status: 'connected', owner: '5554999990000' }),
        { status: 'conectada', numero: '5554999990000' },
    );
});

// A UAZAPI nem sempre devolve o `owner`. Não apagar o que já se sabe por
// causa de uma resposta incompleta.
test('sem owner na resposta, o número gravado é preservado', () => {
    assert.equal(
        mudancasDaChecagem({ status: 'conectada', numero: '5554999990000' },
                           { status: 'connected' }),
        null,
    );
});

test('connecting vira aguardando_qr', () => {
    assert.deepEqual(
        mudancasDaChecagem({ status: 'conectada', numero: null },
                           { status: 'connecting' }),
        { status: 'aguardando_qr' },
    );
});
