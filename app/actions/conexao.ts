'use server';

import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cifrar, decifrar } from '@/lib/crypto';
import { tokenDeRota } from '@/lib/uazapi/rota';
import { Uazapi } from '@/lib/uazapi/cliente';
import { APP_URL } from '@/lib/env';
import { semTelefone, telefoneE164, variantesTelefone } from '@/lib/painel';
import { redirect } from 'next/navigation';
import { desligarWhatsappDe } from '@/lib/desligar';
import { revalidatePath } from 'next/cache';

export type EstadoConexao = {
    status?: 'desconectada' | 'aguardando_qr' | 'conectada' | 'caida';
    qrcode?: string;
    numero?: string | null;
    erro?: string;
    precisaAceite?: boolean;
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

    const { data: aceite } = await admin.from('aceites_privacidade').select('id')
        .eq('user_id', user.id).eq('versao', 'monitoramento-v1').maybeSingle();
    if (!aceite) return { erro: 'Confirme o aviso de monitoramento antes de conectar.', precisaAceite: true };

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
            historico_status: status === 'conectada' ? 'recebendo' : 'nao_solicitado',
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
    const [{ data }, { data: aceite }] = await Promise.all([supabase
        .from('vw_conexoes_status').select('status, numero')
        .eq('user_id', user.id)
        .maybeSingle<{ status: EstadoConexao['status']; numero: string | null }>(),
        supabase.from('aceites_privacidade').select('id').eq('user_id', user.id).eq('versao', 'monitoramento-v1').maybeSingle(),
    ]);

    return { status: data?.status ?? 'desconectada', numero: data?.numero ?? null, precisaAceite: !aceite };
}

export async function aceitarMonitoramento(): Promise<{ ok?: boolean; erro?: string }> {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada.' };
    const admin = criarClienteAdmin();
    const { error } = await admin.from('aceites_privacidade').upsert({ user_id: user.id, versao: 'monitoramento-v1' }, { onConflict: 'user_id,versao' });
    if (error) return { erro: 'Não foi possível registrar o aceite.' };
    await admin.from('eventos_admin').insert({ actor_id: user.id, acao: 'aceitou_monitoramento', alvo_id: user.id, detalhes: { versao: 'monitoramento-v1' } });
    return { ok: true };
}

/**
 * Desliga a instância sem apagar mensagens, análises ou o vínculo local.
 * O cliente UAZAPI confere o `systemName` antes da operação destrutiva.
 */
export async function desconectarWhatsapp(): Promise<EstadoConexao> {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada. Entre de novo.' };

    try {
        const { numero } = await desligarWhatsappDe(user.id, user.id);
        revalidatePath('/perfil');
        revalidatePath('/dashboard');
        return { status: 'desconectada', numero };
    } catch (e) {
        console.error('desconectarWhatsapp', e);
        return { erro: 'Não foi possível desconectar agora. Tente novamente.' };
    }
}

export async function bloquearContato(form: FormData) {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Contato `@lid` não tem número para digitar: chega pelo botão da
    // conversa, já no formato em que foi gravado.
    const bruto = String(form.get('telefone') ?? '').trim();
    const telefone = semTelefone(bruto) ? bruto.slice(0, 40) : telefoneE164(bruto).slice(0, 20);
    const motivo = String(form.get('motivo') ?? '').trim().slice(0, 300) || null;
    if (telefone.length < 8) return;
    const admin = criarClienteAdmin();
    await admin.from('contatos_bloqueados').upsert({ user_id: user.id, telefone, motivo }, { onConflict: 'user_id,telefone' });
    // O que já chegou antes do bloqueio sai das telas e da análise, mas não é
    // apagado: desbloquear devolve tudo como estava.
    await admin.from('conversas').update({ bloqueada: true })
        .eq('user_id', user.id).in('cliente_telefone', variantesTelefone(telefone));
    revalidatePath('/perfil');
    revalidatePath('/dashboard');
    revalidatePath('/conversas');
    // Vindo da própria conversa, ela acabou de sumir: volta para a lista.
    if (form.get('voltar') === 'conversas') redirect('/conversas');
}

export async function desbloquearContato(form: FormData) {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const id = String(form.get('id') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    const admin = criarClienteAdmin();
    const { data: removido } = await admin.from('contatos_bloqueados').delete()
        .eq('id', id).eq('user_id', user.id).select('telefone').maybeSingle<{ telefone: string }>();
    if (removido) {
        // Outro bloqueio pode cobrir o mesmo número (com e sem o nono dígito):
        // o que ele cobre continua bloqueado.
        const { data: restantes } = await admin.from('contatos_bloqueados').select('telefone').eq('user_id', user.id)
            .returns<{ telefone: string }[]>();
        const aindaCobertos = new Set((restantes ?? []).flatMap((r) => variantesTelefone(r.telefone)));
        const liberar = variantesTelefone(removido.telefone).filter((t) => !aindaCobertos.has(t));
        if (liberar.length) {
            await admin.from('conversas').update({ bloqueada: false })
                .eq('user_id', user.id).in('cliente_telefone', liberar);
        }
    }
    revalidatePath('/perfil');
    revalidatePath('/dashboard');
    revalidatePath('/conversas');
}
