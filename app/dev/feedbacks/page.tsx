import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { VisaoFeedbacks } from '@/app/(app)/feedbacks/visao';
import { levantarFeedbacks, type AnaliseComFeedbacks } from '@/lib/feedbacks';
import { periodoDe } from '@/lib/objecoes';

// A aba Feedbacks com dados de exemplo, para conferir no browser sem login.
// Não existe em produção. `?periodo=7|30|90|geral`, `?vazio=1`, `?gestor=1`, `?vendedor=1`.
const n = (trecho: string, assunto = 'entrega_frete') => ({ polaridade: 'negativo', assunto, trecho });
const p = (trecho: string, assunto = 'atendimento') => ({ polaridade: 'positivo', assunto, trecho });
const FALAS = [
    [n('A entrega atrasou de novo, já é a segunda vez')], [p('Chegou tudo certinho, muito obrigada!', 'entrega_frete')], [],
    [n('O frete ficou mais caro que o próprio produto')], [p('A Thamires é muito atenciosa, sempre me ajuda')], [n('Mandei mensagem ontem e ninguém respondeu', 'atendimento')],
    [], [n('Veio uma telha quebrada', 'produto'), n('e o motorista nem avisou que vinha')], [p('Entregaram no mesmo dia, show', 'entrega_frete')], [],
    [n('O piso veio com tonalidade diferente', 'produto')], [p('Melhor preço que achei na região', 'preco')], [], [n('Não aceitaram o cartão na entrega', 'pagamento')],
    [p('Atendimento nota 10')], [], [n('Até agora não chegou', 'entrega_frete')], [p('Gostei muito da tinta, rendeu bem', 'produto')], [], [n('Demoraram 3 dias pra me dar o orçamento', 'atendimento')],
];
const VENDEDORES = [['v1', 'Thamires ZN', 'Xangri-Lá'], ['v2', 'Rafael Muller', 'Capão da Canoa'], ['v3', 'Ana Paula Rocha', 'Capão da Canoa']] as const;

export default async function VitrineFeedbacks({ searchParams }: { searchParams: Promise<{ periodo?: string; vazio?: string; gestor?: string; vendedor?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const params = await searchParams;
    const vendedor = !!params.vendedor;
    const gestor = !vendedor && !!params.gestor;
    const analises: AnaliseComFeedbacks[] = params.vazio ? [] : FALAS.map((feedbacks, i) => ({
        conversa_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, data_ref: `2026-10-${String(21 - (i % 7)).padStart(2, '0')}`,
        user_id: VENDEDORES[i % 3][0], payload: { feedbacks },
    })).filter((a) => !vendedor || a.user_id === 'v1');
    const pessoas = new Map(VENDEDORES.map(([id, nome, loja]) => [id, { nome, loja }]));
    const lojas = [{ id: 'l1', nome: 'Capão da Canoa' }, { id: 'l2', nome: 'Xangri-Lá' }];
    return (
        <Shell papel={vendedor ? 'vendedor' : gestor ? 'gestor' : 'admin'} nome="Pessoa de exemplo" atual="/feedbacks">
            <VisaoFeedbacks periodo={periodoDe(params.periodo)} nomeEscopo={vendedor ? 'Minhas conversas' : gestor ? 'Xangri-Lá' : 'Toda a rede'}
                            lojas={gestor || vendedor ? [] : lojas} escolhida={null} deGestor={gestor} doVendedor={vendedor}
                            levantamento={levantarFeedbacks({ analises, vendedores: new Set(pessoas.keys()) })}
                            pessoas={pessoas} variasLojas={!gestor && !vendedor} base="/dev/feedbacks" />
        </Shell>
    );
}
