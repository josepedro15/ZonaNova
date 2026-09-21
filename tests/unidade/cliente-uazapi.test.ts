import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Uazapi, InstanciaAlheia, SYSTEM_NAME, ehNossa } from '../../lib/uazapi/cliente.ts';

/** fetch de mentira que grava o que foi chamado e devolve o que se mandar. */
function falso(respostas: Record<string, unknown>) {
    const chamadas: { url: string; metodo: string; headers: Record<string, string>; corpo: unknown }[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const caminho = u.replace('https://uaz', '');
        chamadas.push({
            url: caminho,
            metodo: init?.method ?? 'GET',
            headers: (init?.headers ?? {}) as Record<string, string>,
            corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const r = respostas[caminho];
        if (r === undefined) return new Response('não mapeado', { status: 404 });
        return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    return { f, chamadas };
}

const nossa = { id: 'i1', token: 'tk-nossa', name: 'zn-1', systemName: SYSTEM_NAME, status: 'connected' };
const alheia = { id: 'i2', token: 'tk-alheia', name: 'zap-insight-x', systemName: 'zap-insight', status: 'connected' };

test('listar devolve só as instâncias do ZonaNova', async () => {
    const { f } = falso({ '/instance/all': [nossa, alheia, { ...alheia, id: 'i3', systemName: 'metricsia' }] });
    const lista = await new Uazapi('https://uaz', 'admin', f).listar();
    assert.deepEqual(lista.map((i) => i.id), ['i1']);
});

test('instância criada nasce carimbada com o nosso systemName', async () => {
    const { f, chamadas } = falso({ '/instance/init': { instance: nossa } });
    await new Uazapi('https://uaz', 'admin', f).criarInstancia('zn-vendedor-1');
    const c = chamadas.find((x) => x.url === '/instance/init')!;
    assert.equal((c.corpo as { systemName: string }).systemName, SYSTEM_NAME);
    assert.equal(c.headers.admintoken, 'admin');
});

// A razão de existir da trava: o servidor tem 25 instâncias do zap-insight e o
// nosso admintoken apaga qualquer uma delas.
for (const op of ['desconectar', 'apagar', 'conectar'] as const) {
    test(`${op} recusa instância de outro produto`, async () => {
        const { f, chamadas } = falso({ '/instance/status': { instance: alheia } });
        const uaz = new Uazapi('https://uaz', 'admin', f);
        await assert.rejects(() => uaz[op]('tk-alheia'), InstanciaAlheia);
        // e não chegou a tocar em nada além da consulta
        assert.deepEqual(chamadas.map((c) => c.url), ['/instance/status']);
    });
}

for (const [op, caminho, metodo] of [
    ['desconectar', '/instance/disconnect', 'POST'],
    ['apagar', '/instance', 'DELETE'],
] as const) {
    test(`${op} age quando a instância é nossa`, async () => {
        const { f, chamadas } = falso({ '/instance/status': { instance: nossa }, [caminho]: {} });
        await new Uazapi('https://uaz', 'admin', f)[op]('tk-nossa');
        const c = chamadas.find((x) => x.url === caminho);
        assert.ok(c, `esperava chamada a ${caminho}`);
        assert.equal(c!.metodo, metodo);
        assert.equal(c!.headers.token, 'tk-nossa');
    });
}

test('instância sem systemName não é nossa', () => {
    assert.equal(ehNossa({ systemName: null }), false);
    assert.equal(ehNossa({}), false);
    assert.equal(ehNossa({ systemName: SYSTEM_NAME }), true);
});

// As outras instâncias do servidor excluem wasSentByApi. O ZonaNova não pode:
// é o disparo em massa, que o doc 3 §3.3 manda identificar.
test('o webhook não exclui mensagem mandada pela API', async () => {
    const { f, chamadas } = falso({ '/webhook': {} });
    await new Uazapi('https://uaz', 'admin', f).configurarWebhook('tk-nossa', 'https://zn/hook/abc');
    const c = chamadas.find((x) => x.url === '/webhook')!;
    const corpo = c.corpo as { excludeMessages: string[]; url: string; enabled: boolean; events: string[] };
    assert.deepEqual(corpo.excludeMessages, []);
    assert.equal(corpo.url, 'https://zn/hook/abc');
    assert.equal(corpo.enabled, true);
    assert.ok(corpo.events.includes('history'));
});

test('baixa mídia por id e devolve a URL temporária', async () => {
    const { f, chamadas } = falso({ '/message/download': { fileURL: 'https://cdn/audio.mp3', mimetype: 'audio/mpeg' } });
    const r = await new Uazapi('https://uaz', 'admin', f).baixarMidia('tk', 'MSG1');
    assert.equal(r.fileURL, 'https://cdn/audio.mp3');
    assert.deepEqual(chamadas.find((x) => x.url === '/message/download')?.corpo, { id: 'MSG1' });
});

test('erro HTTP da UAZAPI vira exceção com o status', async () => {
    const { f } = falso({});
    await assert.rejects(() => new Uazapi('https://uaz', 'admin', f).status('x'), /404/);
});
