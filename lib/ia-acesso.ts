import 'server-only';
import { criarClienteServidor } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/**
 * A pessoa logada pode usar o Conversar com a IA? A lista mora no banco
 * (`ia_acesso`, migration 0037): hoje, só o José Pedro e o Silas. Sem a
 * função (código publicado antes da 0037) ou com erro, fica fechado.
 */
export async function iaLiberada(supabase?: Supabase): Promise<boolean> {
    const cliente = supabase ?? await criarClienteServidor();
    const { data, error } = await cliente.rpc('zn_ia_liberado');
    return !error && data === true;
}
