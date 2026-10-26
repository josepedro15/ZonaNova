import { Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos } from '@/lib/derivacoes';
import { levantarFeedbacks, type AnaliseComFeedbacks } from '@/lib/feedbacks';
import { PERIODOS, periodoDe } from '@/lib/objecoes';
import { VisaoFeedbacks } from './visao';

export const dynamic = 'force-dynamic';

/** Os campos do payload que o levantamento lê; o payload inteiro é pesado. */
type LinhaAnalise = Omit<AnaliseComFeedbacks, 'payload'> & {
    feedbacks: unknown; natureza_contato: string | null; confianca_natureza: string | null; natureza_descartada: string | null;
};

/**
 * Elogios e reclamações dos clientes por período ou geral (Silas, 22/10/2026).
 * O vendedor vê as próprias conversas; o gestor, as lojas que gerencia;
 * supervisor e admin, a rede ou uma loja. O recorte está em lib/feedbacks.ts.
 */
export default async function FeedbacksPage({ searchParams }: { searchParams: Promise<{ periodo?: string; unidade?: string }> }) {
    const { supabase, perfil } = await contextoApp();
    const params = await searchParams;
    const periodo = periodoDe(params.periodo);
    const { dias } = PERIODOS[periodo];
    const desde = dias === null ? null : diaMenos(dataHoje(), dias);
    const doVendedor = perfil.role === 'vendedor';

    // A RLS já limita ao escopo (zn_unidades_visiveis), mas deixa o vendedor
    // ler a unidade inteira: ele é filtrado aqui pelas próprias conversas. O
    // gestor, pelas lojas que gerencia, como em /objecoes.
    const { data: lojas } = doVendedor
        ? { data: [] }
        : perfil.role === 'gestor'
            ? await supabase.from('gestor_unidades').select('unidades(id,nome)').eq('gestor_id', perfil.id)
                .returns<{ unidades: { id: string; nome: string } | null }[]>()
                .then((r) => ({ data: (r.data ?? []).flatMap((g) => (g.unidades ? [g.unidades] : [])).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
            : await supabase.from('unidades').select('id,nome').eq('ativa', true).order('nome').returns<{ id: string; nome: string }[]>();
    const opcoes = lojas ?? [];
    const escolhida = opcoes.find((l) => l.id === params.unidade) ?? null;
    const unidadeIds = escolhida ? [escolhida.id] : perfil.role === 'gestor' ? opcoes.map((l) => l.id) : null;
    const nomeEscopo = doVendedor ? 'Minhas conversas'
        : escolhida?.nome ?? (perfil.role === 'gestor' ? (opcoes.length === 1 ? opcoes[0].nome : 'Minhas lojas') : 'Toda a rede');

    const qAnalises = (de: number, ate: number) => {
        // Qualquer tipo de conversa: a reclamação de entrega mora no suporte.
        // Dispensada ("Não é atendimento") e bloqueada (contato interno) ficam
        // fora, e a análise sem o campo (ainda não lida para feedback) também.
        let q = supabase.from('analises_conversa')
            .select('conversa_id,data_ref,user_id,feedbacks:payload->feedbacks,natureza_contato:payload->>natureza_contato,confianca_natureza:payload->>confianca_natureza,natureza_descartada:payload->>natureza_descartada,conversas!inner(bloqueada,dispensada_em)')
            .not('payload->feedbacks', 'is', null).eq('conversas.bloqueada', false).is('conversas.dispensada_em', null)
            .order('id').range(de, ate);
        if (desde) q = q.gte('data_ref', desde);
        if (doVendedor) q = q.eq('user_id', perfil.id);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q.returns<LinhaAnalise[]>();
    };
    // Quem é vendedor, ativo ou não: quem saiu no período ainda conta, e a
    // conversa de um gestor com WhatsApp conectado fica fora.
    const [linhas, { data: vendedores }] = unidadeIds?.length === 0
        ? [[], { data: [] }]
        : await Promise.all([
            paginar<LinhaAnalise>(qAnalises),
            supabase.from('profiles').select('id,nome,unidades!profiles_unidade_id_fkey(nome)').eq('role', 'vendedor')
                .returns<{ id: string; nome: string; unidades: { nome: string } | null }[]>(),
        ]);

    const analises: AnaliseComFeedbacks[] = linhas.map((l) => ({
        conversa_id: l.conversa_id, data_ref: l.data_ref, user_id: l.user_id,
        payload: { feedbacks: l.feedbacks, natureza_contato: l.natureza_contato, confianca_natureza: l.confianca_natureza, natureza_descartada: l.natureza_descartada },
    }));
    const pessoas = new Map((vendedores ?? []).map((v) => [v.id, { nome: v.nome, loja: v.unidades?.nome ?? null }]));
    const levantamento = levantarFeedbacks({ analises, vendedores: new Set(pessoas.keys()) });
    const variasLojas = !doVendedor && !escolhida && (unidadeIds === null || unidadeIds.length > 1);

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/feedbacks">
            <VisaoFeedbacks periodo={periodo} nomeEscopo={nomeEscopo} lojas={opcoes} escolhida={escolhida} deGestor={perfil.role === 'gestor'}
                            doVendedor={doVendedor} levantamento={levantamento} pessoas={pessoas} variasLojas={variasLojas} />
        </Shell>
    );
}
