import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos } from '@/lib/derivacoes';
import { carregarPlaybook } from '@/lib/mec-dados';
import { levantarObjecoes, PERIODOS, periodoDe, type AnaliseComObjecoes, type CodigoDeObjecao } from '@/lib/objecoes';
import { VisaoObjecoes } from './visao';

export const dynamic = 'force-dynamic';

/** Os campos do payload que o levantamento lê; o payload inteiro é pesado. */
type LinhaAnalise = Omit<AnaliseComObjecoes, 'payload'> & {
    objecoes: unknown; natureza_contato: string | null; confianca_natureza: string | null; natureza_descartada: string | null;
};

/**
 * Objeções dos clientes por período ou geral (pedido do piloto, 09/10/2026).
 * O gestor vê as lojas que gerencia; supervisor e admin, a rede ou uma loja.
 * O recorte é o do relatório do vendedor (lib/objecoes.ts).
 */
export default async function ObjecoesPage({ searchParams }: { searchParams: Promise<{ periodo?: string; unidade?: string }> }) {
    const { supabase, perfil } = await contextoApp();
    if (perfil.role === 'vendedor') redirect('/dashboard');
    const params = await searchParams;
    const periodo = periodoDe(params.periodo);
    const { dias } = PERIODOS[periodo];
    const desde = dias === null ? null : diaMenos(dataHoje(), dias);

    // A RLS já limita ao escopo (zn_unidades_visiveis). O gestor também é
    // filtrado aqui pelas lojas que gerencia, como em /equipe: a RLS deixa ele
    // ler a própria unidade, que para um gestor movido pode não ser uma delas.
    const { data: lojas } = perfil.role === 'gestor'
        ? await supabase.from('gestor_unidades').select('unidades(id,nome)').eq('gestor_id', perfil.id)
            .returns<{ unidades: { id: string; nome: string } | null }[]>()
            .then((r) => ({ data: (r.data ?? []).flatMap((g) => (g.unidades ? [g.unidades] : [])).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
        : await supabase.from('unidades').select('id,nome').eq('ativa', true).order('nome').returns<{ id: string; nome: string }[]>();
    const opcoes = lojas ?? [];
    const escolhida = opcoes.find((l) => l.id === params.unidade) ?? null;
    const unidadeIds = escolhida ? [escolhida.id] : perfil.role === 'gestor' ? opcoes.map((l) => l.id) : null;
    const nomeEscopo = escolhida?.nome ?? (perfil.role === 'gestor' ? (opcoes.length === 1 ? opcoes[0].nome : 'Minhas lojas') : 'Toda a rede');

    const qAnalises = (de: number, ate: number) => {
        // Dispensada ("Não é atendimento") e bloqueada (contato interno) ficam
        // fora, como no relatório.
        let q = supabase.from('analises_conversa')
            .select('conversa_id,data_ref,user_id,tipo_conversa,objecoes:payload->objecoes,natureza_contato:payload->>natureza_contato,confianca_natureza:payload->>confianca_natureza,natureza_descartada:payload->>natureza_descartada,conversas!inner(bloqueada,dispensada_em)')
            .eq('tipo_conversa', 'negociacao').eq('conversas.bloqueada', false).is('conversas.dispensada_em', null)
            .order('id').range(de, ate);
        if (desde) q = q.gte('data_ref', desde);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q.returns<LinhaAnalise[]>();
    };
    const qCodigos = (de: number, ate: number) => {
        let q = supabase.from('mec_observacoes').select('conversa_id,data_ref,item_chave,conversas!inner(bloqueada,dispensada_em)')
            .eq('sinal', 'objecao').eq('conversas.bloqueada', false).is('conversas.dispensada_em', null)
            .order('id').range(de, ate);
        if (desde) q = q.gte('data_ref', desde);
        if (unidadeIds) q = q.in('unidade_id', unidadeIds);
        return q.returns<CodigoDeObjecao[]>();
    };
    // Quem é vendedor, ativo ou não: quem saiu no período ainda conta, e a
    // conversa de um gestor com WhatsApp conectado fica fora.
    const [linhas, codigos, pb, { data: vendedores }] = unidadeIds?.length === 0
        ? [[], [], null, { data: [] }]
        : await Promise.all([
            paginar<LinhaAnalise>(qAnalises),
            paginar<CodigoDeObjecao>(qCodigos),
            carregarPlaybook(supabase, null),
            supabase.from('profiles').select('id,nome,unidades!profiles_unidade_id_fkey(nome)').eq('role', 'vendedor')
                .returns<{ id: string; nome: string; unidades: { nome: string } | null }[]>(),
        ]);

    const analises: AnaliseComObjecoes[] = linhas.map((l) => ({
        conversa_id: l.conversa_id, data_ref: l.data_ref, user_id: l.user_id, tipo_conversa: l.tipo_conversa,
        payload: { objecoes: l.objecoes, natureza_contato: l.natureza_contato, confianca_natureza: l.confianca_natureza, natureza_descartada: l.natureza_descartada },
    }));
    const pessoas = new Map((vendedores ?? []).map((v) => [v.id, { nome: v.nome, loja: v.unidades?.nome ?? null }]));
    const levantamento = levantarObjecoes({ analises, vendedores: new Set(pessoas.keys()), codigos, rotulos: pb?.rotulos ?? new Map() });
    const variasLojas = !escolhida && (unidadeIds === null || unidadeIds.length > 1);

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/objecoes">
            <VisaoObjecoes periodo={periodo} nomeEscopo={nomeEscopo} lojas={opcoes} escolhida={escolhida} deGestor={perfil.role === 'gestor'}
                           levantamento={levantamento} pessoas={pessoas} variasLojas={variasLojas} />
        </Shell>
    );
}
