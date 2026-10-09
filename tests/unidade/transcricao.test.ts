import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcrever, hashDoAudio } from '../../lib/transcricao.ts';

const AUDIO = new Uint8Array([1, 2, 3, 4, 5]);
/** DNS de mentira: todo nome resolve para um IP público. */
const publico = async () => ['93.184.216.34'];

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
        apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null,
    });
    assert.equal(r.texto, 'bom dia, seu João');
    assert.equal(r.hash, hashDoAudio(AUDIO));
});

// O §3.9: o mesmo áudio encaminhado não pode ser transcrito duas vezes.
// Transcrição é paga, e áudio encaminhado entre vendedores não é raro.
test('cache evita a chamada paga', async () => {
    const { f, chamadas } = falso();
    const r = await transcrever('https://uaz/a.ogg', {
        apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => 'já transcrito antes',
    });
    assert.equal(r.texto, 'já transcrito antes');
    assert.equal(chamadas.filter((c) => c.includes('openai.com')).length, 0);
});

test('o cache é consultado pelo hash do arquivo, não pela URL', async () => {
    const { f } = falso();
    let visto: string | null = null;
    await transcrever('https://uaz/outra-url.ogg', {
        apiKey: 'k', buscar: f, resolver: publico,
        procurarCache: async (h) => { visto = h; return null; },
    });
    assert.equal(visto, hashDoAudio(AUDIO));
});

test('áudio inacessível vira erro, não transcrição vazia', async () => {
    const { f } = falso({ statusAudio: 404 });
    await assert.rejects(
        () => transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null }),
        /inacessível: 404/,
    );
});

test('áudio vazio vira erro', async () => {
    const { f } = falso({ audio: new Uint8Array([]) });
    await assert.rejects(
        () => transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null }),
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
    await transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null });
    assert.equal(corpo!.get('language'), 'pt');
});

/** fetch falso que guarda cada pedido à OpenAI e responde com `status` na ordem. */
function openaiFalsa(audio: Uint8Array, ...status: number[]) {
    const pedidos: FormData[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).includes('openai.com')) return new Response(audio as BodyInit, { status: 200 });
        pedidos.push(init!.body as FormData);
        const s = status[pedidos.length - 1] ?? 200;
        return new Response(JSON.stringify(s === 200 ? { text: `pelo ${pedidos.at(-1)!.get('model')}` } : { error: {} }), { status: s });
    }) as unknown as typeof globalThis.fetch;
    return { f, pedidos };
}
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]);

// 09/10: a UAZAPI entrega MP3; como "audio.ogg", o gpt-4o-mini-transcribe recusava.
test('o arquivo vai com o nome do formato real', async () => {
    const { nomeDoAudio } = await import('../../lib/transcricao.ts');
    assert.equal(nomeDoAudio(MP3), 'audio.mp3');
    assert.equal(nomeDoAudio(new Uint8Array([0xff, 0xfb, 0x54, 0])), 'audio.mp3');
    assert.equal(nomeDoAudio(new TextEncoder().encode('OggS....')), 'audio.ogg');
    assert.equal(nomeDoAudio(new TextEncoder().encode('....ftypM4A ')), 'audio.m4a');
    assert.equal(nomeDoAudio(AUDIO), 'audio.ogg');
    const { f, pedidos } = openaiFalsa(MP3);
    await transcrever('https://uaz/a', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null });
    assert.equal((pedidos[0].get('file') as File).name, 'audio.mp3');
});

test('usa o gpt-4o-mini-transcribe com a pista de vocabulário; o modelo da variável manda', async () => {
    const { f, pedidos } = openaiFalsa(MP3);
    const r = await transcrever('https://uaz/a', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null, prompt: 'pedra rachão' });
    assert.equal(r.texto, 'pelo gpt-4o-mini-transcribe');
    assert.equal(pedidos[0].get('prompt'), 'pedra rachão');
    const outro = openaiFalsa(MP3);
    await transcrever('https://uaz/a', { apiKey: 'k', modelo: 'whisper-1', buscar: outro.f, resolver: publico, procurarCache: async () => null });
    assert.equal(outro.pedidos[0].get('model'), 'whisper-1');
    assert.equal(outro.pedidos[0].get('prompt'), null);
});

test('arquivo recusado pelo modelo novo vai para o whisper-1; outro erro não', async () => {
    const recusado = openaiFalsa(MP3, 400);
    const r = await transcrever('https://uaz/a', { apiKey: 'k', buscar: recusado.f, resolver: publico, procurarCache: async () => null });
    assert.equal(r.texto, 'pelo whisper-1');
    const fora = openaiFalsa(MP3, 500);
    await assert.rejects(transcrever('https://uaz/a', { apiKey: 'k', buscar: fora.f, resolver: publico, procurarCache: async () => null }), /falhou: 500/);
    assert.equal(fora.pedidos.length, 1);
});

test('a pista leva o vocabulário da loja e os nomes de quem fala, por último', async () => {
    const { promptDeTranscricao, VOCABULARIO_DA_LOJA } = await import('../../lib/transcricao.ts');
    assert.equal(promptDeTranscricao({}), VOCABULARIO_DA_LOJA);
    assert.ok(VOCABULARIO_DA_LOJA.includes('rachão'));
    const p = promptDeTranscricao({ vendedor: 'Rafael Muller', contato: 'Jasson 🔨 (obra)' });
    assert.ok(p.endsWith('Conversa entre Rafael Muller e Jasson obra.'), p);
    assert.equal(promptDeTranscricao({ vendedor: 'Ana', contato: 'Ana' }).endsWith('Conversa entre Ana.'), true);
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
    await assert.rejects(transcrever('http://169.254.169.254/x', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null }), /recusada/);
    assert.equal(chamadas.length, 0);
});

test('áudio acima do teto vira erro', async () => {
    const { MAX_BYTES_AUDIO } = await import('../../lib/transcricao.ts');
    const { f } = falso({ audio: new Uint8Array(MAX_BYTES_AUDIO + 1) });
    await assert.rejects(transcrever('https://uaz/a.ogg', { apiKey: 'k', buscar: f, resolver: publico, procurarCache: async () => null }), /grande demais/);
});

test('nome que resolve para a rede interna é recusado', async () => {
    const { f, chamadas } = falso();
    await assert.rejects(transcrever('https://parece-publico.exemplo.com/a.ogg', {
        apiKey: 'k', buscar: f, resolver: async () => ['10.0.0.7'], procurarCache: async () => null,
    }), /rede interna/);
    assert.equal(chamadas.length, 0);
});

test('redirecionamento é seguido só para destino permitido', async () => {
    const saltos = (destino: string) => (async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('openai.com')) return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
        if (u.includes('cdn.exemplo.com')) return new Response(null, { status: 302, headers: { location: destino } });
        return new Response(AUDIO as BodyInit, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const r = await transcrever('https://cdn.exemplo.com/a.ogg', {
        apiKey: 'k', buscar: saltos('https://arquivos.exemplo.com/a.ogg'), resolver: publico, procurarCache: async () => null,
    });
    assert.equal(r.texto, 'ok');

    await assert.rejects(transcrever('https://cdn.exemplo.com/a.ogg', {
        apiKey: 'k', buscar: saltos('http://169.254.169.254/latest/meta-data'), resolver: publico, procurarCache: async () => null,
    }), /recusada/);
});

test('IP interno reconhecido em todas as formas', async () => {
    const { ipInterno } = await import('../../lib/transcricao.ts');
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.31.0.1', '192.168.0.1', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1']) {
        assert.equal(ipInterno(ip), true, ip);
    }
    for (const ip of ['93.184.216.34', '172.32.0.1', '2606:4700::1111']) assert.equal(ipInterno(ip), false, ip);
});

// Ao conectar, a UAZAPI manda meses de histórico. Cada áudio antigo enfileirado
// entrava na frente dos do dia: 14 mil itens a 4 por rodada seguraram as
// transcrições e a análise de ontem por dias.
test('só áudio de hoje ou de ontem (em São Paulo) vale transcrever', async () => {
    const { valeTranscrever } = await import('../../lib/transcricao.ts');
    const agora = new Date('2026-10-06T13:00:00Z'); // 10h em São Paulo
    assert.equal(valeTranscrever(new Date('2026-10-06T12:48:00Z'), agora), true, 'hoje');
    assert.equal(valeTranscrever(new Date('2026-10-05T03:00:00Z'), agora), true, 'ontem, 0h em SP');
    assert.equal(valeTranscrever(new Date('2026-10-05T02:59:00Z'), agora), false, 'anteontem, 23h59 em SP');
    assert.equal(valeTranscrever(new Date('2026-08-21T15:00:00Z'), agora), false, 'histórico de agosto');
});

test('logo depois da meia-noite, ontem ainda vale', async () => {
    const { valeTranscrever } = await import('../../lib/transcricao.ts');
    const agora = new Date('2026-10-06T03:10:00Z'); // 0h10 em São Paulo
    assert.equal(valeTranscrever(new Date('2026-10-05T23:50:00Z'), agora), true);
    assert.equal(valeTranscrever(new Date('2026-10-04T23:50:00Z'), agora), false);
});
