import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppShell from '@/components/app-shell';
import DesconectarWhatsapp from '@/components/desconectar-whatsapp';
import { criarClienteServidor } from '@/lib/supabase/server';
import { telefoneBonito } from '@/lib/painel';
import { bloquearContato, desbloquearContato } from '@/app/actions/conexao';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const [{ data: perfil }, { data: conexao }, { data: bloqueados }] = await Promise.all([
        supabase.from('profiles').select('nome,email,telefone,role,unidades!profiles_unidade_id_fkey(nome)').eq('id', user.id)
            .single<{ nome: string; email: string; telefone: string | null; role: 'vendedor'|'gestor'|'supervisor'|'admin'; unidades: { nome: string } | null }>(),
        supabase.from('vw_conexoes_status').select('status,numero,ultimo_evento_em').eq('user_id', user.id)
            .maybeSingle<{ status: string; numero: string | null; ultimo_evento_em: string | null }>(),
        supabase.from('contatos_bloqueados').select('id,telefone,motivo,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    if (!perfil) redirect('/login');
    const conectado = conexao?.status === 'conectada';

    return (
        <AppShell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidades?.nome} atual="/perfil">
            <div className="mx-auto max-w-[820px] px-5 pb-28 pt-7 lg:px-10 lg:pb-14 lg:pt-10">
                <h1 className="display text-[30px] font-semibold">Perfil</h1>
                <p className="mt-1 text-sm text-tinta-2">{perfil.nome} · {perfil.unidades?.nome ?? 'Rede'}</p>

                <section className="mt-7 rounded-card border border-linha bg-superficie p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tinta-3">Seu WhatsApp</p>
                            <p className="display mt-2 text-xl font-semibold">{conexao?.numero ? telefoneBonito(conexao.numero) : 'Nenhum número'}</p>
                            <p className={`mt-1 text-[12.5px] font-semibold ${conectado ? 'text-verde' : 'text-vermelho'}`}>{conectado ? 'Conectado' : 'Desconectado'}</p>
                        </div>
                        <span className={`mt-1 size-3 rounded-full ${conectado ? 'bg-verde' : 'bg-vermelho'}`} />
                    </div>
                    <div className="mt-5 border-t border-linha pt-4">
                        {conectado ? <DesconectarWhatsapp /> : <Link href="/conectar" className="text-[13px] font-semibold text-petroleo">Conectar WhatsApp</Link>}
                    </div>
                </section>

                <section className="mt-5 rounded-card border border-linha bg-superficie p-5">
                    <div className="flex items-center justify-between">
                        <div><h2 className="display text-lg font-semibold">Contatos fora da análise</h2><p className="mt-1 text-[12px] text-tinta-2">Pessoais, fornecedores e outros contatos privados.</p></div>
                        <span className="rounded-full bg-papel-2 px-2.5 py-1 text-xs font-semibold">{bloqueados?.length ?? 0}</span>
                    </div>
                    <form action={bloquearContato} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                        <input name="telefone" required inputMode="tel" placeholder="Telefone com DDD" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                        <input name="motivo" placeholder="Motivo (opcional)" className="rounded-[9px] border border-linha-campo bg-superficie px-3 py-2 text-sm" />
                        <button className="rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel">Bloquear</button>
                    </form>
                    <div className="mt-4 divide-y divide-linha">
                        {(bloqueados ?? []).map((b) => <div key={b.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-semibold">{telefoneBonito(b.telefone)}</p><p className="text-xs text-tinta-3">{b.motivo ?? 'Sem motivo informado'}</p></div><form action={desbloquearContato}><input type="hidden" name="id" value={b.id}/><button className="text-xs font-semibold text-vermelho">Remover</button></form></div>)}
                        {!bloqueados?.length && <p className="py-4 text-sm text-tinta-3">Nenhum contato bloqueado.</p>}
                    </div>
                </section>

                <section className="mt-5 rounded-card border border-linha bg-papel-2 p-5">
                    <h2 className="display text-lg font-semibold">Como os dados são usados</h2>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-tinta-2">A análise usa mensagens novas e o trecho de histórico que o WhatsApp disponibilizar. A importação antiga não é garantida. Grupos, status e contatos bloqueados ficam de fora. Imagens e documentos não são interpretados como prova; áudios são transcritos quando possível.</p>
                </section>
            </div>
        </AppShell>
    );
}
