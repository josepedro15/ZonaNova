import { CabecalhoPagina, Cartao, Pagina, SELO, Shell, Tabela, TEXTO } from '@/components/ui';
import { contextoApp, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { diaMenos, ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { tomFaixa, type Tom } from '@/lib/visual';
import { chavesDoTipo, chaveConversaDia, porConversaDia, resumirObservacoes, type LinhaObservacao } from '@/lib/mec';
import { carregarPlaybook } from '@/lib/mec-dados';

export const dynamic = 'force-dynamic';

const JANELA = 14;
type Dia = { user_id: string; data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };
const VEREDITO: Record<string, Tom> = { pendente: 'atencao', procedente: 'bom', improcedente: 'neutro' };

function Celula({ pct }: { pct: number | null | undefined }) {
    if (pct === null || pct === undefined) return <span className="text-tinta-3">—</span>;
    const tom = tomFaixa(pct, 35, 60);
    return <span className={`num font-semibold ${tom === 'azul' ? 'text-tinta' : TEXTO[tom]}`}>{pct}%</span>;
}

export default async function MecEquipe() {
    const { supabase, perfil } = await contextoApp();
    const desde = diaMenos(dataHoje(), JANELA);
    const [{ data: pessoas }, { data: dias }, { data: contestacoes }, observacoes, sondagens, pb] = await Promise.all([
        supabase.from('profiles').select('id,nome').eq('role', 'vendedor').eq('status', 'ativo').order('nome').returns<{ id: string; nome: string }[]>(),
        supabase.from('aderencia_diaria').select('user_id,data_ref,aderencia_geral,por_etapa').order('data_ref', { ascending: false }).limit(500).returns<Dia[]>(),
        supabase.from('aderencia_contestacoes').select('id,motivo,veredito,created_at,aderencia_conversa(etapa,conversa_id,conversas(cliente_nome))')
            .order('created_at', { ascending: false }).limit(30),
        paginar<LinhaObservacao & { user_id: string; data_ref: string }>((de, ate) => supabase.from('mec_observacoes')
            .select('user_id,conversa_id,data_ref,etapa,sinal,item_chave,valor,detalhe,trecho,conversas!inner(bloqueada)')
            .eq('sinal', 'sondagem_item').eq('conversas.bloqueada', false).gte('data_ref', desde).order('id').range(de, ate)),
        paginar<{ conversa_id: string; data_ref: string }>((de, ate) => supabase.from('aderencia_conversa').select('conversa_id,data_ref,conversas!inner(bloqueada)')
            .eq('etapa', 'sondagem').eq('aplicavel', true).eq('conversas.bloqueada', false).gte('data_ref', desde).order('id').range(de, ate)),
        carregarPlaybook(supabase, null),
    ]);
    const ultimo = new Map<string, Dia>();
    for (const d of dias ?? []) if (!ultimo.has(d.user_id)) ultimo.set(d.user_id, d);
    const equipe = pessoas ?? [];
    // Unidade do resumo = (conversa, dia): a janela tem uma análise por conversa por dia.
    const aplicavel = new Set(sondagens.map((s) => chaveConversaDia(s.conversa_id, s.data_ref)));
    const porDia = porConversaDia(observacoes);
    const informacoes = pb ? chavesDoTipo(pb.itens, 'informacao') : [];
    const porVendedor = new Map(equipe.map((p) => [p.id, resumirObservacoes(porDia.filter((o) => o.user_id === p.id), aplicavel)]));
    const daEquipe = resumirObservacoes(porDia, aplicavel);
    const colunaFraca = Object.entries(daEquipe.detalhe.sondagem_por_item).sort((a, b) => a[1] - b[1])[0]?.[0];
    const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/equipe/mec">
            <Pagina>
                <CabecalhoPagina titulo="Aderência ao MEC"
                                 sobre="Cada % considera só etapas aplicáveis e verificáveis; “—” é o que não se aplicou, não nota ruim" />

                <Tabela titulo="Por etapa" acao={<span className="text-[12.5px] text-tinta-3">último dia de cada vendedor</span>}
                        vazio="Nenhum vendedor com MEC ainda."
                        colunas={['Vendedor', ...ETAPAS.map((e) => NOMES_ETAPA[e]), 'Geral']}
                        grade={`minmax(0,1.6fr) repeat(${ETAPAS.length + 1},minmax(0,0.8fr))`} larguraMin={980}
                        linhas={equipe.map((p) => {
                            const d = ultimo.get(p.id);
                            return {
                                chave: p.id, href: `/equipe/${p.id}`, atenuada: !d,
                                celulas: [
                                    <span key="n" className="font-semibold">{p.nome}{d && <span className="block text-xs font-normal text-tinta-3">{diaMes(d.data_ref)}</span>}</span>,
                                    ...ETAPAS.map((e) => <Celula key={e} pct={d?.por_etapa?.[e] == null ? null : Math.round(Number(d.por_etapa[e]))} />),
                                    <Celula key="g" pct={d?.aderencia_geral == null ? null : Math.round(Number(d.aderencia_geral))} />,
                                ],
                            };
                        })} />

                <Tabela titulo="Sondagem por informação"
                        acao={<span className="text-[12.5px] text-tinta-3">últimos {JANELA} dias · coluna fraca = treino coletivo; linha fraca = conversa individual</span>}
                        vazio="Ainda sem o detalhe da sondagem nas negociações."
                        colunas={['Vendedor', ...informacoes.map((c) => pb?.rotulos.get(c) ?? c), 'Média']}
                        grade={`minmax(0,1.6fr) repeat(${informacoes.length + 1},minmax(0,0.9fr))`} larguraMin={1060}
                        linhas={daEquipe.detalhe.conversas_com_sondagem === 0 ? [] : equipe.map((p) => {
                            const r = porVendedor.get(p.id)!;
                            return {
                                chave: p.id, atenuada: r.detalhe.conversas_com_sondagem === 0,
                                celulas: [
                                    <span key="n" className="font-semibold">{p.nome}<span className="block text-xs font-normal text-tinta-3">{r.detalhe.conversas_com_sondagem} conversas</span></span>,
                                    ...informacoes.map((c) => (
                                        <span key={c} className={c === colunaFraca ? `rounded px-1.5 py-0.5 ${SELO.atencao}` : ''}>
                                            <Celula pct={r.detalhe.conversas_com_sondagem ? r.detalhe.sondagem_por_item[c] ?? 0 : null} />
                                        </span>
                                    )),
                                    <span key="m" className="num font-semibold">{r.sondagem_itens === null ? '—' : `${String(r.sondagem_itens).replace('.', ',')} de ${informacoes.length}`}</span>,
                                ],
                            };
                        })} />
                {colunaFraca && (
                    <p className="-mt-2 text-[12.5px] text-tinta-2">
                        Informação menos capturada pela equipe: <strong>{pb?.rotulos.get(colunaFraca) ?? colunaFraca}</strong> ({daEquipe.detalhe.sondagem_por_item[colunaFraca]}%).
                    </p>
                )}

                <Cartao className="flex flex-col gap-2">
                    <h2 className="display text-lg font-bold">Contestações da equipe</h2>
                    <p className="text-[12.5px] text-tinta-3">Quem revisa é o supervisor. Aqui você acompanha o veredito.</p>
                    {(contestacoes ?? []).length === 0 ? <p className="py-2 text-sm text-tinta-3">Nenhuma contestação.</p> : (
                        <ul className="flex flex-col">
                            {(contestacoes ?? []).map((c) => {
                                const a = c.aderencia_conversa as unknown as { etapa: string; conversa_id: string; conversas: { cliente_nome: string | null } | null } | null;
                                const veredito = String(c.veredito);
                                return (
                                    <li key={c.id as string} className="border-t border-linha-2">
                                        <a href={a ? `/conversas/${a.conversa_id}` : '#'} className="flex min-h-11 items-start justify-between gap-3 py-2.5 text-[13px]">
                                            <span>
                                                <strong>{a ? NOMES_ETAPA[a.etapa as keyof typeof NOMES_ETAPA] ?? a.etapa : 'Etapa'}</strong>
                                                {a?.conversas?.cliente_nome ? ` · ${a.conversas.cliente_nome}` : ''}
                                                <span className="mt-0.5 block text-tinta-2">{c.motivo as string}</span>
                                            </span>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${SELO[VEREDITO[veredito] ?? 'neutro']}`}>{veredito}</span>
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Cartao>
            </Pagina>
        </Shell>
    );
}
