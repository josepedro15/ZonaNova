import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcrever, hashDoAudio } from '../../lib/transcricao.ts';

const AUDIO = new Uint8Array([1, 2, 3, 4, 5]);

function falso({ audio = AUDIO, statusAudio = 200, texto = 'bom dia, seu João' } = {}) {
    const chamadas: string[] = [];
    const f = (async (url: string | URL | Request) => {
        const u = String(url);
        chamadas.push(u);
        if (u.includes('openai.com')) {
            return new Response(JSON.stringify({ text: texto }), { status: 200 });
        }
        return new Response(audio as BodyInit, { status: statusAudio });
    }) as unknown as typeof globalThis.fetch;
    return { f, chamadas };
}

test('o hash é estável e muda com o conteúdo', () => {
    assert.equal(hashDoAudio(AUDIO), hashDoAudio(new Uint8Array([1, 2, 3, 4, 5])));
    assert.notEqual(hashDoAudio(AUDIO), hashDoAudio(new Uint8Array([1, 2, 3, 4, 6])));
});

test('transcreve e devolve o hash do arquivo', async () => {
    const { f } = falso();
    const r = await transcrever('https://uaz/a.ogg', {
        apiKey: 'k', buscar: f, procurarCache: async () => null,
    });
    assert.equal(r.texto, 'bom dia, seu João');
    assert.equal(r.hash, hashDoAudio(AUDIO));
});

// O §3.9: o mesmo áudio encaminhado não pode ser transcrito duas vezes.
// Transcrição é paga, e áudio encaminhado entre vendedores não é raro.
test('cache evita a chamada paga', async () => {
    const { f, chamadas } = falso();
    const r = await transcrever('https://uaz/a.ogg', {
        apiKey: 'k', buscar: f, procurarCache: async () => 'já transcrito antes',
    });
    assert.equal(r.texto, 'já transcrito antes');
    assert.equal(chamadas.filter((c) => c.includes('openai.com')).length, 0);
});

test('o cache é consultado pelo hash do arquivo, não pela URL', async () => {
    const { f } = falso();
    let visto: string | null = null;
    await transcrever('https://uaz/outra-url.ogg', {
        apiKey: 'k', buscar: f,
        procurarCache: async (h) => { visto = h; return null; },
    });
    assert.equal(visto, hashDoAudio(AUDIO));
});

test('áudio inacessível vira erro, não transcrição vazia', async () => {
    const { f } = falso({ statusAudio: 404 });
    await assert.rejects(
        () => transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, procurarCache: async () => null }),
        /inacessível: 404/,
    );
});

test('áudio vazio vira erro', async () => {
    const { f } = falso({ audio: new Uint8Array([]) });
    await assert.rejects(
        () => transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, procurarCache: async () => null }),
        /vazio/,
    );
});

test('pede português — áudio curto sem idioma o modelo adivinha errado', async () => {
    let corpo: FormData | undefined;
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('openai.com')) {
            corpo = init!.body as FormData;
            return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
        }
        return new Response(AUDIO as BodyInit, { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, procurarCache: async () => null });
    assert.equal(corpo!.get('language'), 'pt');
});

// A URL vem do payload: se o token de uma rota vazasse, sem isto o servidor
// buscaria o que o atacante pedisse.
test('só https fora da rede interna', async () => {
    const { urlDeMidiaPermitida } = await import('../../lib/transcricao.ts');
    assert.ok(urlDeMidiaPermitida('https://uaz.exemplo.com/a.ogg'));
    for (const ruim of ['http://uaz.exemplo.com/a.ogg', 'file:///etc/passwd', 'https://localhost/a', 'https://127.0.0.1/a',
        'https://10.0.0.5/a', 'https://169.254.169.254/latest', 'https://192.168.1.1/a', 'https://172.20.0.1/a',
        'https://[::1]/a', 'https://[fd00::1]/a', 'https://db.internal/a', 'lixo']) {
        assert.equal(urlDeMidiaPermitida(ruim), null, ruim);
    }
});

test('URL recusada não chega a ser buscada', async () => {
    const { f, chamadas } = falso();
    await assert.rejects(transcrever('http://169.254.169.254/x', { apiKey: 'k', buscar: f, procurarCache: async () => null }), /recusada/);
    assert.equal(chamadas.length, 0);
});

test('áudio acima do teto vira erro', async () => {
    const { MAX_BYTES_AUDIO } = await import('../../lib/transcricao.ts');
    const { f } = falso({ audio: new Uint8Array(MAX_BYTES_AUDIO + 1) });
    await assert.rejects(transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, procurarCache: async () => null }), /grande demais/);
});
