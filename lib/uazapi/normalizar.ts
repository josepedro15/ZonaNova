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
        /**
         * Texto, nas mensagens de texto. Na mídia, a UAZAPI manda o objeto da
         * própria mensagem do WhatsApp (o DocumentMessage/ImageMessage):
         * `URL`, `mimetype`, `fileName`, `caption`…
         */
        content?: string | ConteudoMidia | null;
        caption?: string;
        fileName?: string;
        filename?: string;
        mediaUrl?: string;
        file?: string;
        messageTimestamp?: number;
        timestamp?: number;
        senderName?: string;
        pushName?: string;
        fromApi?: boolean;
        wasSentByApi?: boolean;
};

/** Os campos da mídia que usamos, como o WhatsApp os nomeia. */
export type ConteudoMidia = {
    fileName?: string;
    title?: string;
    caption?: string;
    mimetype?: string;
};

export type MensagemNormalizada = {
    waMessageId: string;
    clienteTelefone: string;
    clienteNome: string | null;
    direcao: 'entrada' | 'saida';
    tipo: 'texto' | 'audio' | 'imagem' | 'documento' | 'video' | 'outro';
    conteudo: string | null;
    midiaUrl: string | null;
    /** Nome do arquivo do documento ("orçamento dos cromados.pdf"). Imagem não tem. */
    midiaNome: string | null;
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

    // `content` objeto é a mídia, não o texto: sem esta checagem o objeto ia
    // parar inteiro na coluna `conteudo`.
    const midia = m.content && typeof m.content === 'object' ? m.content : null;
    const texto = m.text || (typeof m.content === 'string' ? m.content : null) || m.caption || midia?.caption || null;

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
        midiaNome: tipo === 'documento' ? nomeDoArquivo(m.fileName ?? m.filename ?? midia?.fileName ?? midia?.title) : null,
        // Mensagem disparada pela API é template/bot, não o vendedor digitando.
        // O doc 3 exige distinguir: disparo em massa não pode contar como
        // atendimento.
        automatica: m.fromApi === true || m.wasSentByApi === true,
        enviadaEm: paraData(m.messageTimestamp ?? m.timestamp),
    };
}

/** Teto do nome guardado: o resto de um nome de 300 caracteres não ajuda a análise. */
export const MAX_CHARS_NOME_ARQUIVO = 120;

/** Nome de arquivo limpo: sem quebra de linha nem espaço sobrando, e curto. */
export function nomeDoArquivo(bruto: string | null | undefined): string | null {
    const nome = (bruto ?? '').replace(/\s+/g, ' ').trim();
    if (!nome) return null;
    return nome.length > MAX_CHARS_NOME_ARQUIVO ? `${nome.slice(0, MAX_CHARS_NOME_ARQUIVO)}…` : nome;
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
