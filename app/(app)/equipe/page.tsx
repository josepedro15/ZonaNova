import { Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { VisaoUnidade } from './visao-unidade';

export const dynamic = 'force-dynamic';

export default async function EquipePage() {
    const { supabase, perfil } = await contextoApp();
    // Gestor vê a própria loja. Supervisor e admin veem o escopo da RLS, como antes.
    const unidadeId = perfil.role === 'gestor' ? perfil.unidade_id : null;
    const { count: pendentes } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/equipe" pendentes={pendentes ?? 0}>
            <VisaoUnidade supabase={supabase} unidadeId={unidadeId} nomeUnidade={perfil.unidade ?? 'Todas as lojas'} titulo="Minha equipe" />
        </Shell>
    );
}
