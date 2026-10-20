import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { VisaoEvolucao } from '@/app/(app)/evolucao/visao';
import { CompararVendedores } from '@/app/(app)/evolucao/secoes';
import { EscolherVendedor } from '@/app/(app)/evolucao/escolher-vendedor';
import { diaMenos } from '@/lib/derivacoes';
import { compararVendedores, diaDaSemana, periodoDe, type DiaMec } from '@/lib/evolucao';
import { diasAte, type LinhaDia } from '@/lib/painel';

// A tela Evolução com dados de exemplo, para conferir no browser sem login.
// Não existe em produção. `?periodo=7|30|90`, `?vazio=1`; `?papel=gestor` mostra a
// visão da equipe com a comparação, e `?papel=gestor&vendedor=v2`, um vendedor.
const FIM = '2026-09-26';

/** Pseudoaleatório estável: a mesma página sempre desenha o mesmo gráfico. */
const ruido = (i: number, sal: number) => {
    const x = Math.sin(i * 12.9898 + sal * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

function exemplo(): { linhas: LinhaDia[]; referencia: { data_ref: string; score_geral: number }[]; aderencias: DiaMec[] } {
    const dias = diasAte(FIM, 180);
    const linhas: LinhaDia[] = [];
    const referencia: { data_ref: string; score_geral: number }[] = [];
    const aderencias: DiaMec[] = [];
    dias.forEach((dia, i) => {
        const tendencia = 52 + (i / dias.length) * 22;
        referencia.push({ data_ref: dia, score_geral: Math.round(58 + (i / dias.length) * 7 + ruido(i, 3) * 2) });
        if (diaDaSemana(dia) === 0 || dia === '2026-09-07') return; // domingo e feriado: sem relatório
        const semNota = ruido(i, 1) < 0.04;
        const leads = Math.round(6 + ruido(i, 2) * 9);
        const score = semNota ? null : Math.round(Math.min(98, tendencia + (ruido(i, 4) - 0.5) * 18 - (diaDaSemana(dia) === 3 ? 7 : 0)));
        linhas.push({
            data_ref: dia, score_geral: score, leads_atendidos: semNota ? 2 : leads,
            conversoes_confirmadas: semNota ? 0 : Math.round(leads * (0.08 + ruido(i, 5) * 0.14)),
            oportunidades_perdidas: semNota ? 0 : Math.round(ruido(i, 6) * 2.4),
            tempo_medio_resposta_s: Math.round(420 - (i / dias.length) * 200 + ruido(i, 7) * 120),
            taxa_resposta: Math.round(88 + ruido(i, 8) * 10),
        });
        const progresso = i / dias.length;
        aderencias.push({
            data_ref: dia, aderencia_geral: Math.round(38 + progresso * 16 + ruido(i, 9) * 6),
            por_etapa: {
                acolhida: Math.round(84 + ruido(i, 10) * 8), sondagem: Math.round(40 + progresso * 26 + ruido(i, 11) * 8),
                solucao_completa: Math.round(40 - progresso * 8 + ruido(i, 12) * 6), contorno_objecoes: Math.round(44 + ruido(i, 13) * 6),
                estrategia_preco: Math.round(50 + ruido(i, 14) * 8), fechamento: Math.round(46 + progresso * 12 + ruido(i, 15) * 6),
                acompanhamento: null,
            },
        });
    });
    return { linhas, referencia, aderencias };
}

const EQUIPE = [
    { id: 'v1', nome: 'Ana Paula Souza', unidade: 'Loja Centro', ajuste: 6 },
    { id: 'v2', nome: 'Rafael Muller', unidade: 'Loja Centro', ajuste: -4 },
    { id: 'v3', nome: 'Mirian Costa', unidade: 'Loja Norte', ajuste: 12 },
    { id: 'v4', nome: 'Nilso Pereira', unidade: 'Loja Norte', ajuste: -15 },
    { id: 'v5', nome: 'Taís Gomes', unidade: 'Loja Norte', ajuste: null },
];

function exemploDaEquipe(linhas: LinhaDia[]): (LinhaDia & { user_id: string })[] {
    return EQUIPE.flatMap((v, k) => (v.ajuste === null ? [] : linhas.map((l, i) => ({
        ...l, user_id: v.id,
        score_geral: l.score_geral === null ? null : Math.max(0, Math.min(100, Number(l.score_geral) + v.ajuste + Math.round((ruido(i, 20 + k) - 0.5) * 10))),
        leads_atendidos: Math.round(Number(l.leads_atendidos) * (0.6 + k * 0.2)),
    }))));
}

export default async function VitrineEvolucao({ searchParams }: { searchParams: Promise<{ periodo?: string; vazio?: string; papel?: string; vendedor?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const params = await searchParams;
    const periodo = periodoDe(params.periodo);
    const { linhas, referencia, aderencias } = params.vazio ? { linhas: [], referencia: [], aderencias: [] } : exemplo();
    if (params.papel === 'gestor') {
        const dias = exemploDaEquipe(linhas);
        const alvo = EQUIPE.find((v) => v.id === params.vendedor) ?? null;
        const seletor = <EscolherVendedor vendedores={EQUIPE} atual={alvo?.id ?? null} periodo={periodo} base="/dev/evolucao?papel=gestor" />;
        return (
            <Shell papel="gestor" nome="Gestor de exemplo" unidade="Loja Centro" atual="/evolucao">
                {alvo
                    ? <VisaoEvolucao papel="gestor" periodo={periodo} fim={FIM} base="/dev/evolucao" manter={{ papel: 'gestor' }} alvo={alvo} seletor={seletor}
                                     linhas={dias.filter((d) => d.user_id === alvo.id)} aderencias={aderencias}
                                     referencia={referencia.filter((r) => r.data_ref > diaMenos(FIM, periodo))} />
                    : <VisaoEvolucao papel="gestor" periodo={periodo} fim={FIM} base="/dev/evolucao" manter={{ papel: 'gestor' }} linhas={linhas} aderencias={[]} seletor={seletor}
                                     referencia={referencia.filter((r) => r.data_ref > diaMenos(FIM, periodo))}
                                     equipe={<CompararVendedores linhas={compararVendedores(dias, EQUIPE, FIM, periodo)} periodo={periodo} comLoja base="/dev/evolucao?papel=gestor" />} />}
            </Shell>
        );
    }
    return (
        <Shell papel="vendedor" nome="Vendedor de exemplo" unidade="Unidade de exemplo" atual="/evolucao">
            <VisaoEvolucao papel="vendedor" periodo={periodo} fim={FIM} base="/dev/evolucao" linhas={linhas} aderencias={aderencias}
                           referencia={referencia.filter((r) => r.data_ref > diaMenos(FIM, periodo))} />
        </Shell>
    );
}
