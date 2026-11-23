import { redirect } from 'next/navigation';
import { CabecalhoPagina, Cartao, Pagina, Selo, Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { dataEmSaoPaulo } from '@/lib/analise';
import { encerrarMonitoramento } from '@/app/actions/monitoramento';
import { MAX_MONITORAMENTOS_ATIVOS, type Monitoramento } from '@/lib/monitoramento';
import { Chat } from './chat';
import { iaLiberada } from '@/lib/ia-acesso';
import { inicioPorPapel } from '@/lib/conexao';

export const dynamic = 'force-dynamic';

const diaCurto = (d: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/**
 * Conversar com a IA (fase 1, 23/11/2026): perguntar sobre as conversas e
 * pedir monitoramentos. Só gestão; o vendedor vê o card no Meu dia.
 */
export default async function IaPage() {
    const { supabase, perfil } = await contextoApp();
    // Por enquanto só o José Pedro e o Silas (ia_acesso, 0037).
    if (perfil.role === 'vendedor' || !(await iaLiberada(supabase))) redirect(inicioPorPapel(perfil.role));
    const hoje = dataEmSaoPaulo(new Date());
    const [{ data: monitoramentos }, { count: pendentes }] = await Promise.all([
        supabase.from('monitoramentos').select('*').order('created_at', { ascending: false }).limit(12).returns<Monitoramento[]>(),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    ]);
    const lista = monitoramentos ?? [];
    const abertos = lista.filter((m) => !m.encerrado_em && m.fim >= hoje);
    const ids = [...new Set(lista.map((m) => m.criado_por))];
    const { data: autores } = ids.length ? await supabase.from('profiles').select('id,nome').in('id', ids) : { data: [] };
    const autor = new Map((autores ?? []).map((a) => [a.id as string, (a.nome as string).split(' ')[0]]));

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/ia" pendentes={pendentes ?? 0}>
            <Pagina>
                <CabecalhoPagina sobre="Pergunte sobre as conversas ou peça para acompanhar uma ação da rede" titulo="Conversar com a IA" />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
                    <Chat nome={perfil.nome.split(' ')[0]} papel={perfil.role} />
                    <aside aria-label="Monitoramentos" className="flex flex-col gap-3">
                        <h2 className="text-[12.5px] font-semibold text-tinta-3">Monitorando ({abertos.length} de {MAX_MONITORAMENTOS_ATIVOS})</h2>
                        {lista.length === 0 && (
                            <Cartao variante="tracejado">
                                <p className="text-[13.5px] text-tinta-2">Nenhum monitoramento ainda. Peça no chat, por exemplo: “a partir de 1º de dezembro, monitora se os vendedores estão mandando as ações de Natal”.</p>
                            </Cartao>
                        )}
                        {lista.map((m) => {
                            const aberto = !m.encerrado_em && m.fim >= hoje;
                            const podeParar = aberto && (m.criado_por === perfil.id || ['supervisor', 'admin'].includes(perfil.role));
                            return (
                                <Cartao key={m.id} variante={aberto ? 'padrao' : 'tracejado'} className="flex flex-col gap-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="text-[14px] font-semibold">{m.titulo}</h3>
                                        <Selo tom={aberto ? (m.inicio > hoje ? 'azul' : 'bom') : 'neutro'}>{!aberto ? 'Encerrado' : m.inicio > hoje ? 'Agendado' : 'Ativo'}</Selo>
                                    </div>
                                    <p className="text-[13px] text-tinta-2">{m.criterio}</p>
                                    <p className="text-[12.5px] text-tinta-3">
                                        {autor.get(m.criado_por) ?? '—'} · {diaCurto(m.inicio)} a {diaCurto(m.fim)}{m.unidade_id ? '' : ' · rede toda'}
                                    </p>
                                    {podeParar && (
                                        <form action={encerrarMonitoramento} className="self-start">
                                            <input type="hidden" name="id" value={m.id} />
                                            <button type="submit" className="min-h-11 text-[13px] font-semibold text-tinta-3 hover:text-risco">Parar</button>
                                        </form>
                                    )}
                                </Cartao>
                            );
                        })}
                        <p className="text-[12.5px] text-tinta-3">O card de cada monitoramento aparece no painel da gestão e no Meu dia dos vendedores enquanto o período estiver aberto.</p>
                    </aside>
                </div>
            </Pagina>
        </Shell>
    );
}
