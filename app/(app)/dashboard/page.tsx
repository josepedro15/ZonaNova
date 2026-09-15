import { criarClienteServidor } from '@/lib/supabase/server';
import { sair } from '@/app/actions/auth';
import Marca from '@/app/marca';

export default async function Dashboard() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    // Tudo o que esta consulta devolve já passou pela RLS. Um vendedor recebe
    // só as conversas dele; um gestor, as da unidade. Ver tests/rls.sql.
    const [{ data: perfil }, { count: conversas }] = await Promise.all([
        supabase.from('profiles').select('nome, role, unidades(nome)').eq('id', user!.id)
            .maybeSingle<{ nome: string; role: string; unidades: { nome: string } | null }>(),
        supabase.from('conversas').select('id', { count: 'exact', head: true }),
    ]);

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
