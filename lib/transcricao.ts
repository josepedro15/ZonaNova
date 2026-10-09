/**
 * Transcrição de áudio (doc 3 §3.9).
 *
 * "Áudio é parte grande da venda no WhatsApp e ignorar áudio cega a análise."
 * O que esta camada garante, além de transcrever: o mesmo arquivo nunca é
 * transcrito duas vezes. Áudio encaminhado entre vendedores da mesma rede não
 * é raro, e transcrição é paga por minuto.
 */
import { createHash } from 'node:crypto';
import { dataEmSaoPaulo } from './analise.ts';

/**
 * Áudio de hoje ou de ontem (em São Paulo): os únicos dias que o fechamento
 * ainda analisa. Ao conectar, a UAZAPI manda meses de histórico; enfileirar
 * cada áudio antigo punha milhares de itens na frente dos do dia — e a
 * transcrição deles quase sempre falha, a mídia já não existe mais.
 */
export function valeTranscrever(enviadaEm: Date, agora = new Date()): boolean {
    return dataEmSaoPaulo(enviadaEm) >= dataEmSaoPaulo(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
}

export function hashDoAudio(bytes: ArrayBuffer | Uint8Array): string {
    return createHash('sha256').update(Buffer.from(bytes as ArrayBuffer)).digest('hex');
}

export type ResultadoTranscricao = { texto: string; hash: string };

/**
 * Palavras do balcão que o modelo de transcrição não conhece e troca por
 * outras parecidas: "a brita rachão número 4" saía "a Brita rachou o número 4"
 * (Silas, 09/10/2026). O `prompt` da API é só uma pista de vocabulário e de
 * grafia: não é instrução, e o modelo usa só o fim dele (~224 tokens).
 */
export const VOCABULARIO_DA_LOJA = 'Redemac Zona Nova, material de construção no litoral gaúcho: Xangri-Lá, Capão da Canoa, Capão Novo, Atlântida, Tramandaí, Arroio Teixeira. '
    + 'Brita, pedra rachão, pó de brita, areia fina, areia média, saibro, cimento, cal, argamassa AC1, AC2, AC3, rejunte, porcelanato, cerâmica, '
    + 'telha, cumieira, fibrocimento, tijolo, bloco, vergalhão, treliça, tela, caibro, ripa, sarrafo, compensado, MDF, drywall, gesso, forro de PVC, '
    + 'cano, joelho, luva, tê, registro, caixa d\'água, cisterna, cuba, fio 2,5, disjuntor, tinta, massa corrida, selador, impermeabilizante, manta asfáltica. '
    + 'Orçamento, pedido, Pix, boleto, crediário, link de pagamento, entrega, retirada, frete.';

/** Nome de fora (do WhatsApp, do cadastro) limpo para a pista: só letras, espaço e hífen. */
const nomeLimpo = (nome: string | null | undefined) =>
    (nome ?? '').normalize('NFC').replace(/[^\p{L}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/**
 * A pista de vocabulário de um áudio: os nomes de quem fala vêm por último,
 * porque é o fim do prompt que o modelo lê. Nome próprio é o que ele mais
 * erra ("Jasson").
 */
export function promptDeTranscricao({ vendedor, contato }: { vendedor?: string | null; contato?: string | null }): string {
    const nomes = [...new Set([nomeLimpo(vendedor), nomeLimpo(contato)].filter((n) => n.length >= 2))];
    return nomes.length ? `${VOCABULARIO_DA_LOJA} Conversa entre ${nomes.join(' e ')}.` : VOCABULARIO_DA_LOJA;
}

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
 * A URL da mídia vem do payload do webhook ou da UAZAPI. Autenticado, mas ainda assim dado
 * de fora: se o token de uma rota vazasse, quem o tivesse faria o servidor
 * buscar o que quisesse. Só https, e nunca nome ou IP da rede interna. É a
 * checagem do texto; o que o nome resolve é conferido em `baixarComSaltos`.
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
 * Baixa a mídia conferindo cada salto: a URL, o que o nome resolve e, em
 * redirecionamento, o destino — um `https://cdn-publico/x` que responde 302
 * para `http://169.254.169.254/` passava pela checagem do texto e o fetch
 * seguia sozinho.
 *
 * Resta uma janela: o nome é resolvido aqui e de novo pelo fetch. Um DNS
 * hostil que mude a resposta entre as duas (rebinding) ainda passa; fechar isso
 * exigiria conectar direto no IP conferido.
 */
async function baixarComSaltos(bruta: string, buscar: typeof globalThis.fetch, resolver: Resolver): Promise<Response> {
    let atual = bruta;
    for (let salto = 0; salto <= 3; salto++) {
        const url = urlDeMidiaPermitida(atual);
        if (!url) throw new Error('URL de mídia recusada: só https fora da rede interna');
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const ips = /^[\d.]+$|:/.test(host) ? [host] : await resolver(host);
        if (!ips.length || ips.some(ipInterno)) throw new Error('URL de mídia recusada: o nome aponta para a rede interna');

        const r = await buscar(url, { signal: AbortSignal.timeout(60_000), redirect: 'manual' });
        if (!REDIRECIONAMENTOS.includes(r.status)) return r;
        const destino = r.headers.get('location');
        if (!destino) throw new Error(`mídia inacessível: ${r.status} sem destino`);
        atual = new URL(destino, url).toString();
    }
    throw new Error('mídia inacessível: redirecionamentos demais');
}

/** Lê o corpo parando no teto, sem confiar no content-length. */
async function lerComTeto(r: Response, max: number): Promise<Uint8Array> {
    const declarado = Number(r.headers.get('content-length') ?? 0);
    if (declarado > max) throw new Error(`mídia grande demais: ${declarado} bytes`);
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
            throw new Error(`mídia grande demais: mais de ${max} bytes`);
        }
        partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { bytes.set(p, pos); pos += p.byteLength; }
    return bytes;
}

/**
 * Baixa uma mídia pela URL de fora (áudio, imagem, documento) com as mesmas
 * travas: só https fora da rede interna, cada redirecionamento conferido e o
 * corpo cortado no teto.
 */
export async function baixarMidiaSegura(
    url: string,
    max: number,
    { buscar = globalThis.fetch, resolver = resolverDns }: { buscar?: typeof globalThis.fetch; resolver?: Resolver } = {},
): Promise<Uint8Array> {
    const r = await baixarComSaltos(url, buscar, resolver);
    if (!r.ok) throw new Error(`mídia inacessível: ${r.status}`);
    const bytes = await lerComTeto(r, max);
    if (bytes.byteLength === 0) throw new Error('arquivo de mídia vazio');
    return bytes;
}

/**
 * O modelo de transcrição. Em 09/10/2026, em 13 áudios reais da rede, o
 * gpt-4o-mini-transcribe acertou o que o whisper-1 trocava ("a tovaca, o
 * apetite" por "a troca", "Arrua e do Sal" por "Arroio do Sal", "torneiros"
 * por "torneiras"), pela metade do preço por minuto. OPENAI_MODELO_AUDIO
 * troca sem deploy.
 */
export const MODELO_AUDIO_PADRAO = 'gpt-4o-mini-transcribe';
/** O de antes: aceita qualquer arquivo que o novo recuse. */
const MODELO_AUDIO_RESERVA = 'whisper-1';

/**
 * O nome do arquivo pelo conteúdo. A UAZAPI entrega MP3, e ia como
 * "audio.ogg": o whisper-1 adivinha o formato, os modelos gpt-4o recusam
 * ("Audio file might be corrupted or unsupported").
 */
export function nomeDoAudio(bytes: Uint8Array): string {
    const ascii = (de: number, ate: number) => String.fromCharCode(...bytes.subarray(de, ate));
    if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio.mp3';
    if (ascii(0, 4) === 'OggS') return 'audio.ogg';
    if (ascii(0, 4) === 'RIFF') return 'audio.wav';
    if (ascii(4, 8) === 'ftyp') return 'audio.m4a';
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio.webm';
    return 'audio.ogg';
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
        /** Pista de vocabulário (`promptDeTranscricao`). */
        prompt?: string;
        buscar?: typeof globalThis.fetch;
        /** Nome → IPs. Injetável para teste; o padrão é o DNS do sistema. */
        resolver?: Resolver;
    },
): Promise<ResultadoTranscricao> {
    const buscar = opcoes.buscar ?? globalThis.fetch;

    const bytes = await baixarMidiaSegura(midiaUrl, MAX_BYTES_AUDIO, { buscar, resolver: opcoes.resolver });

    const hash = hashDoAudio(bytes);

    const emCache = await opcoes.procurarCache(hash);
    if (emCache !== null) return { texto: emCache, hash };

    const pedir = (modelo: string) => {
        const form = new FormData();
        form.append('file', new Blob([bytes as BlobPart]), nomeDoAudio(bytes));
        form.append('model', modelo);
        // O vendedor fala português; dizer isso evita o modelo "adivinhar" inglês
        // num áudio curto e devolver ruído.
        form.append('language', 'pt');
        if (opcoes.prompt) form.append('prompt', opcoes.prompt);
        return buscar('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { authorization: `Bearer ${opcoes.apiKey}` },
            body: form,
        });
    };

    const modelo = opcoes.modelo || MODELO_AUDIO_PADRAO;
    let t = await pedir(modelo);
    // Arquivo que o modelo novo recusa (formato, duração) ainda tem o de antes.
    if (t.status === 400 && modelo !== MODELO_AUDIO_RESERVA) t = await pedir(MODELO_AUDIO_RESERVA);
    if (!t.ok) throw new Error(`transcrição falhou: ${t.status} ${(await t.text()).slice(0, 200)}`);

    const { text } = (await t.json()) as { text?: string };
    return { texto: text ?? '', hash };
}
