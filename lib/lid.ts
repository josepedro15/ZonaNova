/**
 * Resolução das conversas `lid:` antigas (scripts/lid-backfill.ts).
 *
 * O histórico de pareamento de 05–07/10/2026 gravou 3.253 conversas pelo LID,
 * sem telefone. A UAZAPI devolve o número de um LID no POST /chat/check; com
 * ele, a conversa `lid:` é unida à do telefone, se o vendedor já tiver uma, ou
 * passa a ter o telefone, se não tiver. Aqui só a decisão, sem I/O: o script
 * faz as chamadas e grava.
 */

import { PREFIXO_LID, variantesTelefone } from './painel.ts';

/** O que o POST /chat/check devolve por número consultado. */
export type ItemCheck = { query?: string; jid?: string; lid?: string; isInWhatsapp?: boolean; error?: string };

/** Quantos LIDs por chamada ao /chat/check. */
export const LOTE_CHECK = 50;

/** Os LIDs como o /chat/check os entende, em lotes. */
export function lotesDeConsulta(lids: string[], tamanho = LOTE_CHECK): string[][] {
    const numeros = lids.map((l) => `${l}@lid`);
    const lotes: string[][] = [];
    for (let i = 0; i < numeros.length; i += tamanho) lotes.push(numeros.slice(i, i + tamanho));
    return lotes;
}

const digitos = (s: string | undefined) => (s ?? '').split('@')[0]!.split(':')[0]!.replace(/\D/g, '');

/**
 * LID → telefone, a partir da resposta do /chat/check. Só vale o `jid` pelo
 * número (`@s.whatsapp.net`): um `jid` que volta como o próprio LID não
 * resolveu nada. O item é casado pelo `query` e, sem ele, pelo `lid`.
 */
export function telefonesDoCheck(itens: ItemCheck[]): Map<string, string> {
    const mapa = new Map<string, string>();
    for (const it of itens) {
        if (it.error || it.isInWhatsapp === false || !it.jid?.endsWith('@s.whatsapp.net')) continue;
        const telefone = digitos(it.jid);
        if (telefone.length < 10 || telefone.length > 15) continue;
        const lid = it.query?.endsWith('@lid') ? digitos(it.query) : digitos(it.lid);
        if (lid) mapa.set(lid, telefone);
    }
    return mapa;
}

export type ConversaLida = { id: string; user_id: string; cliente_telefone: string };

export type Acao =
    | { acao: 'unificar'; origem: string; destino: string; userId: string; lid: string; telefone: string }
    | { acao: 'renomear'; origem: string; userId: string; lid: string; telefone: string }
    | { acao: 'sem_resolucao'; origem: string; userId: string; lid: string };

/**
 * O que fazer com cada conversa `lid:` de um vendedor.
 *
 * - telefone resolvido e conversa do telefone existente (com ou sem o nono
 *   dígito): unir a `lid:` nela;
 * - telefone resolvido sem conversa: a `lid:` passa a ter o telefone. Se dois
 *   LIDs derem o mesmo telefone, o segundo é unido à primeira;
 * - sem telefone: fica como está.
 */
export function planejar(conversas: ConversaLida[], telefones: Map<string, string>): Acao[] {
    const porTelefone = new Map<string, string>();
    for (const c of conversas) {
        if (c.cliente_telefone.startsWith(PREFIXO_LID)) continue;
        porTelefone.set(`${c.user_id}/${c.cliente_telefone}`, c.id);
    }
    const acoes: Acao[] = [];
    for (const c of conversas) {
        if (!c.cliente_telefone.startsWith(PREFIXO_LID)) continue;
        const lid = c.cliente_telefone.slice(PREFIXO_LID.length);
        const telefone = telefones.get(lid);
        if (!telefone) {
            acoes.push({ acao: 'sem_resolucao', origem: c.id, userId: c.user_id, lid });
            continue;
        }
        const destino = variantesTelefone(telefone).map((t) => porTelefone.get(`${c.user_id}/${t}`)).find(Boolean);
        if (destino) {
            acoes.push({ acao: 'unificar', origem: c.id, destino, userId: c.user_id, lid, telefone });
        } else {
            acoes.push({ acao: 'renomear', origem: c.id, userId: c.user_id, lid, telefone });
            porTelefone.set(`${c.user_id}/${telefone}`, c.id);
        }
    }
    return acoes;
}
