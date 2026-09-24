import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { VisaoUnidade } from '../../equipe/visao-unidade';

export const dynamic = 'force-dynamic';

export default async function UnidadePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { supabase, perfil } = await contextoApp();
    const { data: u } = await supabase.from('unidades').select('id,nome,cidade,uf').eq('id', id)
        .maybeSingle<{ id: string; nome: string; cidade: string | null; uf: string | null }>();
    if (!u) notFound();
    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/unidades">
            <VisaoUnidade supabase={supabase} unidadeIds={[u.id]} nomeUnidade={[u.cidade, u.uf].filter(Boolean).join(' · ') || 'Loja'}
                          titulo={u.nome} voltar={{ href: '/unidades', rotulo: 'Rede' }} />
        </Shell>
    );
}
