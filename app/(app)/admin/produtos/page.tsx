import { notFound } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { contextoApp } from '@/lib/contexto-app';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { VisaoProdutos, type LinhaProduto } from './visao';

export const dynamic = 'force-dynamic';

/** A tabela é só do service role (0035): a leitura passa por aqui depois de conferir o papel. */
export default async function ProdutosSemAlternativa() {
    const { perfil } = await contextoApp();
    if (perfil.role !== 'admin') notFound();
    const { data, error } = await criarClienteAdmin().from('produtos_sem_alternativa')
        .select('id,produto,observacao,created_at,profiles!produtos_sem_alternativa_criado_por_fkey(nome)')
        .order('produto')
        .returns<(Omit<LinhaProduto, 'quem'> & { profiles: { nome: string } | null })[]>();
    if (error) throw new Error(error.message);
    const produtos = (data ?? []).map(({ profiles, ...p }) => ({ ...p, quem: profiles?.nome ?? null }));
    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/admin/produtos">
            <VisaoProdutos produtos={produtos} />
        </AppShell>
    );
}
