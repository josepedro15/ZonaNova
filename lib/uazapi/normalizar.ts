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
    /** Snapshot do chat, que acompanha a mensagem ao vivo. */
    chat?: ChatUazapi | null;
    instance?: { status?: string; token?: string; name?: string };
    status?: string;
};

export type MensagemUazapi = {
        id?: string;
        messageid?: string;
        chatid?: string;
        /** LID do chat, quando o `chatid` vem pelo número (o `history` documentado). */
        chatlid?: string | null;
        sender?: string;
        /** Remetente pelo número (`…@s.whatsapp.net`), quando a UAZAPI o resolve. */
        sender_pn?: string | null;
        /** Remetente pelo LID (`…@lid`). */
        sender_lid?: string | null;
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
        /** Número da instância. Vem na /message/find; o id do webhook é `owner:messageid`. */
        owner?: string;
};

/** Os campos do chat que identificam o contato. */
export type ChatUazapi = {
    wa_chatid?: string;
    wa_chatlid?: string | null;
    /** Telefone formatado ("+55 11 99999-9999"), ou vazio. */
    phone?: string;
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
    /** Telefone (E.164 sem `+`) ou, sem telefone conhecido, `lid:<dígitos>`. */
    clienteTelefone: string;
    /** Dígitos do LID do contato, quando se sabe: une a conversa `lid:` à do telefone. */
    clienteLid: string | null;
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

const ehLid = (jid: string | null | undefined): jid is string => !!jid && jid.endsWith('@lid');
const ehNumero = (jid: string | null | undefined): jid is string => !!jid && jid.endsWith('@s.whatsapp.net');

/** Telefone plausível: E.164 sem `+`, de 10 a 15 dígitos. */
function telefoneValido(bruto: string | null | undefined): string | null {
    const d = (bruto ?? '').replace(/\D/g, '');
    return d.length >= 10 && d.length <= 15 ? d : null;
}

/**
 * Quem é o cliente da conversa: telefone e LID.
 *
 * `@lid` é o identificador de privacidade do WhatsApp: estável para a
 * conversa, mas não é telefone. O histórico de 05–07/10 chegou com o chat por
 * LID e o ao vivo pelo número, e a mesma pessoa virou duas conversas. Por isso
 * o telefone vale sempre que a UAZAPI o disser — o `sender_pn` da mensagem do
 * cliente (na enviada, o remetente é o vendedor) ou o chat que acompanha a
 * mensagem, se for o mesmo chat — e o LID vai junto, para a ingestão unir a
 * conversa `lid:` que já existir. Sem telefone, `lid:<dígitos>`: o prefixo
 * impede a tela de formatá-lo como número e montar um wa.me que abre outra
 * pessoa.
 */
export function contatoDoChat(m: MensagemUazapi, chat: ChatUazapi | null): { telefone: string; lid: string | null } | null {
    const chatid = m.chatid ?? m.sender ?? '';
    const digitos = soDigitos(chatid);
    if (!digitos) return null;

    if (ehLid(chatid)) {
        const mesmoChat = !!chat && (chat.wa_chatid === chatid || (ehLid(chat.wa_chatlid) && soDigitos(chat.wa_chatlid) === digitos));
        const telefone = (!m.fromMe && ehNumero(m.sender_pn) ? telefoneValido(soDigitos(m.sender_pn)) : null)
            ?? (mesmoChat && ehNumero(chat!.wa_chatid) ? telefoneValido(soDigitos(chat!.wa_chatid)) : null)
            ?? (mesmoChat ? telefoneValido(chat!.phone) : null);
        return { telefone: telefone ?? `${PREFIXO_LID}${digitos}`, lid: digitos };
    }

    const mesmoChat = !!chat && chat.wa_chatid === chatid;
    const lid = [m.chatlid, mesmoChat ? chat!.wa_chatlid : null, m.fromMe ? null : m.sender_lid].find(ehLid);
    return { telefone: digitos, lid: lid ? soDigitos(lid) || null : null };
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

    const contato = contatoDoChat(m, ev.chat ?? null);
    if (!contato) return { descartar: true, motivo: 'sem telefone identificável' };

    const bruto = (m.messageType ?? m.type ?? 'text').toLowerCase().replace(/[_\s-]/g, '');
    const tipo = TIPOS[bruto] ?? 'outro';

    // `content` objeto é a mídia, não o texto: sem esta checagem o objeto ia
    // parar inteiro na coluna `conteudo`. Às vezes (sobretudo no `history`) o
    // mesmo objeto vem serializado em texto, em `content` ou `text`.
    const midia = m.content && typeof m.content === 'object' ? m.content : midiaSerializada(m.content) ?? midiaSerializada(m.text);
    const soTexto = (s: unknown) => (typeof s === 'string' && s && !midiaSerializada(s) ? s : null);
    const textoOriginal = soTexto(m.text) || soTexto(m.content) || m.caption || midia?.caption || null;
    const texto = tipo === 'outro' ? marcaDeMidia(bruto, textoOriginal) ?? textoOriginal : textoOriginal;

    return {
        waMessageId: id,
        clienteTelefone: contato.telefone,
        clienteLid: contato.lid,
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
        // atendimento. A saudação e a ausência do WhatsApp Business saem do
        // próprio aparelho, sem `fromApi`: só o texto as denuncia — dos dois
        // lados, porque a ausência da empresa do cliente também não é ele falando.
        automatica: m.fromApi === true || m.wasSentByApi === true || ehRespostaAutomatica(textoOriginal),
        enviadaEm: paraData(m.messageTimestamp ?? m.timestamp),
    };
}

/**
 * Frases de resposta automática (saudação e ausência do WhatsApp Business, e
 * as das empresas dos clientes). Cada regra é um "e" de padrões; basta uma
 * regra casar. Palavra solta não basta: "nós que agradecemos" e "o financeiro
 * entrou em contato" são gente. A migração 0028 repete estas regras em SQL
 * para marcar o que já está no banco — mudou aqui, muda lá.
 */
const REGRAS_AUTOMATICA: RegExp[][] = [
    [/n[aã]o estamos dispon[ií]ve(l|is)/i],
    [/voc[eê] entrou em contato com/i],
    [/(mensagem|resposta) autom[aá]tica/i],
    [/fora d[oe] (nosso )?hor[aá]rio de atendimento/i],
    [/agradece(mos)? (a |o )?(sua|seu|pela sua|pelo seu|por entrar em) (mensagem|contato)/i, /(retorn|respond|hor[aá]rio|em breve|assim que poss)/i],
    [/receb(emos|eu) (a )?sua mensagem/i, /(retorn|respond|em breve)/i],
    [/retornaremos (o |a )?(seu |sua )?(contato|mensagem|solicita)/i],
];

export function ehRespostaAutomatica(texto: string | null | undefined): boolean {
    const t = (texto ?? '').replace(/\s+/g, ' ');
    return !!t && REGRAS_AUTOMATICA.some((regra) => regra.every((r) => r.test(t)));
}

/**
 * O objeto de mídia do WhatsApp em texto ({"URL":…,"mediaKey":…}), ou null.
 * Reconhecido pelas chaves que só ele tem: um cliente que escreve "{...}" não
 * perde a fala.
 */
export function midiaSerializada(s: unknown): ConteudoMidia | null {
    if (typeof s !== 'string' || !s.startsWith('{')) return null;
    try {
        const o = JSON.parse(s) as Record<string, unknown>;
        return o && typeof o === 'object' && ('URL' in o || 'mediaKey' in o || 'directPath' in o) ? (o as ConteudoMidia) : null;
    } catch {
        return null;
    }
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
