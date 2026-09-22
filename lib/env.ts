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

/**
 * O endereço público do app: vai no webhook gravado na UAZAPI e nos links de
 * recuperação de senha. O antigo fallback de localhost, em produção, gravava
 * um webhook apontando para lugar nenhum — em silêncio.
 *
 * Ordem: a variável do projeto; na Vercel, o domínio de produção que a
 * própria plataforma informa; fora dela (dev), localhost. Em produção sem
 * nenhuma das duas, falha alto.
 */
function appUrl(): string {
    const explicita = process.env.NEXT_PUBLIC_APP_URL;
    if (explicita) return explicita;
    const daVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (daVercel) return `https://${daVercel}`;
    if (process.env.VERCEL_ENV === 'production') return obrigatoria('NEXT_PUBLIC_APP_URL');
    return 'http://localhost:3000';
}

export const APP_URL = appUrl();

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
