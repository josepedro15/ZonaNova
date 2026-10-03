import type { criarClienteServidor } from '@/lib/supabase/server';
import { telefoneBonito } from '@/lib/painel';
import { adicionarContatoInterno, removerContatoInterno } from '@/app/actions/internos';

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Unidade = { id: string; nome: string };
type Interno = { id: string; unidade_id: string; telefone: string; descricao: string };

/** As lojas cuja lista a pessoa cuida: as que gerencia, ou a rede para supervisor e admin. */
async function unidadesQueCuida(supabase: Supabase, userId: string, role: string): Promise<Unidade[]> {
    if (role === 'gestor') {
        const { data } = await supabase.from('gestor_unidades').select('unidades(id,nome)').eq('gestor_id', userId)
            .returns<{ unidades: Unidade | null }[]>();
        return (data ?? []).flatMap((g) => (g.unidades ? [g.unidades] : []));
    }
    const { data } = await supabase.from('unidades').select('id,nome').eq('ativa', true).order('nome').returns<Unidade[]>();
    return data ?? [];
}

export async function ContatosInternos({ supabase, userId, role }: { supabase: Supabase; userId: string; role: string }) {
    const unidades = await unidadesQueCuida(supabase, userId, role);
    if (!unidades.length) return null;
    const { data: internos } = await supabase.from('contatos_internos').select('id,unidade_id,telefone,descricao')
        .in('unidade_id', unidades.map((u) => u.id)).order('created_at', { ascending: false }).returns<Interno[]>();
    const nomeDa = new Map(unidades.map((u) => [u.id, u.nome]));
    return (
        <section className="mt-5 rounded-card border border-linha bg-superficie p-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="display text-lg font-semibold">Contatos internos da loja</h2>
                    <p className="mt-1 text-[12px] text-tinta-2">Depósito, caixa, financeiro: ficam fora da análise para todos os vendedores da loja.</p>
                </div>
                <span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs font-semibold">{internos?.length ?? 0}</span>
            </div>
            <form action={adicionarContatoInterno} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
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
                            <button className="text-xs font-semibold text-petroleo">Remover</button>
                        </form>
                    </div>
                ))}
                {!internos?.length && <p className="py-4 text-sm text-tinta-3">Nenhum contato interno cadastrado.</p>}
            </div>
            <p className="mt-3 text-[12px] text-tinta-3">Os números dos vendedores conectados já ficam fora automaticamente.</p>
        </section>
    );
}
