import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * Cliente de servidor com a sessão do utilizador. Sujeito a RLS.
 * Use este em toda leitura de dado de negócio — mesmo no servidor. A RLS é a
 * barreira de verdade; o middleware só melhora a navegação.
 */
export async function criarClienteServidor() {
    const cookieStore = await cookies();
    return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (lista) => {
                try {
                    lista.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options));
                } catch {
                    // Chamado de um Server Component: o middleware renova a sessão.
                }
            },
        },
    });
}
