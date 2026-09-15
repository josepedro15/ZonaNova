/**
 * Cifra dos tokens de instância da UAZAPI (AES-256-GCM).
 *
 * O `instance_token` é a credencial do WhatsApp de uma pessoa: quem o tem
 * manda mensagem pelo número dela. Fica cifrado em repouso porque o banco não
 * é a última fronteira — um dump, um backup mal guardado ou uma política
 * futura mal escrita não podem entregar o número de ninguém.
 *
 * Formato do blob: iv(12) ‖ tag(16) ‖ ciphertext. Tudo num `bytea` só, para
 * não haver como gravar metade e perder a outra.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
// Import relativo e com extensão, não pelo alias `@/`: este módulo também é
// carregado pelo `node --test`, que roda fora do resolvedor do Next e não
// conhece os `paths` do tsconfig. A extensão é o que os dois entendem.
import { encryptionKey } from './env.ts';

const IV_BYTES = 12;
const TAG_BYTES = 16;

function chave(): Buffer {
    const bruta = Buffer.from(encryptionKey(), 'base64');
    if (bruta.length !== 32) {
        throw new Error(
            `ZN_ENCRYPTION_KEY deve ter 32 bytes em base64 (veio ${bruta.length}). ` +
            'Gerar com: openssl rand -base64 32',
        );
    }
    return bruta;
}

export function cifrar(texto: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cifra = createCipheriv('aes-256-gcm', chave(), iv);
    const corpo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    return Buffer.concat([iv, cifra.getAuthTag(), corpo]);
}

export function decifrar(blob: Buffer): string {
    if (blob.length < IV_BYTES + TAG_BYTES) {
        throw new Error('blob cifrado truncado');
    }
    const iv = blob.subarray(0, IV_BYTES);
    const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const corpo = blob.subarray(IV_BYTES + TAG_BYTES);
    const decifra = createDecipheriv('aes-256-gcm', chave(), iv);
    decifra.setAuthTag(tag);
    return Buffer.concat([decifra.update(corpo), decifra.final()]).toString('utf8');
}

/**
 * Comparação de segredo em tempo constante.
 *
 * O `===` devolve mais cedo no primeiro byte diferente, e essa diferença de
 * tempo é medível pela rede: dá para descobrir um segredo byte a byte. Usado
 * no token de rota do webhook, que é exatamente o caso — endpoint público,
 * chamado por quem quiser, quantas vezes quiser.
 */
export function segredoIgual(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    // timingSafeEqual exige mesmo tamanho; o tamanho em si não é segredo.
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}
