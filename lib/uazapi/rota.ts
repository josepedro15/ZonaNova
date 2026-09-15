/**
 * Token de rota do webhook — um por vendedor, sem coluna nova no banco.
 *
 * A UAZAPI precisa de uma URL fixa por instância, e essa URL fica gravada lá.
 * Se a URL fosse só `/api/webhook/uazapi`, qualquer um que a descobrisse
 * poderia injetar mensagem em nome de qualquer vendedor.
 *
 * O token é `<conexaoId>.<hmac>`, com o hmac derivado de UAZAPI_WEBHOOK_SECRET.
 * Assim dá para saber DE QUEM é a chamada sem consultar o banco, e forjar uma
 * exige o segredo. Sem coluna nova: a assinatura é recalculada e comparada.
 *
 * Isto autentica a ROTA. A rota ainda confere o `instance_token` do payload
 * contra o que está gravado — duas perguntas diferentes: "esta URL é de quem
 * diz ser?" e "esta mensagem veio da instância daquele vendedor?".
 */
import { createHmac } from 'node:crypto';
import { segredoIgual } from '../crypto.ts';

function assinar(conexaoId: string, segredo: string): string {
    return createHmac('sha256', segredo).update(conexaoId).digest('base64url');
}

export function tokenDeRota(conexaoId: string, segredo: string): string {
    return `${conexaoId}.${assinar(conexaoId, segredo)}`;
}

/** Devolve o id da conexão, ou null se a assinatura não bate. */
export function conexaoDoToken(token: string, segredo: string): string | null {
    const corte = token.lastIndexOf('.');
    if (corte <= 0) return null;
    const conexaoId = token.slice(0, corte);
    const assinatura = token.slice(corte + 1);
    if (!segredoIgual(assinatura, assinar(conexaoId, segredo))) return null;
    return conexaoId;
}
