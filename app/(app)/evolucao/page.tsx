import { Shell } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { diaMenos } from '@/lib/derivacoes';
import { compararVendedores, periodoDe, type DiaMec, type DiaVendedor, type Vendedor } from '@/lib/evolucao';
import { juntarPorDia, type LinhaDia } from '@/lib/painel';
import { paginar } from '@/lib/paginar';
import { CompararVendedores } from './secoes';
import { EscolherVendedor } from './escolher-vendedor';
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

type Pessoa = { id: string; nome: string; unidade_id: string | null; unidades: { nome: string } | null };

/**
 * Os vendedores ativos que a pessoa acompanha: os das unidades que o gestor
 * gerencia; para supervisor e admin, os da rede (o escopo da RLS).
 */
async function equipeDe(supabase: Supabase, unidades: string[] | null): Promise<(Vendedor & { unidade_id: string | null })[]> {
    let q = supabase.from('profiles').select('id,nome,unidade_id,unidades!profiles_unidade_id_fkey(nome)')
        .eq('role', 'vendedor').eq('status', 'ativo').order('nome');
    if (unidades) q = q.in('unidade_id', unidades);
    const { data } = await q.returns<Pessoa[]>();
    return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, unidade_id: p.unidade_id, unidade: p.unidades?.nome ?? null }));
}

export default async function EvolucaoPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[]; vendedor?: string | string[] }> }) {
    const { supabase, perfil } = await contextoApp();
    const params = await searchParams;
    const periodo = periodoDe(params.periodo);
    // O fechamento cobre até ontem: hoje ainda está acontecendo.
    const fim = diaMenos(dataHoje(), 1);
    // Dois períodos: o que a tela mostra e o anterior, para comparar.
    const desde = diaMenos(fim, 2 * periodo);
    const papel = perfil.role;

    // Gestor, supervisor e admin escolhem de quem é a evolução: a equipe toda
    // (o agregado de sempre, com a comparação) ou um vendedor, que vê a mesma
    // tela que ele vê (Silas, 16/10). Vendedor fora da equipe cai na equipe toda.
    const gestor = papel === 'gestor' ? await unidadesGeridas(supabase, perfil.id) : null;
    const equipe = papel === 'vendedor' ? [] : await equipeDe(supabase, gestor);
    const pedido = Array.isArray(params.vendedor) ? params.vendedor[0] : params.vendedor;
    const alvo = equipe.find((v) => v.id === pedido) ?? null;

    if (alvo) {
        const inicio = diaMenos(fim, periodo);
        const [{ data: linhas }, { data: ref }, { data: aderencias }] = await Promise.all([
            supabase.from('relatorios_diarios').select(CAMPOS).eq('user_id', alvo.id)
                .gt('data_ref', desde).lte('data_ref', fim).returns<LinhaDia[]>(),
            alvo.unidade_id
                ? supabase.from('relatorios_unidade').select('data_ref,score_geral').eq('unidade_id', alvo.unidade_id)
                    .gt('data_ref', inicio).lte('data_ref', fim).returns<NotaReferencia[]>()
                : Promise.resolve({ data: [] as NotaReferencia[] }),
            supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa').eq('user_id', alvo.id)
                .gt('data_ref', desde).lte('data_ref', fim).returns<DiaMec[]>(),
        ]);
        return (
            <Shell papel={papel} nome={perfil.nome} unidade={perfil.unidade} atual="/evolucao">
                <VisaoEvolucao papel={papel} periodo={periodo} fim={fim} linhas={linhas ?? []} referencia={ref ?? []} aderencias={aderencias ?? []}
                               alvo={alvo} seletor={<EscolherVendedor vendedores={equipe} atual={alvo.id} periodo={periodo} />} />
            </Shell>
        );
    }

    // O que é "seu" muda com o papel: o vendedor vê os próprios dias; o gestor,
    // as unidades que gerencia somadas; supervisor e admin, a rede.
    const proprios = async (): Promise<LinhaDia[]> => {
        if (papel === 'vendedor') {
            const { data } = await supabase.from('relatorios_diarios').select(CAMPOS).eq('user_id', perfil.id)
                .gt('data_ref', desde).lte('data_ref', fim).returns<LinhaDia[]>();
            return data ?? [];
        }
        if (papel === 'gestor') {
            const unidades = gestor ?? [];
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

    // A equipe lado a lado: os dias de cada vendedor no período e no anterior.
    const daEquipe = async (): Promise<DiaVendedor[]> => {
        if (!equipe.length) return [];
        return paginar<DiaVendedor>((de, ate) => supabase.from('relatorios_diarios').select(`user_id,${CAMPOS}`)
            .in('user_id', equipe.map((v) => v.id)).gt('data_ref', desde).lte('data_ref', fim)
            .order('data_ref').order('user_id').range(de, ate));
    };

    const [linhas, ref, aderencias, diasEquipe] = await Promise.all([proprios(), referencia(), mec(), daEquipe()]);
    const comLoja = new Set(equipe.map((v) => v.unidade_id)).size > 1;

    return (
        <Shell papel={papel} nome={perfil.nome} unidade={perfil.unidade} atual="/evolucao">
            <VisaoEvolucao papel={papel} periodo={periodo} fim={fim} linhas={linhas} referencia={ref} aderencias={aderencias}
                           seletor={equipe.length ? <EscolherVendedor vendedores={equipe} atual={null} periodo={periodo} /> : undefined}
                           equipe={papel === 'vendedor' ? undefined
                               : <CompararVendedores linhas={compararVendedores(diasEquipe, equipe, fim, periodo)} periodo={periodo} comLoja={comLoja} />} />
        </Shell>
    );
}
