import { criarClienteServidor } from '@/lib/supabase/server';
import { sair } from '@/app/actions/auth';
import Marca from '@/app/marca';

export default async function Aguardando() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: perfil } = await supabase
        .from('profiles')
        .select('nome, unidade_id, unidades!profiles_unidade_id_fkey(nome, cidade, uf)')
        .eq('id', user!.id)
        .maybeSingle<{ nome: string; unidade_id: string | null; unidades: { nome: string; cidade: string | null; uf: string | null } | null }>();

    const unidade = perfil?.unidades;

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-8">
            <div className="flex items-center justify-between py-5">
                <Marca />
                <form action={sair}>
                    <button type="submit" className="text-[13px] text-tinta-3">Sair</button>
                </form>
            </div>

            <div className="flex flex-1 flex-col justify-center">
                <div className="mb-6 flex justify-center">
                    <div className="flex size-[78px] items-center justify-center rounded-full border border-linha-quente bg-ocre-sof">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="stroke-ocre" strokeWidth="1.7" strokeLinecap="round">
                            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
                        </svg>
                    </div>
                </div>

                <h1 className="display text-center text-[25px] font-semibold leading-tight">
                    Seu acesso está com o gestor
                </h1>
                <p className="mt-2.5 text-center text-sm leading-relaxed text-tinta-2">
                    Assim que ele aprovar, você conecta seu WhatsApp e já começa a ver suas
                    análises. Costuma sair no mesmo dia.
                </p>

                {unidade && (
                    <div className="mt-7 rounded-lg border border-linha bg-superficie p-[18px]">
                        <span className="text-[11px] font-semibold tracking-wide text-tinta-3">UNIDADE ESCOLHIDA</span>
                        <p className="display mt-0.5 text-[17px] font-semibold">{unidade.nome}</p>
                        {unidade.cidade && (
                            <p className="text-xs text-tinta-3">{unidade.cidade} · {unidade.uf}</p>
                        )}
                    </div>
                )}

                <div className="mt-3.5 flex gap-2.5 rounded-[12px] bg-papel-2 px-4 py-3.5">
                    <svg className="shrink-0 stroke-tinta-2" width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                    </svg>
                    <span className="text-[12.5px] leading-relaxed text-tinta-2">
                        Nada do seu WhatsApp é lido antes da aprovação — a conexão só acontece
                        no próximo passo.
                    </span>
                </div>
            </div>
        </main>
    );
}
