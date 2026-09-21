/**
 * Autenticação das rotas de cron.
 *
 * O pg_cron do Supabase chama por HTTP público — a URL não é segredo, e quem a
 * descobrisse poderia disparar o fechamento do dia à vontade. Quem separa é o
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Comparação em tempo constante pelo mesmo motivo do webhook: endpoint aberto,
 * chamável quantas vezes o atacante quiser, e o `===` vaza o segredo pelo
 * tempo de resposta.
 */
import { segredoIgual } from './crypto.ts';

export function cronAutorizado(req: Request): boolean {
    const segredo = process.env.CRON_SECRET;
    if (!segredo) return false;
    const cabecalho = req.headers.get('authorization') ?? '';
    const prefixo = 'Bearer ';
    if (!cabecalho.startsWith(prefixo)) return false;
    return segredoIgual(cabecalho.slice(prefixo.length), segredo);
}
