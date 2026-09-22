import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginar } from '../../lib/paginar.ts';

const fonte = Array.from({ length: 2345 }, (_, i) => i);
const pagina = (de: number, ate: number) => Promise.resolve({ data: fonte.slice(de, ate + 1), error: null });

test('junta as páginas até acabar', async () => {
    assert.equal((await paginar(pagina)).length, 2345);
});

test('respeita o máximo', async () => {
    assert.deepEqual((await paginar(pagina, 1500)).length, 1500);
});

test('erro de página vira exceção, não resultado parcial', async () => {
    await assert.rejects(paginar(() => Promise.resolve({ data: null, error: { message: 'boom' } })), /boom/);
});
