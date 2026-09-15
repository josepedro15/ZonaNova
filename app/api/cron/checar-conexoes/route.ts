import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { decifrar } from '@/lib/crypto';
import { Uazapi, ehNossa } from '@/lib/uazapi/cliente';

export const maxDuration = 60;

/**
 * Corrige o status das conexões batendo o estado real na UAZAPI (doc 4 §4.4).
 *
 * Existe porque webhook de desconexão se perde — a instância cai, o evento não
 * chega, e o vendedor passa o dia achando que está sendo analisado enquanto o
 * número está fora. Ping não se perde. Roda de 2 em 2 horas.
 *
 * Só escreve quando o status MUDOU: assim o `ultimo_evento_em` continua
 * significando "quando algo aconteceu", e não "quando o cron passou".
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) {
        return Response.json({ erro: 'não autorizado' }, { status: 401 });
    }

    const url = process.env.UAZAPI_API_URL;
    const admin = process.env.UAZAPI_ADMIN_TOKEN;
    if (!url || !admin) {
        return Response.json({ erro: 'UAZAPI não configurada' }, { status: 500 });
    }

    const uaz = new Uazapi(url, admin);
    const supabase = criarClienteAdmin();

    const { data: conexoes, error } = await supabase
        .from('conexoes_whatsapp')
        .select('id, status, instance_token, numero')
        .not('instance_token', 'is', null)
        .returns<{ id: string; status: string; instance_token: string; numero: string | null }[]>();

    if (error) return Response.json({ erro: error.message }, { status: 500 });

    let conferidas = 0, corrigidas = 0, ilegiveis = 0, alheias = 0;

    for (const c of conexoes ?? []) {
        let token: string;
        try {
            token = decifrar(Buffer.from(c.instance_token.replace(/^\\x/, ''), 'hex'));
        } catch {
            ilegiveis++;
            continue;
        }

        try {
            const i = await uaz.status(token);
            conferidas++;

            // O servidor é compartilhado: se a instância deixou de ser nossa,
            // não se mexe nela nem se conclui nada sobre ela.
            if (!ehNossa(i)) { alheias++; continue; }

            const real = i.status === 'connected' ? 'conectada'
                : i.status === 'connecting' ? 'aguardando_qr'
                : 'caida';

            // Conexão que nunca foi ligada é 'desconectada', não 'caida' — cair
            // é ter estado no ar antes. A diferença importa: a tela alerta
            // número caído, e alertar quem nunca conectou é ruído.
            const destino = real === 'caida' && c.status === 'desconectada' ? 'desconectada' : real;

            if (destino !== c.status) {
                await supabase.from('conexoes_whatsapp').update({
                    status: destino,
                    ...(i.owner ? { numero: i.owner } : {}),
                    ultimo_evento_em: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }).eq('id', c.id);
                corrigidas++;
            }
        } catch (e) {
            console.error(`checar-conexoes: ${c.id}`, e);
        }
    }

    return Response.json({
        total: conexoes?.length ?? 0, conferidas, corrigidas, ilegiveis, alheias,
    });
}
