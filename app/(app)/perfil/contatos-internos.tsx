import type { criarClienteServidor } from '@/lib/supabase/server';
import { semTelefone, telefoneBonito } from '@/lib/painel';
import { dataEmSaoPaulo } from '@/lib/analise';
import { diaMenos } from '@/lib/derivacoes';
import { agruparSugestoes, ROTULO_NATUREZA, type LinhaSugestao, type SugestaoInterno } from '@/lib/natureza';
import { adicionarContatoInterno, removerContatoInterno } from '@/app/actions/internos';

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Unidade = { id: string; nome: string };
type Interno = { id: string; unidade_id: string; telefone: string; descricao: string };

/** As lojas cuja lista a pessoa cuida: as que gerencia, ou a rede para supervisor e admin. */
async function unidadesQueCuida(supabase: Supabase, userId: string, role: string): Promise<Unidade[]> {
    if (role === 'gestor') {
        // Mesmo critério do ramo de baixo: loja desativada não ganha lista nova,
        // e a ordem é pelo nome. Feito aqui, em JS: são poucas lojas por gestor.
        const { data } = await supabase.from('gestor_unidades').select('unidades(id,nome,ativa)').eq('gestor_id', userId)
            .returns<{ unidades: (Unidade & { ativa: boolean }) | null }[]>();
        return (data ?? [])
            .flatMap((g) => (g.unidades?.ativa ? [{ id: g.unidades.id, nome: g.unidades.nome }] : []))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
    const { data } = await supabase.from('unidades').select('id,nome').eq('ativa', true).order('nome').returns<Unidade[]>();
    return data ?? [];
}

/** Janela das sugestões: duas semanas de análise. */
const DIAS_SUGESTAO = 14;

type LinhaBanco = {
    data_ref: string;
    natureza_contato: string | null;
    confianca_natureza: number | null;
    evidencia_natureza: string | null;
    conversas: { unidade_id: string; cliente_telefone: string; cliente_nome: string | null } | null;
};

/**
 * Conversas das lojas que a análise viu, com confiança, como de colega,
 * fornecedor ou pessoal (lib/natureza.ts). Conversa já bloqueada — número
 * cadastrado aqui ou marcado pelo vendedor — não volta como sugestão.
 */
async function sugestoesDaIa(supabase: Supabase, unidades: Unidade[]): Promise<SugestaoInterno[]> {
    const { data } = await supabase.from('analises_conversa')
        .select('data_ref,natureza_contato:payload->>natureza_contato,confianca_natureza:payload->confianca_natureza,evidencia_natureza:payload->>evidencia_natureza,conversas!inner(unidade_id,cliente_telefone,cliente_nome)')
        .in('conversas.unidade_id', unidades.map((u) => u.id)).eq('conversas.bloqueada', false)
        .gte('data_ref', diaMenos(dataEmSaoPaulo(new Date()), DIAS_SUGESTAO))
        .in('payload->>natureza_contato', Object.keys(ROTULO_NATUREZA))
        .order('data_ref', { ascending: false }).limit(500)
        .returns<LinhaBanco[]>();
    const linhas: LinhaSugestao[] = (data ?? []).flatMap((l) => (l.conversas && !semTelefone(l.conversas.cliente_telefone) ? [{
        unidade_id: l.conversas.unidade_id, telefone: l.conversas.cliente_telefone, nome: l.conversas.cliente_nome, data_ref: l.data_ref,
        payload: { natureza_contato: l.natureza_contato, confianca_natureza: l.confianca_natureza, evidencia_natureza: l.evidencia_natureza },
    }] : []));
    return agruparSugestoes(linhas);
}

export async function ContatosInternos({ supabase, userId, role }: { supabase: Supabase; userId: string; role: string }) {
    const unidades = await unidadesQueCuida(supabase, userId, role);
    if (!unidades.length) return null;
    const { data: internos } = await supabase.from('contatos_internos').select('id,unidade_id,telefone,descricao')
        .in('unidade_id', unidades.map((u) => u.id)).order('created_at', { ascending: false }).returns<Interno[]>();
    const nomeDa = new Map(unidades.map((u) => [u.id, u.nome]));
    const sugestoes = await sugestoesDaIa(supabase, unidades);
    return (
        <section className="mt-5 rounded-card border border-linha bg-superficie p-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="display text-lg font-semibold">Contatos internos da loja</h2>
                    <p className="mt-1 text-[12px] text-tinta-2">Depósito, caixa, financeiro: ficam fora da análise para todos os vendedores da loja.</p>
                </div>
                <span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs font-semibold">{internos?.length ?? 0}</span>
            </div>
            {/* Com uma loja só, o campo dela é hidden e não ocupa célula: a grade
                perde a primeira coluna para os três campos não ficarem tortos. */}
            <form action={adicionarContatoInterno} className={`mt-4 grid gap-2 ${unidades.length === 1 ? 'sm:grid-cols-[1fr_1.3fr_auto]' : 'sm:grid-cols-[1fr_1fr_1.3fr_auto]'}`}>
                {unidades.length === 1 ? (
                    <input type="hidden" name="unidadeId" value={unidades[0].id} />
                ) : (
                    <select name="unidadeId" required className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm">
                        {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                )}
                <input name="telefone" required inputMode="tel" placeholder="Telefone com DDD" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                <input name="descricao" required maxLength={120} placeholder="Quem é (ex.: Depósito)" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                <button className="rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Adicionar</button>
            </form>
            <div className="mt-4 divide-y divide-linha">
                {(internos ?? []).map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-4 py-3">
                        <div>
                            <p className="text-sm font-semibold">{i.descricao}</p>
                            <p className="text-xs text-tinta-3">{telefoneBonito(i.telefone)} · {nomeDa.get(i.unidade_id) ?? 'Loja'}</p>
                        </div>
                        <form action={removerContatoInterno}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs font-semibold text-vermelho">Remover</button>
                        </form>
                    </div>
                ))}
                {!internos?.length && <p className="py-4 text-sm text-tinta-3">Nenhum contato interno cadastrado.</p>}
            </div>
            <p className="mt-3 text-[12px] text-tinta-3">Os números dos vendedores conectados já ficam fora automaticamente.</p>
            {sugestoes.length > 0 && (
                <div className="mt-5 border-t border-linha pt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Sugeridos pela IA</h3>
                        <span className="rounded-full bg-ocre-sof px-2.5 py-1 text-xs font-semibold text-ocre-texto">{sugestoes.length}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-tinta-2">
                        Nos últimos {DIAS_SUGESTAO} dias a análise achou que estas conversas não são com cliente. Nada foi bloqueado: enquanto você não decide, elas só ficam fora das objeções e do relatório do vendedor.
                    </p>
                    <div className="mt-2 divide-y divide-linha">
                        {sugestoes.map((s) => (
                            <div key={`${s.unidade_id}|${s.telefone}`} className="py-3">
                                <p className="text-sm font-semibold">{s.nome ?? telefoneBonito(s.telefone)}</p>
                                <p className="text-xs text-tinta-3">
                                    {[s.nome && telefoneBonito(s.telefone), ROTULO_NATUREZA[s.natureza], `${s.confianca}% de confiança`, s.dias > 1 && `em ${s.dias} dias`, unidades.length > 1 && (nomeDa.get(s.unidade_id) ?? 'Loja')].filter(Boolean).join(' · ')}
                                </p>
                                {s.evidencia && <p className="mt-1 text-[12.5px] italic text-tinta-2">“{s.evidencia}”</p>}
                                <form action={adicionarContatoInterno} className="mt-2 flex flex-wrap gap-2">
                                    <input type="hidden" name="unidadeId" value={s.unidade_id} />
                                    <input type="hidden" name="telefone" value={s.telefone} />
                                    <input name="descricao" required maxLength={120} defaultValue={[s.nome, ROTULO_NATUREZA[s.natureza]].filter(Boolean).join(' — ').slice(0, 120)}
                                        aria-label="Quem é" className="min-w-0 flex-1 rounded-[9px] border border-linha-campo bg-superficie px-3 py-1.5 text-sm" />
                                    <button className="rounded-[9px] bg-petroleo px-3 py-1.5 text-xs font-semibold text-papel">Marcar como interno</button>
                                </form>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
