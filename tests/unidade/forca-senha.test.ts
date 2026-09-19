import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forcaDaSenha } from '../../lib/forca-senha.ts';

test('campo vazio não mostra medidor', () => {
    assert.equal(forcaDaSenha('').nivel, 0);
});

// O medidor não pode dizer "boa" para algo que o servidor vai recusar.
test('menos de 8 caracteres é sempre o nível mais baixo', () => {
    assert.equal(forcaDaSenha('Ab1!xyz').nivel, 1);
});

test('8 caracteres repetidos passam no mínimo mas não são boa senha', () => {
    assert.deepEqual(forcaDaSenha('aaaaaaaa'), { nivel: 1, rotulo: 'Fácil de adivinhar' });
    assert.equal(forcaDaSenha('12121212').nivel, 1);
});

test('comprimento e variedade sobem o nível', () => {
    assert.equal(forcaDaSenha('zonanova').nivel, 2);
    assert.equal(forcaDaSenha('zonanovacentro').nivel, 3);
    assert.equal(forcaDaSenha('ZonaNova2026').nivel, 4);
});
