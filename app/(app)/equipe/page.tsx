import { Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { VisaoUnidade } from './visao-unidade';

export const dynamic = 'force-dynamic';

// Explícito em vez de confiar só na RLS: relatorios_unidade também deixa o
// usuário ler o agregado da PRÓPRIA unidade, que para um gestor movido pode
// não ser uma das que ele gerencia.
async function unidadesGeridas(supabase: Awaited<ReturnType<typeof contextoApp>>['supabase'], gestorId: string): Promise<string[]> {
    const { data } = await supabase.from('gestor_unidades').select('unidade_id').eq('gestor_id', gestorId).returns<{ unidade_id: string }[]>();
    return (data ?? []).map((g) => g.unidade_id);
}

export default async function EquipePage() {
    const { supabase, perfil } = await contextoApp();
    // Gestor pode cuidar de mais de uma loja: a RLS entrega as que ele
    // gerencia (gestor_unidades), não a do próprio perfil — que para um
    // gestor movido pode não ser nenhuma das que ele gerencia agora.
    // Supervisor e admin veem o escopo da RLS, como antes.
    const unidadeIds = perfil.role === 'gestor' ? await unidadesGeridas(supabase, perfil.id) : null;
    const { count: pendentes } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    const nomeUnidade = perfil.role !== 'gestor'
        ? (perfil.unidade ?? 'Todas as lojas')
        : unidadeIds && unidadeIds.length === 1
            ? (perfil.unidade ?? 'Minhas lojas')
            : `${unidadeIds?.length ?? 0} lojas`;
    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/equipe" pendentes={pendentes ?? 0}>
            <VisaoUnidade supabase={supabase} unidadeIds={unidadeIds} nomeUnidade={nomeUnidade} titulo="Minha equipe" />
        </Shell>
    );
}
