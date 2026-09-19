'use server';

import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cifrar, decifrar } from '@/lib/crypto';
import { tokenDeRota } from '@/lib/uazapi/rota';
import { Uazapi } from '@/lib/uazapi/cliente';
import { APP_URL } from '@/lib/env';

export type EstadoConexao = {
    status?: 'desconectada' | 'aguardando_qr' | 'conectada' | 'caida';
    qrcode?: string;
    numero?: string | null;
    erro?: string;
};

function uazapi() {
    const url = process.env.UAZAPI_API_URL;
    const admin = process.env.UAZAPI_ADMIN_TOKEN;
    if (!url || !admin) throw new Error('UAZAPI não configurada');
    return new Uazapi(url, admin);
}

/** bytea do Postgres, no formato que o supabase-js aceita escrever e devolve. */
const paraBytea = (b: Buffer) => `\\x${b.toString('hex')}`;
const deBytea = (s: string) => Buffer.from(s.replace(/^\\x/, ''), 'hex');

/**
 * Cria (se preciso) a instância do vendedor e devolve o QR para ele ler.
 *
 * A instância é criada com `systemName = 'zonanova'` — o servidor UAZAPI é
 * compartilhado com o MetricsIA e é esse carimbo que separa os dois mundos.
 *
 * O webhook é configurado no momento da criação, com um token de rota por
 * vendedor: é o que impede alguém que descubra a URL de injetar mensagem em
 * nome de outra pessoa.
 */
export async function conectarWhatsapp(): Promise<EstadoConexao> {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada. Entre de novo.' };

    const admin = criarClienteAdmin();

    const { data: perfil } = await admin
        .from('profiles').select('id, unidade_id, status')
        .eq('id', user.id)
        .maybeSingle<{ id: string; unidade_id: string | null; status: string }>();

    // A aprovação é o portão: sem ela, não se conecta número nenhum.
    if (!perfil || perfil.status !== 'ativo' || !perfil.unidade_id) {
        return { erro: 'Seu acesso ainda não foi aprovado pelo gestor.' };
    }

    const segredo = process.env.UAZAPI_WEBHOOK_SECRET;
    if (!segredo) return { erro: 'Integração do WhatsApp não configurada.' };

    const { data: existente } = await admin
        .from('conexoes_whatsapp')
        .select('id, instance_token, instance_name, status, numero')
        .eq('user_id', user.id)
        .maybeSingle<{
            id: string; instance_token: string | null; instance_name: string | null;
            status: string; numero: string | null;
        }>();

    const uaz = uazapi();

    try {
        let conexaoId = existente?.id;
        let token = existente?.instance_token ? decifrar(deBytea(existente.instance_token)) : null;

        if (!conexaoId) {
            const { data, error } = await admin.from('conexoes_whatsapp')
                .insert({ user_id: user.id, unidade_id: perfil.unidade_id, status: 'desconectada' })
                .select('id').single<{ id: string }>();
            if (error || !data) return { erro: 'Não consegui preparar sua conexão.' };
            conexaoId = data.id;
        }

        if (!token) {
            const instancia = await uaz.criarInstancia(`zonanova-${conexaoId.slice(0, 8)}`);
            token = instancia.token;
            await admin.from('conexoes_whatsapp').update({
                instance_name: instancia.name,
                instance_token: paraBytea(cifrar(token)),
                updated_at: new Date().toISOString(),
            }).eq('id', conexaoId);
        }

        // O webhook é reapontado a CADA conexão, não só na criação. A URL fica
        // gravada na UAZAPI, e o endereço do app muda: um túnel de teste troca
        // de domínio a cada reinício, e em produção um domínio novo deixaria
        // todas as instâncias antigas falando para o endereço morto — sem erro,
        // só com as mensagens deixando de chegar.
        await uaz.configurarWebhook(
            token,
            `${APP_URL}/api/webhook/uazapi/${tokenDeRota(conexaoId, segredo)}`,
        );

        const i = await uaz.conectar(token);

        const status = i.status === 'connected' ? 'conectada' : 'aguardando_qr';
        await admin.from('conexoes_whatsapp').update({
            status,
            ...(i.owner ? { numero: i.owner } : {}),
            ultimo_evento_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', conexaoId);

        return { status, qrcode: i.qrcode || undefined, numero: i.owner ?? existente?.numero ?? null };
    } catch (e) {
        console.error('conectarWhatsapp', e);
        return { erro: 'A conexão com o WhatsApp falhou. Tente de novo em instantes.' };
    }
}

/** Status atual, para a tela reconsultar enquanto o QR está na frente. */
export async function statusConexao(): Promise<EstadoConexao> {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada.' };

    // A view não tem o token — é de propósito (ver grant por coluna no 0001).
    const { data } = await supabase
        .from('vw_conexoes_status').select('status, numero')
        .eq('user_id', user.id)
        .maybeSingle<{ status: EstadoConexao['status']; numero: string | null }>();

    return { status: data?.status ?? 'desconectada', numero: data?.numero ?? null };
}
