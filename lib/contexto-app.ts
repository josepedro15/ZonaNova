import 'server-only';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';

export type ContextoApp = {
    id: string;
    nome: string;
    email: string;
    role: 'vendedor' | 'gestor' | 'supervisor' | 'admin';
    unidade_id: string | null;
    unidade: string | null;
};

export async function contextoApp(): Promise<{ supabase: Awaited<ReturnType<typeof criarClienteServidor>>; perfil: ContextoApp }> {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    const { data } = await supabase.from('profiles')
        .select('id,nome,email,role,unidade_id,unidades!profiles_unidade_id_fkey(nome)')
        .eq('id', user.id).single<{
            id: string; nome: string; email: string; role: ContextoApp['role']; unidade_id: string | null; unidades: { nome: string } | null;
        }>();
    if (!data) redirect('/login');
    return { supabase, perfil: { ...data, unidade: data.unidades?.nome ?? null } };
}

export const dataHoje = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function dataCurta(data: string | null | undefined): string {
    if (!data) return '—';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' }).format(new Date(data));
}

export function horaCurta(data: string | null | undefined): string {
    if (!data) return '—';
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(data));
}
