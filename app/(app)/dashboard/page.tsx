import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { CabecalhoPagina, EstadoVazio, Icone, Pagina, RotuloSecao, Selo, Shell, type DiaSerie } from '@/components/ui';
import { desde, diasAte, esperaDoCliente, foiRespondido, primeiroNome, respostaMediaEmMinutos, temposDeResposta } from '@/lib/painel';
import { dataEmSaoPaulo } from '@/lib/analise';
import { media } from '@/lib/visual';
import { variacaoSemanal } from '@/lib/derivacoes';
import { dataPorExtenso, diaPorExtenso, horaBrasilia, inicioDoDia, saudacao } from './formato';
import {
    AvisoAprovacoes, AvisoConexao, ConversasDeHoje, DoGestor, EsperandoVoce, HojeAteAgora, MecResumo, RelatorioDoDia, Treino,
    type AderenciaDia, type Coaching, type ConversaComMensagens, type RelatorioDiario,
} from './secoes';

// O painel lê o que chegou há instantes pelo webhook. Gerado uma vez no build
// ele mostraria o dia do deploy para sempre.
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    const agora = new Date();
    const comeco = inicioDoDia(agora);
    // Sete dias para trás: a fila precisa alcançar quem ficou de ontem.
    const janela = new Date(comeco.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dataRef = dataEmSaoPaulo(agora);

    // Tudo já passou pela RLS. Ver tests/rls.sql.
    const [{ data: perfil }, { data: conexao }, { data: conversas }, { data: relatorios }, { data: aderencia }, { data: observacoes }] = await Promise.all([
        supabase.from('profiles').select('nome, role, unidades!profiles_unidade_id_fkey(nome)').eq('id', user!.id)
            .maybeSingle<{ nome: string; role: string; unidades: { nome: string } | null }>(),
        supabase.from('vw_conexoes_status').select('status, numero, ultimo_evento_em').eq('user_id', user!.id)
            .maybeSingle<{ status: string; numero: string | null; ultimo_evento_em: string | null }>(),
        supabase.from('conversas')
            .select('id, cliente_nome, cliente_telefone, ultima_mensagem_em, mensagens(direcao, automatica, enviada_em, tipo, conteudo)')
            .gte('ultima_mensagem_em', janela.toISOString()).eq('bloqueada', false)
            .order('ultima_mensagem_em', { ascending: false }).returns<ConversaComMensagens[]>(),
        supabase.from('relatorios_diarios')
            .select('data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta,payload')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(30).returns<RelatorioDiario[]>(),
        supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(1).maybeSingle<AderenciaDia>(),
        // A tela do gestor promete "ele vê o que você escrever": é aqui.
        supabase.from('observacoes_gestor').select('id,texto,created_at')
            .eq('vendedor_id', user!.id).order('created_at', { ascending: false }).limit(3)
            .returns<{ id: string; texto: string; created_at: string }[]>(),
    ]);

    const todas = conversas ?? [];
    const deHoje = todas.filter((c) => new Date(c.ultima_mensagem_em) >= comeco);
    const esperando = todas
        .map((c) => ({ conversa: c, espera: esperaDoCliente(c.mensagens, agora) }))
        .filter((e): e is { conversa: ConversaComMensagens; espera: number } => e.espera !== null)
        .sort((a, b) => b.espera - a.espera);

    // A fila acima olha o histórico inteiro; as métricas do dia, não.
    const respostaMedia = respostaMediaEmMinutos(deHoje.flatMap((c) => temposDeResposta(desde(c.mensagens, comeco))));
    const comFala = deHoje.map((c) => foiRespondido(desde(c.mensagens, comeco))).filter((r): r is boolean => r !== null);
    const respondidos = comFala.filter(Boolean).length;
    const taxa = comFala.length ? Math.round((respondidos / comFala.length) * 100) : null;

    const gere = ['gestor', 'supervisor', 'admin'].includes(perfil?.role ?? '');
    const { count: pendentes } = gere
        ? await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
        : { count: 0 };

    const ligado = conexao?.status === 'conectada';
    const rels = relatorios ?? [];
    const relatorio = rels.find((r) => r.data_ref === dataRef) ?? rels[0] ?? null;
    const porDia = new Map(rels.map((r) => [r.data_ref, r]));
    const ontem = new Date(Date.parse(`${dataRef}T12:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Catorze dias corridos até ontem, o último que o fechamento cobre.
    const historico: DiaSerie[] = diasAte(ontem, 14).map((dia) => {
        const r = porDia.get(dia);
        return { dia, temRelatorio: !!r, nota: r?.score_geral == null ? null : Math.round(Number(r.score_geral)) };
    });

    const recentes = rels.filter((r) => r.data_ref < dataRef).slice(0, 7);
    const anteriores = relatorio ? rels.filter((r) => r.data_ref < relatorio.data_ref).slice(0, 7) : [];
    const respostaOntem = porDia.get(ontem)?.tempo_medio_resposta_s;
    const coaching = (relatorio?.payload ?? {}) as Coaching;
    const temTreino = !!(coaching.resumo || coaching.melhorias?.length || coaching.elogio || coaching.desafio);

    return (
        <Shell papel="vendedor" nome={perfil?.nome ?? ''} unidade={perfil?.unidades?.nome} atual="/dashboard" conexao={ligado ? 'conectada' : 'fora'}>
            <Pagina>
                <CabecalhoPagina sobre={dataPorExtenso(agora)} titulo={`${saudacao(agora)}, ${primeiroNome(perfil?.nome)}`}
                                 acoes={deHoje.length > 0 && (
                                     <Selo><Icone nome="relogio" tamanho={14} />Última mensagem às {horaBrasilia(deHoje[0].ultima_mensagem_em)}</Selo>
                                 )} />

                {/* O proxy manda vendedor sem conexão para /conectar. Isto é para
                    quem ele não desvia — e para o caso de o proxy não correr. */}
                {!ligado && <AvisoConexao conexao={conexao} />}
                {gere && <AvisoAprovacoes pendentes={pendentes ?? 0} />}

                <RotuloSecao complemento="ao vivo, atualiza a cada mensagem">Agora</RotuloSecao>
                <div className="grid gap-5 lg:grid-cols-12">
                    <EsperandoVoce className="lg:col-span-7" esperando={esperando} titulo={deHoje.length === 0 ? 'Ficou de ontem' : 'Esperando você'} />
                    <HojeAteAgora className="lg:col-span-5" conversas={deHoje.length} respostaMedia={respostaMedia}
                                  respostaOntemMin={respostaOntem == null ? null : Math.round(Number(respostaOntem) / 60)}
                                  taxa={taxa} respondidos={respondidos} escreveram={comFala.length}
                                  mediaLeads={media(recentes.map((r) => r.leads_atendidos))} ligado={ligado} />
                </div>

                <RotuloSecao
                    complemento={relatorio ? `${diaPorExtenso(relatorio.data_ref)} · fecha todo dia às 00h30` : undefined}
                    acao={<Link href="/evolucao" className="flex min-h-11 items-center text-[13px] font-semibold text-azul">Ver evolução →</Link>}>
                    {relatorio?.data_ref === ontem || !relatorio ? 'Seu relatório de ontem' : 'Seu último relatório'}
                </RotuloSecao>
                {relatorio ? (
                    <>
                        <RelatorioDoDia relatorio={relatorio} historico={historico}
                                        variacao={variacaoSemanal(rels.filter((r) => r.data_ref <= relatorio.data_ref))}
                                        mediaLeads={media(anteriores.map((r) => r.leads_atendidos))}
                                        mediaRespostaMin={media(anteriores.map((r) => (r.tempo_medio_resposta_s == null ? null : Number(r.tempo_medio_resposta_s) / 60)))} />
                        <div className="grid gap-5 lg:grid-cols-12">
                            {temTreino && <Treino className="lg:col-span-8" coaching={coaching} />}
                            <MecResumo className={temTreino ? 'lg:col-span-4' : 'lg:col-span-12'} aderencia={aderencia ?? null} />
                        </div>
                    </>
                ) : (
                    <EstadoVazio titulo="O relatório ainda não fechou">
                        Enquanto isso, os números de cima vêm direto das suas conversas. O primeiro relatório sai no fechamento, às 00h30.
                    </EstadoVazio>
                )}

                {!!observacoes?.length && <DoGestor observacoes={observacoes} />}
                <ConversasDeHoje conversas={deHoje} agora={agora} />
            </Pagina>
        </Shell>
    );
}
