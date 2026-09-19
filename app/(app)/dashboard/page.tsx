import { criarClienteServidor } from '@/lib/supabase/server';
import Link from 'next/link';
import { sair } from '@/app/actions/auth';
import Marca from '@/app/marca';

export default async function Dashboard() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    // Tudo o que esta consulta devolve já passou pela RLS. Um vendedor recebe
    // só as conversas dele; um gestor, as da unidade. Ver tests/rls.sql.
    const [{ data: perfil }, { count: conversas }] = await Promise.all([
        supabase.from('profiles').select('nome, role, unidades!profiles_unidade_id_fkey(nome)').eq('id', user!.id)
            .maybeSingle<{ nome: string; role: string; unidades: { nome: string } | null }>(),
        supabase.from('conversas').select('id', { count: 'exact', head: true }),
    ]);

    // Pela sessão: a RLS já limita aos pendentes das unidades de quem olha.
    const gere = ['gestor', 'supervisor', 'admin'].includes(perfil?.role ?? '');
    const { count: pendentes } = gere
        ? await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
        : { count: 0 };

    return (
        <main className="mx-auto w-full max-w-[430px] px-[18px] pb-10">
            <header className="flex items-center justify-between border-b border-linha py-3.5">
                <Marca legenda={perfil?.unidades?.nome ?? 'Rede'} />
                <form action={sair}>
                    <button type="submit" className="text-[13px] text-tinta-3">Sair</button>
                </form>
            </header>

            <h1 className="display mt-5 text-2xl font-semibold">Olá, {perfil?.nome?.split(' ')[0]}</h1>
            <p className="mt-1 text-[13px] text-tinta-2">
                {perfil?.role === 'vendedor' ? 'Vendedor' : perfil?.role} ·{' '}
                {conversas ?? 0} conversa{conversas === 1 ? '' : 's'} visível para você
            </p>

            {gere && (
                <Link href="/aprovacoes"
                      className="mt-6 flex items-center justify-between rounded-lg border border-linha bg-superficie p-[18px]">
                    <span>
                        <span className="display block text-[15px] font-semibold">Aprovações</span>
                        <span className="text-[12.5px] text-tinta-3">
                            {pendentes ? `${pendentes} esperando você` : 'ninguém esperando'}
                        </span>
                    </span>
                    {!!pendentes && (
                        <span className="flex size-7 items-center justify-center rounded-full bg-petroleo text-[13px] font-semibold text-papel">
                            {pendentes}
                        </span>
                    )}
                </Link>
            )}

            <div className="mt-6 rounded-lg border border-linha-quente bg-ocre-sof p-[18px]">
                <span className="display text-[15px] font-semibold text-ocre-texto">Fundação no ar</span>
                <p className="mt-2 text-[13px] leading-relaxed text-ocre-texto-2">
                    Auth, papéis e isolamento por unidade estão de pé e testados. O dashboard
                    de verdade chega na Fase 6 — falta primeiro conectar o WhatsApp (Fase 4) e
                    ligar a análise (Fase 5).
                </p>
            </div>
        </main>
    );
}
