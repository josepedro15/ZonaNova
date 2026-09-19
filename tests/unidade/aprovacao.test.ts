import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeResolver, quandoPediu, type Aprovador } from '../../lib/aprovacao.ts';

const CENTRO = 'aaaaaaaa-0000-0000-0000-000000000001';
const BENTO = 'aaaaaaaa-0000-0000-0000-000000000002';

const gestorCentro: Aprovador = { role: 'gestor', status: 'ativo', unidades: [CENTRO] };
const supervisor: Aprovador = { role: 'supervisor', status: 'ativo', unidades: [] };
const pendenteCentro = { status: 'pendente', unidade_id: CENTRO };

test('gestor aprova vendedor da própria unidade', () => {
    assert.equal(podeResolver(gestorCentro, pendenteCentro), null);
});

// O coração da regra: é isto que impede um gestor de dar acesso a alguém
// numa unidade que não é dele.
test('gestor NÃO aprova cadastro de outra unidade', () => {
    assert.match(podeResolver(gestorCentro, { status: 'pendente', unidade_id: BENTO })!, /outra unidade/);
});

test('gestor NÃO cria outro gestor — só o supervisor', () => {
    assert.match(podeResolver(gestorCentro, pendenteCentro, 'gestor')!, /supervisor/);
    assert.equal(podeResolver(supervisor, pendenteCentro, 'gestor'), null);
});

test('supervisor aprova em qualquer unidade', () => {
    assert.equal(podeResolver(supervisor, { status: 'pendente', unidade_id: BENTO }), null);
});

test('vendedor não aprova ninguém', () => {
    assert.match(podeResolver({ role: 'vendedor', status: 'ativo', unidades: [] }, pendenteCentro)!, /permissão/);
});

test('gestor desativado perde o poder de aprovar', () => {
    assert.match(podeResolver({ ...gestorCentro, status: 'inativo' }, pendenteCentro)!, /permissão/);
    assert.match(podeResolver({ ...gestorCentro, status: 'pendente' }, pendenteCentro)!, /permissão/);
});

test('sem sessão, nega', () => {
    assert.match(podeResolver(null, pendenteCentro)!, /permissão/);
});

// Dois gestores clicando ao mesmo tempo: o segundo tem de ser recusado.
test('cadastro já resolvido não se resolve de novo', () => {
    for (const status of ['ativo', 'inativo']) {
        assert.match(podeResolver(supervisor, { status, unidade_id: CENTRO })!, /já foi resolvido/);
    }
});

test('cadastro sem unidade não se aprova', () => {
    assert.match(podeResolver(supervisor, { status: 'pendente', unidade_id: null })!, /sem unidade|não tem unidade/);
});

test('cadastro inexistente', () => {
    assert.match(podeResolver(supervisor, null)!, /não encontrado/);
});

test('o "quando pediu" segue o fuso de São Paulo, não o UTC', () => {
    // 01:30 UTC do dia 15 ainda é 22:30 do dia 14 em São Paulo.
    const agora = new Date('2026-09-15T15:00:00Z');
    const r = quandoPediu(new Date('2026-09-15T01:30:00Z'), agora);
    assert.equal(r.dias, 1);
    assert.equal(r.texto, 'pediu ontem, 22h30');
});

test('pedido de hoje e pedido de dias atrás', () => {
    const agora = new Date('2026-09-15T15:00:00Z');
    assert.equal(quandoPediu(new Date('2026-09-15T12:00:00Z'), agora).texto, 'pediu hoje, 09h00');
    const antigo = quandoPediu(new Date('2026-09-11T12:15:00Z'), agora);
    assert.equal(antigo.dias, 4);
    assert.match(antigo.texto, /^pediu 11 set, 09h15$/);
});
