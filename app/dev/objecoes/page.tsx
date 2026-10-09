import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { VisaoObjecoes } from '@/app/(app)/objecoes/visao';
import { levantarObjecoes, periodoDe, type AnaliseComObjecoes } from '@/lib/objecoes';

// A aba Objeções com dados de exemplo, para conferir no browser sem login.
// Não existe em produção. `?periodo=7|30|90|geral`, `?vazio=1`, `?gestor=1`.
const FALAS = [
    ['Preço alto'], ['Produto indisponível'], ['produto não disponível', 'frete caro'], ['Preço maior que o concorrente'],
    ['pedido de desconto'], ['Preço alto', 'condições de parcelamento'], ['Atraso na entrega'], [], [], ['frete alto'],
    ['Cliente esperava valor menor'], ['Produto indisponível'], [], ['quantidade mínima para compra da brita rosa'], ['Preço alto'],
    ['cor não adequada'], [], ['Já comprei em outra loja'], ['necessidade de parcelamento'], [],
];
const VENDEDORES = [['v1', 'Thamires ZN', 'Xangri-Lá'], ['v2', 'Rafael Muller', 'Capão da Canoa'], ['v3', 'Ana Paula Rocha', 'Capão da Canoa']] as const;

export default async function VitrineObjecoes({ searchParams }: { searchParams: Promise<{ periodo?: string; vazio?: string; gestor?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const params = await searchParams;
    const analises: AnaliseComObjecoes[] = params.vazio ? [] : FALAS.map((objecoes, i) => ({
        conversa_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, data_ref: `2026-10-${String(9 - (i % 5)).padStart(2, '0')}`,
        user_id: VENDEDORES[i % 3][0], tipo_conversa: 'negociacao', payload: { objecoes },
    }));
    const pessoas = new Map(VENDEDORES.map(([id, nome, loja]) => [id, { nome, loja }]));
    const lojas = [{ id: 'l1', nome: 'Capão da Canoa' }, { id: 'l2', nome: 'Xangri-Lá' }];
    const gestor = !!params.gestor;
    return (
        <Shell papel={gestor ? 'gestor' : 'admin'} nome="Pessoa de exemplo" atual="/objecoes">
            <VisaoObjecoes periodo={periodoDe(params.periodo)} nomeEscopo={gestor ? 'Xangri-Lá' : 'Toda a rede'} lojas={gestor ? [] : lojas} escolhida={null}
                           deGestor={gestor} levantamento={levantarObjecoes({ analises, vendedores: new Set(pessoas.keys()), codigos: [], rotulos: new Map() })}
                           pessoas={pessoas} variasLojas={!gestor} base="/dev/objecoes" />
        </Shell>
    );
}
