import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, serviceRoleKey } from '@/lib/env';

/**
 * Cliente com service role: IGNORA RLS.
 *
 * Só para o que a RLS proíbe de propósito — aprovar cadastro, mudar papel,
 * gravar conversa vinda do webhook, rodar a fila. Toda função que o usa tem de
 * conferir a autorização em código E gravar em eventos_admin.
 */
export function criarClienteAdmin() {
    return createClient(SUPABASE_URL, serviceRoleKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
