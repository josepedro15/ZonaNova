import Link from 'next/link';
import type { Route } from 'next';
import { Barra, Cartao, Selo } from '@/components/ui';
import type { criarClienteServidor } from '@/lib/supabase/server';
import { dataEmSaoPaulo } from '@/lib/analise';
import { paginar } from '@/lib/paginar';
import { cardVisivel, DIAS_DA_BASE, resumoDoCard, type ClienteDaBase, type MarcaQueConta, type Monitoramento } from '@/lib/monitoramento';
import { encerrarMonitoramento } from '@/app/actions/monitoramento';

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

const diaCurto = (d: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const menosDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const ha = (iso: string | null, hoje: string) => {
    if (!iso) return 'sem conversa';
    const dias = diasEntre(dataEmSaoPaulo(new Date(iso)), hoje);
    return dias <= 0 ? 'falou hoje' : dias === 1 ? 'falou ontem' : `sem conversa há ${dias} dias`;
};

/**
 * Os cards dos monitoramentos abertos (Conversar com a IA, 23/11/2026). Tudo
 * pela sessão de quem vê: o vendedor enxerga só os próprios clientes, o
 * gestor a unidade, o supervisor a rede. Sem monitoramento aberto, não
 * aparece nada.
 */
export async function CardsMonitoramento({ supabase, modo, quem }: { supabase: Supabase; modo: 'vendedor' | 'gestao'; quem: { id: string; role: string } }) {
    const hoje = dataEmSaoPaulo(new Date());
    const { data, error } = await supabase.from('monitoramentos').select('*').is('encerrado_em', null)
        .lte('inicio', hoje).order('created_at').returns<Monitoramento[]>();
    // Tabela ainda não criada (código publicado antes da 0036): some em silêncio.
    if (error) return null;
    const abertos = (data ?? []).filter((m) => cardVisivel(m, hoje));
    if (!abertos.length) return null;
    const cards = await Promise.all(abertos.map((m) => dadosDoCard(supabase, m)));
    return (
        <div className="grid gap-4 xl:grid-cols-2">
            {cards.map((c) => <CardMonitoramento key={c.m.id} {...c} hoje={hoje} modo={modo}
                                                    podeEncerrar={c.m.criado_por === quem.id || ['supervisor', 'admin'].includes(quem.role)} />)}
        </div>
    );
}

export async function dadosDoCard(supabase: Supabase, m: Monitoramento) {
    const [base, marcas] = await Promise.all([
        paginar<ClienteDaBase>((de, ate) => supabase.rpc('zn_negociacoes_abertas', { p_desde: menosDias(m.inicio, DIAS_DA_BASE), p_unidade: m.unidade_id })
            .order('conversa_id').range(de, ate), 20_000),
        paginar<MarcaQueConta>((de, ate) => supabase.from('monitoramento_marcas').select('conversa_id,user_id,enviada_em,trecho')
            .eq('monitoramento_id', m.id).eq('conta', true).order('id').range(de, ate), 20_000),
    ]);
    const ids = [...new Set(base.map((b) => b.user_id))];
    const { data: pessoas } = ids.length ? await supabase.from('profiles').select('id,nome').in('id', ids.slice(0, 500)) : { data: [] };
    const nomes = new Map((pessoas ?? []).map((p) => [p.id as string, p.nome as string]));
    return { m, resumo: resumoDoCard(base, marcas, nomes) };
}

export function CardMonitoramento({ m, resumo, hoje, modo, podeEncerrar }: Awaited<ReturnType<typeof dadosDoCard>> & { hoje: string; modo: 'vendedor' | 'gestao'; podeEncerrar: boolean }) {
    const total = diasEntre(m.inicio, m.fim) + 1;
    const dia = Math.min(total, diasEntre(m.inicio, hoje) + 1);
    const acabou = hoje > m.fim;
    const falta = resumo.falta;
    return (
        <Cartao as="article" aria-label={`Monitoramento ${m.titulo}`} className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="display text-[18px] font-bold">{m.titulo}</h2>
                    <p className="mt-0.5 text-[13px] text-tinta-3">
                        {acabou ? `Terminou em ${diaCurto(m.fim)}` : `Dia ${dia} de ${total}`} · {diaCurto(m.inicio)} a {diaCurto(m.fim)}
                    </p>
                </div>
                <Selo tom={acabou ? 'neutro' : 'bom'} ponto>{acabou ? 'Encerrado' : 'Monitorando'}</Selo>
            </header>

            <p className="text-[13.5px] text-tinta-2">{m.criterio}</p>

            {resumo.base === 0 ? (
                <p className="text-[13.5px] text-tinta-3">
                    {modo === 'vendedor' ? 'Você não tem negociação em aberto nos últimos 90 dias.' : 'Nenhuma negociação em aberto nos últimos 90 dias neste escopo.'}
                </p>
            ) : (
                <div className="flex items-center gap-4">
                    <span className="display num text-[44px] font-extrabold leading-none text-azul">{resumo.pct}%</span>
                    <span className="text-[13.5px] text-tinta-2">
                        {modo === 'vendedor' ? 'dos seus clientes em negociação já receberam' : 'dos clientes em negociação já receberam'}
                        <br /><span className="num">{resumo.receberam} de {resumo.base}</span>
                        {resumo.foraDaBase > 0 && <> · mais {resumo.foraDaBase} {resumo.foraDaBase === 1 ? 'contato' : 'contatos'} fora da lista</>}
                    </span>
                </div>
            )}

            {modo === 'gestao' && resumo.porVendedor.length > 1 && (
                <ul className="flex flex-col gap-2" aria-label="Por vendedor">
                    {resumo.porVendedor.slice(0, 12).map((v) => (
                        <li key={v.user_id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                            <span className="truncate text-tinta-2">{v.nome}</span>
                            <Barra pct={v.pct} tom={(v.pct ?? 0) < 40 ? 'risco' : 'azul'} rotulo={v.nome} />
                            <span className="num whitespace-nowrap font-semibold">{v.receberam}/{v.base}</span>
                        </li>
                    ))}
                    {resumo.porVendedor.length > 12 && <li className="text-[12.5px] text-tinta-3">e mais {resumo.porVendedor.length - 12} vendedores</li>}
                </ul>
            )}

            {falta.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-linha pt-3">
                    <h3 className="text-[13px] font-semibold">Falta avisar · <span className="num">{falta.length}</span></h3>
                    <ListaFalta itens={falta.slice(0, 6)} hoje={hoje} modo={modo} />
                    {falta.length > 6 && (
                        <details>
                            <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-azul">Ver os {falta.length}</summary>
                            <ListaFalta itens={falta.slice(6, 300)} hoje={hoje} modo={modo} />
                            {falta.length > 300 && <p className="pt-2 text-[12.5px] text-tinta-3">Mostrando 300 de {falta.length}.</p>}
                        </details>
                    )}
                </div>
            )}

            {podeEncerrar && !acabou && (
                <form action={encerrarMonitoramento} className="self-end">
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="min-h-11 text-[13px] font-semibold text-tinta-3 hover:text-risco">Parar de monitorar</button>
                </form>
            )}
        </Cartao>
    );
}

function ListaFalta({ itens, hoje, modo }: { itens: (ClienteDaBase & { vendedor: string })[]; hoje: string; modo: 'vendedor' | 'gestao' }) {
    return (
        <ul className="flex flex-col">
            {itens.map((c) => (
                <li key={c.conversa_id} className="border-b border-linha-2 last:border-0">
                    <Link href={`/conversas/${c.conversa_id}` as Route} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-[13.5px] hover:text-azul">
                        <span className="min-w-0 truncate">
                            {c.cliente_nome || c.cliente_telefone}
                            {modo === 'gestao' && <span className="text-tinta-3"> · {c.vendedor}</span>}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[12.5px] text-tinta-3">{ha(c.ultima_mensagem_em, hoje)}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
