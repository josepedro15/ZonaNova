import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaFora } from '../../lib/exclusao.ts';

const VAZIAS = { pessoais: [], internos: [], colegas: [] };

test('ninguém nas listas: contato entra na análise', () => {
    assert.equal(estaFora('5554998124471', VAZIAS), false);
});

test('lista pessoal do vendedor tira o contato', () => {
    assert.equal(estaFora('5554998124471', { ...VAZIAS, pessoais: ['5554998124471'] }), true);
});

// O Depósito cadastrado pelo gestor vale para todos os vendedores da loja.
test('lista interna da loja tira o contato', () => {
    assert.equal(estaFora('5554932100001', { ...VAZIAS, internos: ['5554932100001'] }), true);
});

test('número de colega conectado é conversa de trabalho', () => {
    assert.equal(estaFora('5554991112222', { ...VAZIAS, colegas: ['5554991112222'] }), true);
});

// O JID chega sem o nono dígito; o gestor digitou com ele.
test('casa com e sem o nono dígito, nos dois sentidos', () => {
    assert.equal(estaFora('555498124471', { ...VAZIAS, internos: ['5554998124471'] }), true);
    assert.equal(estaFora('5554998124471', { ...VAZIAS, colegas: ['555498124471'] }), true);
});

test('contato @lid só casa com o próprio identificador', () => {
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['lid:123456789012345'] }), true);
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['123456789012345'] }), false);
});
