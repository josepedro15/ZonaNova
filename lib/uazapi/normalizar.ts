/**
 * Traduz o payload da UAZAPI para o que o banco guarda.
 *
 * Fica separado da rota de propósito: é aqui que mora a decisão de descartar
 * mensagem, e decisão de descarte precisa de teste. A rota só faz I/O.
 */

import { PREFIXO_LID } from '../painel.ts';

/** O que a UAZAPI manda. Só os campos que usamos — o resto é ignorado. */
export type EventoUazapi = {
    EventType?: string;
    event?: string;
    token?: string;
    message?: MensagemUazapi;
    messages?: MensagemUazapi[] | null;
    instance?: { status?: string; token?: string; name?: string };
    status?: string;
};

export type MensagemUazapi = {
        id?: string;
        messageid?: string;
        chatid?: string;
        sender?: string;
        fromMe?: boolean;
        isGroup?: boolean;
        messageType?: string;
        type?: string;
        text?: string;
        content?: string;
        caption?: string;
        mediaUrl?: string;
        file?: string;
        messageTimestamp?: number;
        timestamp?: number;
        senderName?: string;
        pushName?: string;
        fromApi?: boolean;
        wasSentByApi?: boolean;
};

export type MensagemNormalizada = {
    waMessageId: string;
    clienteTelefone: string;
    clienteNome: string | null;
    direcao: 'entrada' | 'saida';
    tipo: 'texto' | 'audio' | 'imagem' | 'documento' | 'video' | 'outro';
    conteudo: string | null;
    midiaUrl: string | null;
    automatica: boolean;
    enviadaEm: Date;
};

export type Descarte = { descartar: true; motivo: string };

const TIPOS: Record<string, MensagemNormalizada['tipo']> = {
    conversation: 'texto', extendedtextmessage: 'texto', text: 'texto', chat: 'texto',
    audiomessage: 'audio', audio: 'audio', ptt: 'audio',
    imagemessage: 'imagem', image: 'imagem',
    videomessage: 'video', video: 'video',
    documentmessage: 'documento', document: 'documento',
};

const ALBUM = /^Album: (\d+) images?$/i;

/** Nome de quem vem no cartão: `FN:` do vCard, ou a primeira linha do resumo da UAZAPI. */
function nomeDoContato(texto: string | null): string | null {
    if (!texto) return null;
    const fn = texto.match(/^FN:(.+)$/m)?.[1];
    const nome = (fn ?? (/^Phone:/m.test(texto) ? texto.split('\n')[0] : '')).trim();
    return nome && !nome.startsWith('BEGIN:') ? nome.slice(0, 80) : null;
}

/**
 * Figurinha, reação, contato, álbum e localização caíam em "outro" e a IA via
 * só "[Mídia: outro]" — o cliente que fecha com uma figurinha de aperto de
 * mão ficava invisível. O tipo no banco continua "outro" (sem migração); o
 * conteúdo vira uma marca entre colchetes que a tela e o transcript mostram.
 */
export function marcaDeMidia(bruto: string, texto: string | null): string | null {
    if (bruto.startsWith('sticker')) return '[figurinha]';
    if (bruto.startsWith('reaction')) return texto?.trim() ? `[reagiu com ${texto.trim()}]` : '[reação]';
    if (bruto.startsWith('location') || bruto.startsWith('livelocation')) return '[localização]';
    const fotos = texto?.trim().match(ALBUM)?.[1];
    if (bruto.startsWith('album') || fotos) return fotos ? `[álbum com ${fotos} fotos]` : '[álbum de fotos]';
    const nome = nomeDoContato(texto);
    if (bruto.startsWith('contact') || nome) return nome ? `[contato compartilhado: ${nome}]` : '[contato compartilhado]';
    return null;
}

/**
 * `5511999998888@s.whatsapp.net` → `5511999998888`.
 * Grupo (`@g.us`), status e broadcast não têm telefone de cliente e são
 * descartados antes de chegar aqui.
 */
export function soDigitos(jid: string): string {
    return (jid.split('@')[0] ?? '').split(':')[0]!.replace(/\D/g, '');
}

/**
 * O timestamp da UAZAPI vem em segundos nuns eventos e em milissegundos
 * noutros. Distinguir pela grandeza: segundos cabem em ~10 dígitos até 2286.
 */
export function paraData(ts: number | undefined): Date {
    if (!ts) return new Date();
    return new Date(ts < 1e12 ? ts * 1000 : ts);
}

export function normalizarMensagem(ev: EventoUazapi): MensagemNormalizada | Descarte {
    const m = ev.message;
    if (!m) return { descartar: true, motivo: 'evento sem mensagem' };

    const id = m.id ?? m.messageid;
    if (!id) return { descartar: true, motivo: 'mensagem sem id — não há como ser idempotente' };

    const chat = m.chatid ?? m.sender ?? '';

    // Grupo, status e broadcast nunca são atendimento comercial de um cliente.
    // Analisar isso enche o relatório do vendedor de ruído e distorce a média.
    if (m.isGroup || chat.endsWith('@g.us')) return { descartar: true, motivo: 'grupo' };
    if (chat.startsWith('status@') || chat.endsWith('@broadcast')) {
        return { descartar: true, motivo: 'status/broadcast' };
    }
    // Canal do WhatsApp: conteúdo publicado para seguidores, nunca um cliente.
    if (chat.endsWith('@newsletter')) return { descartar: true, motivo: 'canal' };

    const digitos = soDigitos(chat);
    if (!digitos) return { descartar: true, motivo: 'sem telefone identificável' };
    // `@lid` é o identificador de privacidade do WhatsApp: estável para a
    // conversa, mas não é telefone. Guardado com prefixo para a tela não o
    // formatar como número nem montar um link wa.me que abre outra pessoa.
    const telefone = chat.endsWith('@lid') ? `${PREFIXO_LID}${digitos}` : digitos;

    const bruto = (m.messageType ?? m.type ?? 'text').toLowerCase().replace(/[_\s-]/g, '');
    const tipo = TIPOS[bruto] ?? 'outro';

    const textoOriginal = m.text ?? m.content ?? m.caption ?? null;
    const texto = tipo === 'outro' ? marcaDeMidia(bruto, textoOriginal) ?? textoOriginal : textoOriginal;

    return {
        waMessageId: id,
        clienteTelefone: telefone,
        // Em mensagem enviada, `senderName`/`pushName` é o nome do próprio
        // vendedor. Gravá-lo sobrescreveria o nome do cliente na conversa.
        clienteNome: m.fromMe ? null : (m.senderName ?? m.pushName ?? null),
        direcao: m.fromMe ? 'saida' : 'entrada',
        tipo,
        conteudo: texto && texto.length > 0 ? texto : null,
        midiaUrl: m.mediaUrl ?? m.file ?? null,
        // Mensagem disparada pela API é template/bot, não o vendedor digitando.
        // O doc 3 exige distinguir: disparo em massa não pode contar como
        // atendimento.
        automatica: m.fromApi === true || m.wasSentByApi === true,
        enviadaEm: paraData(m.messageTimestamp ?? m.timestamp),
    };
}

/** Eventos ao vivo trazem `message`; histórico traz lotes em `messages`. */
export function mensagensDoEvento(ev: EventoUazapi): MensagemUazapi[] {
    if (ev.message) return [ev.message];
    return Array.isArray(ev.messages) ? ev.messages : [];
}

/** Eventos de conexão viram o `status` de conexoes_whatsapp. */
export function statusDeConexao(ev: EventoUazapi): 'conectada' | 'caida' | 'aguardando_qr' | null {
    const s = (ev.instance?.status ?? ev.status ?? '').toLowerCase();
    if (s === 'connected' || s === 'open') return 'conectada';
    if (s === 'disconnected' || s === 'close' || s === 'closed') return 'caida';
    if (s === 'connecting' || s === 'qrcode' || s === 'pairing') return 'aguardando_qr';
    return null;
}
