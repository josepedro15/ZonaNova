import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoSeguro } from '../../lib/destino.ts';

const BASE = 'https://zona-nova.vercel.app';
const PADRAO = '/aguardando-aprovacao';

test('caminho interno passa, com query e âncora', () => {
    assert.equal(destinoSeguro('/nova-senha', BASE, PADRAO), '/nova-senha');
    assert.equal(destinoSeguro('/conversas?q=ana#x', BASE, PADRAO), '/conversas?q=ana#x');
});

// `/\evil.com` passava pelo filtro de texto e o navegador o lia como
// `//evil.com`: redirecionador aberto.
test('nada que saia da origem passa', () => {
    for (const pedido of ['https://evil.com', '//evil.com', '/\\evil.com', '/\\/evil.com', '/%5Cevil.com', '/.//evil.com', '/..//evil.com', 'evil.com', 'javascript:alert(1)']) {
        const destino = destinoSeguro(pedido, BASE, PADRAO);
        assert.ok(destino === PADRAO || destino.startsWith('/') && !destino.startsWith('//') && !destino.startsWith('/\\'), `${pedido} → ${destino}`);
        assert.equal(new URL(destino, BASE).origin, BASE, `${pedido} saiu da origem`);
    }
});

test('ausente vira o padrão', () => {
    assert.equal(destinoSeguro(null, BASE, PADRAO), PADRAO);
    assert.equal(destinoSeguro('', BASE, PADRAO), PADRAO);
});
