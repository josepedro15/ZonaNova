import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aposFalha, proximaTentativa, MAX_TENTATIVAS } from '../../lib/fila.ts';

const T0 = new Date('2026-09-15T12:00:00Z');
const minutosDepois = (d: Date) => (d.getTime() - T0.getTime()) / 60_000;

test('o backoff cresce e nunca é menor que o intervalo do cron', () => {
    assert.equal(minutosDepois(proximaTentativa(1, T0)), 5);
    assert.equal(minutosDepois(proximaTentativa(2, T0)), 20);
    assert.equal(minutosDepois(proximaTentativa(3, T0)), 45);
});

test('as três primeiras falhas reagendam', () => {
    for (const anteriores of [0, 1, 2]) {
        const d = aposFalha(anteriores, T0);
        assert.equal(d.status, 'pendente', `tentativa ${anteriores + 1}`);
        assert.equal(d.tentativas, anteriores + 1);
    }
});

// O doc 3 §3.4: "tentativas 1, 2, 3. Na 4ª, falhou definitivo."
test('a quarta falha desiste', () => {
    const d = aposFalha(MAX_TENTATIVAS, T0);
    assert.equal(d.status, 'falhou');
    assert.equal(d.tentativas, 4);
});

test('item que desistiu não volta a ser reagendado', () => {
    assert.equal(aposFalha(9, T0).status, 'falhou');
});
