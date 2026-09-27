import { Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { diaMenos } from '@/lib/derivacoes';
import { periodoDe, type DiaMec } from '@/lib/evolucao';
import { juntarPorDia, type LinhaDia } from '@/lib/painel';
import { paginar } from '@/lib/paginar';
import { VisaoEvolucao, type NotaReferencia } from './visao';

export const dynamic = 'force-dynamic';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];
const CAMPOS = 'data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta';

// Explícito em vez de confiar só na RLS: relatorios_unidade também deixa o
// usuário ler o agregado da PRÓPRIA unidade, que para um gestor movido pode
// não ser uma das que ele gerencia.
async function unidadesGeridas(supabase: Supabase, gestorId: string): Promise<string[]> {
    const { data } = await supabase.from('gestor_unidades').select('unidade_id').eq('gestor_id', gestorId).returns<{ unidade_id: string }[]>();
    return (data ?? []).map((g) => g.unidade_id);
}

export default async function EvolucaoPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[] }> }) {
    const { supabase, perfil } = await contextoApp();
    const periodo = periodoDe((await searchParams).periodo);
    // O fechamento cobre até ontem: hoje ainda está acontecendo.
    const fim = diaMenos(dataHoje(), 1);
    // Dois períodos: o que a tela mostra e o anterior, para comparar.
    const desde = diaMenos(fim, 2 * periodo);
    const papel = perfil.role;

    // O que é "seu" muda com o papel: o vendedor vê os próprios dias; o gestor,
    // as unidades que gerencia somadas; supervisor e admin, a rede.
    const proprios = async (): Promise<LinhaDia[]> => {
        if (papel === 'vendedor') {
            const { data } = await supabase.from('relatorios_diarios').select(CAMPOS).eq('user_id', perfil.id)
                .gt('data_ref', desde).lte('data_ref', fim).returns<LinhaDia[]>();
            return data ?? [];
        }
        if (papel === 'gestor') {
            const unidades = await unidadesGeridas(supabase, perfil.id);
            return juntarPorDia(await paginar<LinhaDia>((de, ate) => supabase.from('relatorios_unidade').select(CAMPOS)
                .in('unidade_id', unidades).gt('data_ref', desde).lte('data_ref', fim)
                .order('data_ref').order('unidade_id').range(de, ate)));
        }
        const { data } = await supabase.from('relatorios_rede').select(CAMPOS).gt('data_ref', desde).lte('data_ref', fim).returns<LinhaDia[]>();
        return data ?? [];
    };
    // Com quem comparar a nota: o vendedor com a unidade, o gestor com a rede.
    const referencia = async (): Promise<NotaReferencia[]> => {
        const inicio = diaMenos(fim, periodo);
        if (papel === 'vendedor' && perfil.unidade_id) {
            const { data } = await supabase.from('relatorios_unidade').select('data_ref,score_geral').eq('unidade_id', perfil.unidade_id)
                .gt('data_ref', inicio).lte('data_ref', fim).returns<NotaReferencia[]>();
            return data ?? [];
        }
        if (papel === 'gestor') {
            const { data } = await supabase.from('relatorios_rede').select('data_ref,score_geral')
                .gt('data_ref', inicio).lte('data_ref', fim).returns<NotaReferencia[]>();
            return data ?? [];
        }
        return [];
    };
    // O MEC por dia é do vendedor: é a tela dele (Meu MEC) que o detalha.
    const mec = async (): Promise<DiaMec[]> => {
        if (papel !== 'vendedor') return [];
        const { data } = await supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa').eq('user_id', perfil.id)
            .gt('data_ref', desde).lte('data_ref', fim).returns<DiaMec[]>();
        return data ?? [];
    };

    const [linhas, ref, aderencias] = await Promise.all([proprios(), referencia(), mec()]);

    return (
        <Shell papel={papel} nome={perfil.nome} unidade={perfil.unidade} atual="/evolucao">
            <VisaoEvolucao papel={papel} periodo={periodo} fim={fim} linhas={linhas} referencia={ref} aderencias={aderencias} />
        </Shell>
    );
}
