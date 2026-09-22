import 'server-only';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { decifrar } from '@/lib/crypto';
import { Uazapi } from '@/lib/uazapi/cliente';

/**
 * Desliga a instância de WhatsApp de um usuário, sem apagar mensagens,
 * análises ou o vínculo local. Dois chamadores: o próprio vendedor (Perfil) e
 * o admin, ao desativar alguém — quem sai da rede não pode continuar sendo
 * monitorado. O cliente UAZAPI confere o `systemName` antes de mexer.
 *
 * Devolve o número que estava ligado, ou lança se a UAZAPI recusar.
 */
export async function desligarWhatsappDe(userId: string, actorId: string): Promise<{ numero: string | null }> {
    const admin = criarClienteAdmin();
    const { data: conexao } = await admin.from('conexoes_whatsapp')
        .select('id, instance_token, numero')
        .eq('user_id', userId)
        .maybeSingle<{ id: string; instance_token: string | null; numero: string | null }>();

    if (!conexao?.instance_token) return { numero: conexao?.numero ?? null };

    const url = process.env.UAZAPI_API_URL;
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
    if (!url || !adminToken) throw new Error('UAZAPI não configurada');

    const token = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex'));
    await new Uazapi(url, adminToken).desconectar(token);
    const agora = new Date().toISOString();
    await admin.from('conexoes_whatsapp').update({ status: 'desconectada', ultimo_evento_em: agora, updated_at: agora })
        .eq('id', conexao.id);
    await admin.from('eventos_admin').insert({
        actor_id: actorId, acao: 'desconectou_whatsapp', alvo_id: conexao.id,
        detalhes: { numero: conexao.numero, usuario: userId },
    });
    return { numero: conexao.numero };
}
