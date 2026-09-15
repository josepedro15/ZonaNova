/**
 * Leitura de ambiente com falha alta e cedo.
 * Variável obrigatória ausente derruba o boot — melhor que um erro obscuro
 * três camadas abaixo, em produção, às 23h30 durante o fechamento do dia.
 */

function obrigatoria(nome: string): string {
    const v = process.env[nome];
    if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
    return v;
}

function opcional(nome: string, padrao = ''): string {
    return process.env[nome] ?? padrao;
}

export const SUPABASE_URL = opcional('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = opcional('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const APP_URL = opcional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

/** Só server. Ignora RLS — nunca importar num componente de cliente. */
export function serviceRoleKey(): string {
    return obrigatoria('SUPABASE_SERVICE_ROLE_KEY');
}

export function encryptionKey(): string {
    return obrigatoria('ZN_ENCRYPTION_KEY');
}

export function cronSecret(): string {
    return obrigatoria('CRON_SECRET');
}
