import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { Treino, type Coaching } from '@/app/(app)/dashboard/secoes';
import { finalizarConsolidado } from '@/lib/consolidacao';

// O "Seu treino de hoje" com dados de exemplo, para conferir no browser sem
// login. Não existe em produção. `?antigo=1` mostra um relatório de antes do
// lastro (sem link para a conversa).
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ANALISES = [
    { erros_vendedor: ['Respondeu à reclamação de preço apenas com Kkkk, sem contornar nem oferecer condição'] },
    { erros_vendedor: ['Enviou a diferença de R$117,60 sem explicar antes que a troca depende da devolução da cuba errada'] },
    { erros_vendedor: ['Deixou sem resposta o pedido de marca de referência feito pelo cliente'] },
];
const item = (analise: number) => ({ texto: String(ANALISES[analise - 1]!.erros_vendedor[0]), analise, base: String(ANALISES[analise - 1]!.erros_vendedor[0]) });

export default async function VitrineTreino({ searchParams }: { searchParams: Promise<{ antigo?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const params = await searchParams;
    const consolidado = finalizarConsolidado({
        resumo: 'Você fechou duas vendas e respondeu rápido. Porém, deixou objeções de preço sem contorno.',
        melhorias: [{ texto: 'Contorne a objeção de preço consultando a gerência antes de responder.', analise: 1, base: ANALISES[0]!.erros_vendedor[0]! }],
        elogio: 'Conduziu a liberação dos pedidos garantindo fechamento com cordialidade.',
        desafio: 'Responda à objeção de preço com uma condição, não com riso.',
        padroes_sucesso: ['Confirmou retirada e entrega com clareza.'],
        padroes_falha: [item(1), item(2), item(3)],
        objecoes_frequentes: [],
        alertas: [{ texto: 'O pedido de marca de referência ficou sem resposta.', analise: 3, base: ANALISES[2]!.erros_vendedor[0]! }],
    }, ANALISES, [id(1), id(2), id(3)]);
    const coaching: Coaching = params.antigo ? { ...consolidado, lastro: undefined } : consolidado;
    return (
        <Shell papel="vendedor" nome="Pessoa de exemplo" atual="/dashboard">
            <div className="mx-auto max-w-[760px] px-5 py-8"><Treino coaching={coaching} /></div>
        </Shell>
    );
}
