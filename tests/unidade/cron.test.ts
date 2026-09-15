import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ZN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.CRON_SECRET = 'segredo-do-cron';
const { cronAutorizado } = await import('../../lib/cron.ts');

const req = (auth?: string) =>
    new Request('https://zn/api/cron/x', { headers: auth ? { authorization: auth } : {} });

test('aceita o Bearer certo', () => {
    assert.equal(cronAutorizado(req('Bearer segredo-do-cron')), true);
});

test('recusa segredo errado, vazio e ausente', () => {
    assert.equal(cronAutorizado(req('Bearer outro')), false);
    assert.equal(cronAutorizado(req('Bearer ')), false);
    assert.equal(cronAutorizado(req()), false);
});

test('recusa esquema que não é Bearer', () => {
    assert.equal(cronAutorizado(req('Basic segredo-do-cron')), false);
    assert.equal(cronAutorizado(req('segredo-do-cron')), false);
});

// Sem CRON_SECRET no ambiente, a rota tem de ficar FECHADA e não aberta.
test('sem CRON_SECRET configurado, nega tudo', () => {
    const antes = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    assert.equal(cronAutorizado(req('Bearer qualquer')), false);
    assert.equal(cronAutorizado(req('Bearer ')), false);
    process.env.CRON_SECRET = antes;
});
