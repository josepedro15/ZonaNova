/**
 * Transcrição de áudio (doc 3 §3.9).
 *
 * "Áudio é parte grande da venda no WhatsApp e ignorar áudio cega a análise."
 * O que esta camada garante, além de transcrever: o mesmo arquivo nunca é
 * transcrito duas vezes. Áudio encaminhado entre vendedores da mesma rede não
 * é raro, e transcrição é paga por minuto.
 */
import { createHash } from 'node:crypto';

export function hashDoAudio(bytes: ArrayBuffer | Uint8Array): string {
    return createHash('sha256').update(Buffer.from(bytes as ArrayBuffer)).digest('hex');
}

export type ResultadoTranscricao = { texto: string; hash: string };

/** O limite de arquivo da API de transcrição: acima disso ela recusa de todo jeito. */
export const MAX_BYTES_AUDIO = 25 * 1024 * 1024;

/**
 * A URL do áudio vem do payload do webhook. Autenticado, mas ainda assim dado
 * de fora: se o token de uma rota vazasse, quem o tivesse faria o servidor
 * buscar o que quisesse. Só https, e nunca nome ou IP da rede interna.
 */
export function urlDeMidiaPermitida(bruta: string): URL | null {
    let url: URL;
    try { url = new URL(bruta); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
    }
    if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:'))) return null;
    return url;
}

/** Lê o corpo parando no teto, sem confiar no content-length. */
async function lerComTeto(r: Response, max: number): Promise<Uint8Array> {
    const declarado = Number(r.headers.get('content-length') ?? 0);
    if (declarado > max) throw new Error(`áudio grande demais: ${declarado} bytes`);
    if (!r.body) return new Uint8Array(await r.arrayBuffer());
    const leitor = r.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            await leitor.cancel();
            throw new Error(`áudio grande demais: mais de ${max} bytes`);
        }
        partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
    return bytes;
}

/**
 * Baixa o áudio, calcula o hash e transcreve. O `procurarCache` recebe o hash
 * e devolve o texto já transcrito, se houver — a chamada paga só acontece
 * quando o cache erra.
 */
export async function transcrever(
    midiaUrl: string,
    opcoes: {
        apiKey: string;
        modelo?: string;
        procurarCache: (hash: string) => Promise<string | null>;
        buscar?: typeof globalThis.fetch;
    },
): Promise<ResultadoTranscricao> {
    const buscar = opcoes.buscar ?? globalThis.fetch;

    const url = urlDeMidiaPermitida(midiaUrl);
    if (!url) throw new Error('URL de áudio recusada: só https fora da rede interna');
    const r = await buscar(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`áudio inacessível: ${r.status}`);
    const bytes = await lerComTeto(r, MAX_BYTES_AUDIO);
    if (bytes.byteLength === 0) throw new Error('áudio vazio');

    const hash = hashDoAudio(bytes);

    const emCache = await opcoes.procurarCache(hash);
    if (emCache !== null) return { texto: emCache, hash };

    const form = new FormData();
    form.append('file', new Blob([bytes as BlobPart]), 'audio.ogg');
    form.append('model', opcoes.modelo ?? 'whisper-1');
    // O vendedor fala português; dizer isso evita o modelo "adivinhar" inglês
    // num áudio curto e devolver ruído.
    form.append('language', 'pt');

    const t = await buscar('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${opcoes.apiKey}` },
        body: form,
    });
    if (!t.ok) throw new Error(`transcrição falhou: ${t.status} ${(await t.text()).slice(0, 200)}`);

    const { text } = (await t.json()) as { text?: string };
    return { texto: text ?? '', hash };
}
