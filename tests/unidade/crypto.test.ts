import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ZN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
const { cifrar, decifrar, segredoIgual } = await import('../../lib/crypto.ts');

test('cifra e decifra o token de volta', () => {
    const token = '103c965d-11d6-4125-ba06-ef4206fc8c36';
    assert.equal(decifrar(cifrar(token)), token);
});

test('o mesmo token cifra diferente a cada vez (iv aleatório)', () => {
    assert.notEqual(cifrar('igual').toString('hex'), cifrar('igual').toString('hex'));
});

// É o ponto do GCM: um blob adulterado tem de explodir, não devolver lixo.
test('blob adulterado não decifra', () => {
    const blob = cifrar('token');
    blob[blob.length - 1] ^= 0xff;
    assert.throws(() => decifrar(blob));
});

test('blob truncado não decifra', () => {
    assert.throws(() => decifrar(cifrar('token').subarray(0, 10)), /truncado/);
});

test('chave de tamanho errado falha alto e cedo', async () => {
    const antes = process.env.ZN_ENCRYPTION_KEY;
    process.env.ZN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    assert.throws(() => cifrar('x'), /32 bytes/);
    process.env.ZN_ENCRYPTION_KEY = antes;
});

test('comparação de segredo aceita o igual e rejeita o diferente', () => {
    assert.equal(segredoIgual('abc', 'abc'), true);
    assert.equal(segredoIgual('abc', 'abd'), false);
    assert.equal(segredoIgual('abc', 'abcd'), false);
    assert.equal(segredoIgual('', ''), true);
});

// --- token de rota do webhook ------------------------------------------------
const { tokenDeRota, conexaoDoToken } = await import('../../lib/uazapi/rota.ts');
const SEGREDO = 'segredo-de-teste';
const CONEXAO = '3f2a9c1e-0000-4000-8000-000000000001';

test('o token de rota devolve a conexão de que saiu', () => {
    assert.equal(conexaoDoToken(tokenDeRota(CONEXAO, SEGREDO), SEGREDO), CONEXAO);
});

test('assinatura adulterada não resolve conexão nenhuma', () => {
    const t = tokenDeRota(CONEXAO, SEGREDO);
    assert.equal(conexaoDoToken(t.slice(0, -1) + 'x', SEGREDO), null);
});

// O ataque óbvio: pegar a própria URL e trocar o uuid pelo de um colega.
test('trocar o id da conexão invalida o token', () => {
    const t = tokenDeRota(CONEXAO, SEGREDO);
    const outro = t.replace(CONEXAO, '3f2a9c1e-0000-4000-8000-000000000002');
    assert.equal(conexaoDoToken(outro, SEGREDO), null);
});

test('token assinado com outro segredo não vale', () => {
    assert.equal(conexaoDoToken(tokenDeRota(CONEXAO, 'outro'), SEGREDO), null);
});

test('lixo não derruba o parser', () => {
    for (const t of ['', '.', 'semponto', '.só-assinatura']) {
        assert.equal(conexaoDoToken(t, SEGREDO), null, JSON.stringify(t));
    }
});
