import { paraData, type MensagemUazapi } from './normalizar.ts';

/**
 * O rastro do que o webhook recebeu (0033) — sem I/O.
 *
 * Mensagem descartada, de contato fora da análise ou de vendedor inativo não
 * deixava rastro: quando o PDF do Rafael ao Xexéu (08/10/2026) não apareceu,
 * não havia como provar se o webhook o recebeu e descartou ou se ele nunca
 * chegou. Cada mensagem que passa pelo webhook vira uma linha aqui, com o que
 * foi feito dela — sem o conteúdo, que só vive em `mensagens`.
 */

export type DestinoWebhook = 'gravada' | 'descartada' | 'fora_da_analise' | 'dono_inativo' | 'erro';

export type LinhaRegistro = {
    conexao_id: string;
    evento: string | null;
    wa_message_id: string | null;
    tipo_bruto: string | null;
    from_me: boolean;
    chat: string | null;
    enviada_em: string;
    destino: DestinoWebhook;
    motivo: string | null;
};

export function linhaDoRegistro(conexaoId: string, evento: string | null | undefined, m: MensagemUazapi, destino: DestinoWebhook, motivo?: string | null): LinhaRegistro {
    return {
        conexao_id: conexaoId,
        evento: evento ?? null,
        // O mesmo id que a ingestão grava em mensagens.wa_message_id.
        wa_message_id: m.id ?? m.messageid ?? null,
        tipo_bruto: m.messageType ?? m.type ?? null,
        from_me: m.fromMe === true,
        chat: m.chatid ?? m.sender ?? null,
        enviada_em: paraData(m.messageTimestamp ?? m.timestamp).toISOString(),
        destino,
        motivo: motivo ? motivo.slice(0, 200) : null,
    };
}
