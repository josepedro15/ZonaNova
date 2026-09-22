import 'server-only';
import { headers } from 'next/headers';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export type Regra = { chave: string; max: number; janelaSegundos: number };

/**
 * O IP de quem chamou. Na Vercel, o primeiro de `x-forwarded-for` é o cliente
 * (a plataforma sobrescreve o cabeçalho, o navegador não consegue forjá-lo).
 */
export async function ipDoCliente(): Promise<string> {
    const h = await headers();
    return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'desconhecido').trim();
}

/**
 * Consome uma tentativa em cada regra e diz se todas ainda cabem. Contado no
 * banco (migration 0017) porque é o único estado que todas as instâncias da
 * Vercel dividem.
 *
 * Falha aberta: se o banco não responder, deixa passar. Um problema no
 * contador não pode derrubar o login da rede inteira — o limite é contra
 * abuso, não a porta da frente.
 */
export async function dentroDoLimite(regras: Regra[]): Promise<boolean> {
    const admin = criarClienteAdmin();
    let cabe = true;
    for (const r of regras) {
        const { data, error } = await admin.rpc('zn_consumir_limite', {
            p_chave: r.chave, p_max: r.max, p_janela_segundos: r.janelaSegundos,
        });
        if (error) { console.error('limite: contador indisponível', error.message); continue; }
        if (data === false) cabe = false;
    }
    return cabe;
}
