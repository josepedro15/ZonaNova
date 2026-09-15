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

    const r = await buscar(midiaUrl);
    if (!r.ok) throw new Error(`áudio inacessível: ${r.status}`);
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength === 0) throw new Error('áudio vazio');

    const hash = hashDoAudio(bytes);

    const emCache = await opcoes.procurarCache(hash);
    if (emCache !== null) return { texto: emCache, hash };

    const form = new FormData();
    form.append('file', new Blob([bytes]), 'audio.ogg');
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
