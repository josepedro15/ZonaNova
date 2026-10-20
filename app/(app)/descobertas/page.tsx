import AppShell from '@/components/app-shell';
import { avaliarDescoberta } from '@/app/actions/operacao';
import { contextoApp, dataCurta } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { dataEmSaoPaulo } from '@/lib/analise';
import { MAX_PRATICAS, praticasDoPayload, usoDasPraticas } from '@/lib/praticas';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { nova: 'Nova', em_analise: 'Em análise', aprovada: 'Aprovada', descartada: 'Descartada' };

type Descoberta = {
    id: string; tipo: string; hipotese: string; status: string; conversas_suporte: number;
    conversao_com: number | null; conversao_sem: number | null; evidencias: unknown;
    periodo_de: string; periodo_ate: string; nota_avaliacao: string | null; avaliada_em: string | null;
};

export default async function Descobertas() {
    const { supabase, perfil } = await contextoApp();
    const { data } = await supabase.from('descobertas').select('*').order('created_at', { ascending: false }).limit(100).returns<Descoberta[]>();
    const descobertas = data ?? [];
    // As que entram na análise: as mesmas, na mesma ordem e com o mesmo teto
    // do worker (lib/pedido-analise.ts `praticasAprovadas`).
    const aprovadas = descobertas.filter((d) => d.status === 'aprovada')
        .sort((a, b) => (a.avaliada_em ?? '').localeCompare(b.avaliada_em ?? '') || a.id.localeCompare(b.id));
    const naAnalise = new Set(aprovadas.slice(0, MAX_PRATICAS).map((d) => d.id));
    const desde = aprovadas.map((d) => d.avaliada_em).filter((d): d is string => !!d).sort()[0];
    // Quantas conversas seguiram ou deixaram passar cada aprovada, desde o dia
    // da aprovação (lib/praticas.ts).
    const analises = desde
        ? await paginar<{ data_ref: string; praticas: unknown }>((de, ate) => supabase.from('analises_conversa')
            .select('data_ref,praticas:payload->praticas_aprovadas').gte('data_ref', dataEmSaoPaulo(new Date(desde)))
            .not('payload->praticas_aprovadas', 'is', null).order('id').range(de, ate))
        : [];
    const uso = usoDasPraticas(
        aprovadas.map((d) => ({ id: d.id, desde: d.avaliada_em ?? new Date().toISOString() })),
        analises.map((a) => ({ data_ref: a.data_ref, praticas: praticasDoPayload(a.praticas) })),
    );
    const emUso = Math.min(aprovadas.length, MAX_PRATICAS);

    return <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/descobertas">
        <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-7 lg:px-10 lg:pb-16 lg:pt-10">
            <h1 className="display text-[30px] font-semibold">O que o MEC ainda não diz</h1>
            <p className="mt-1 text-sm text-tinta-2">Hipóteses semanais sustentadas por conversas reais. Aprovação humana é obrigatória.</p>
            <p className="mt-3 rounded-card border border-linha bg-papel-2 p-4 text-[13px] leading-relaxed text-tinta-2">
                <strong className="text-tinta">Ao aprovar</strong>, a prática entra na análise da IA a partir das próximas conversas: em cada uma, a IA diz se o vendedor
                seguiu a prática ou deixou passar, com o trecho da conversa. A nota do atendimento e o MEC não mudam.
                {emUso > 0 && <> Hoje {emUso === 1 ? 'há 1 prática' : `há ${emUso} práticas`} na análise (até {MAX_PRATICAS}).</>}
            </p>
            <div className="mt-6 space-y-4">{descobertas.map((d) => {
                const conta = uso.get(d.id);
                return <article key={d.id} className="rounded-card border border-linha bg-superficie p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-ocre-texto">{d.tipo.replaceAll('_', ' ')}</p><h2 className="display mt-2 text-xl font-semibold">{d.hipotese}</h2></div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${d.status === 'aprovada' ? 'bg-bom-sof text-bom-texto' : 'bg-papel-2'}`}>{STATUS[d.status] ?? d.status}</span>
                    </div>
                    {d.status === 'aprovada' && (naAnalise.has(d.id)
                        ? <p className="mt-3 text-[12.5px] text-tinta-2">Na análise da IA desde <strong>{dataCurta(d.avaliada_em)}</strong>
                            {conta && conta.seguiu + conta.deixou > 0
                                ? <> · seguida em <strong>{conta.seguiu}</strong> {conta.seguiu === 1 ? 'conversa' : 'conversas'}, deixada passar em <strong>{conta.deixou}</strong></>
                                : <> · ainda sem conversa analisada com ela</>}
                        </p>
                        : <p className="mt-3 text-[12.5px] text-atencao-texto">Fora da análise: já há {MAX_PRATICAS} práticas aprovadas antes desta. Descarte uma para esta entrar.</p>)}
                    <div className="mt-4 flex gap-5 text-xs text-tinta-2"><span><strong>{d.conversas_suporte}</strong> conversas</span>{d.conversao_com != null && <span><strong>{d.conversao_com}%</strong> com</span>}{d.conversao_sem != null && <span><strong>{d.conversao_sem}%</strong> sem</span>}</div>
                    {Array.isArray(d.evidencias) && <ul className="mt-4 space-y-1 text-[12px] text-tinta-2">{(d.evidencias as string[]).map((e, i) => <li key={i}>“{e}”</li>)}</ul>}
                    <p className="mt-3 text-[10.5px] text-tinta-3">{dataCurta(d.periodo_de)}–{dataCurta(d.periodo_ate)}</p>
                    <form action={avaliarDescoberta} className="mt-4 grid gap-2 border-t border-linha pt-4 sm:grid-cols-[1fr_140px_auto]">
                        <input type="hidden" name="id" value={d.id}/>
                        <input name="nota" defaultValue={d.nota_avaliacao ?? ''} placeholder="Orientação para a IA (opcional)" aria-label="Orientação para a IA" className="rounded-[9px] border border-linha-campo px-3 py-2 text-sm"/>
                        <select name="status" defaultValue={d.status === 'nova' ? '' : d.status} required aria-label="Avaliação" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm">
                            {d.status === 'nova' && <option value="" disabled>Avaliar…</option>}
                            <option value="em_analise">Em análise</option><option value="aprovada">Aprovada</option><option value="descartada">Descartada</option>
                        </select>
                        <button className="rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Salvar</button>
                    </form>
                </article>;
            })}{!descobertas.length && <p className="rounded-card border border-linha bg-papel-2 p-8 text-center text-sm text-tinta-2">As descobertas começam depois de uma semana com volume suficiente.</p>}</div>
        </div>
    </AppShell>;
}
