import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import FormularioCadastro from './formulario';
import Marca from '@/app/marca';

export default async function Cadastro() {
    // A lista de unidades é legível por qualquer autenticado e pelo anónimo —
    // é o campo que define todo o resto do acesso (ver p_unidades_select).
    const supabase = await criarClienteServidor();
    const { data: unidades } = await supabase
        .from('unidades')
        .select('id, nome, cidade, uf')
        .eq('ativa', true)
        .order('nome');

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-9">
            <div className="pb-7 pt-13">
                <Marca tamanho="md" orientacao="vertical" legenda="Análise de atendimento" />
            </div>

            <h1 className="display text-[26px] font-semibold">Criar sua conta</h1>
            <p className="mt-1.5 mb-6 text-sm text-tinta-2">
                Leva um minuto. Depois é só conectar seu WhatsApp comercial.
            </p>

            <FormularioCadastro unidades={unidades ?? []} />

            <p className="mt-4 text-center text-[13px] text-tinta-3">
                Já tem conta? <Link href="/login" className="font-semibold text-petroleo">Entrar</Link>
            </p>
        </main>
    );
}
