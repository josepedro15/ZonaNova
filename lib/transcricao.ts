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

/** Endereço da rede interna, loopback, link-local ou de metadados da nuvem. */
export function ipInterno(ip: string): boolean {
    const h = ip.toLowerCase().replace(/^\[|\]$/g, '');
    const mapeado = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipInterno(mapeado[1]);
    const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    if (h.includes(':')) {
        return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
    }
    return false;
}

/**
 * A URL do áudio vem do payload do webhook. Autenticado, mas ainda assim dado
 * de fora: se o token de uma rota vazasse, quem o tivesse faria o servidor
 * buscar o que quisesse. Só https, e nunca nome ou IP da rede interna. É a
 * checagem do texto; o que o nome resolve é conferido em `baixarAudio`.
 */
export function urlDeMidiaPermitida(bruta: string): URL | null {
    let url: URL;
    try { url = new URL(bruta); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (ipInterno(host)) return null;
    return url;
}

export type Resolver = (host: string) => Promise<string[]>;

const resolverDns: Resolver = async (host) => {
    const { lookup } = await import('node:dns/promises');
    return (await lookup(host, { all: true })).map((r) => r.address);
};

const REDIRECIONAMENTOS = [301, 302, 303, 307, 308];

/**
 * Baixa o áudio conferindo cada salto: a URL, o que o nome resolve e, em
 * redirecionamento, o destino — um `https://cdn-publico/x` que responde 302
 * para `http://169.254.169.254/` passava pela checagem do texto e o fetch
 * seguia sozinho.
 *
 * Resta uma janela: o nome é resolvido aqui e de novo pelo fetch. Um DNS
 * hostil que mude a resposta entre as duas (rebinding) ainda passa; fechar isso
 * exigiria conectar direto no IP conferido.
 */
async function baixarAudio(bruta: string, buscar: typeof globalThis.fetch, resolver: Resolver): Promise<Response> {
    let atual = bruta;
    for (let salto = 0; salto <= 3; salto++) {
        const url = urlDeMidiaPermitida(atual);
        if (!url) throw new Error('URL de áudio recusada: só https fora da rede interna');
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const ips = /^[\d.]+$|:/.test(host) ? [host] : await resolver(host);
        if (!ips.length || ips.some(ipInterno)) throw new Error('URL de áudio recusada: o nome aponta para a rede interna');

        const r = await buscar(url, { signal: AbortSignal.timeout(60_000), redirect: 'manual' });
        if (!REDIRECIONAMENTOS.includes(r.status)) return r;
        const destino = r.headers.get('location');
        if (!destino) throw new Error(`áudio inacessível: ${r.status} sem destino`);
        atual = new URL(destino, url).toString();
    }
    throw new Error('áudio inacessível: redirecionamentos demais');
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
        /** Nome → IPs. Injetável para teste; o padrão é o DNS do sistema. */
        resolver?: Resolver;
    },
): Promise<ResultadoTranscricao> {
    const buscar = opcoes.buscar ?? globalThis.fetch;

    const r = await baixarAudio(midiaUrl, buscar, opcoes.resolver ?? resolverDns);
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
