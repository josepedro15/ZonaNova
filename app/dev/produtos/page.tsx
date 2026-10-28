import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { VisaoProdutos } from '@/app/(app)/admin/produtos/visao';

// /admin/produtos com dados de exemplo, para conferir no browser sem login.
// Não existe em produção. `?vazio=1` mostra a lista vazia. Os botões chamam
// as ações de verdade, que sem sessão de admin não fazem nada.
const PRODUTOS = [
    { id: '00000000-0000-4000-8000-000000000001', produto: 'Porcelanato 120x120', observacao: 'A rede não trabalha grande formato', created_at: '2026-10-28T12:00:00Z', quem: 'Silas' },
    { id: '00000000-0000-4000-8000-000000000002', produto: 'Telha de vidro', observacao: null, created_at: '2026-10-28T12:05:00Z', quem: 'Silas' },
];

export default async function VitrineProdutos({ searchParams }: { searchParams: Promise<{ vazio?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const params = await searchParams;
    return (
        <Shell papel="admin" nome="Pessoa de exemplo" atual="/admin/produtos">
            <VisaoProdutos produtos={params.vazio ? [] : PRODUTOS} />
        </Shell>
    );
}
