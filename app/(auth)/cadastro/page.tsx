import Link from 'next/link';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import FormularioCadastro from './formulario';
import Marca from '@/app/marca';

// A lista de unidades vem do banco a cada visita. Sem isto o Next gera a
// página UMA vez, no build: ela lê pelo service role, sem cookies, e o Next
// conclui que nada nela muda por visita. Em produção a lista ficaria
// congelada no dia do deploy — unidade cadastrada depois não apareceria para
// ninguém escolher. Em `npm run dev` tudo é dinâmico, e por isso não se via.
export const dynamic = 'force-dynamic';

export default async function Cadastro() {
    // Service role de propósito. Quem abre esta tela ainda não tem conta, e
    // portanto é o papel `anon` — que não tem privilégio nenhum em `public`
    // desde a 0003. A política p_unidades_select também é `to authenticated`,
    // então nem antes da 0003 o anónimo via linha alguma: a lista vinha vazia
    // em silêncio e ninguém conseguia escolher unidade.
    //
    // A alternativa seria devolver privilégio ao `anon`. Não vale: a lista de
    // unidades é pública por natureza (é o que a pessoa precisa escolher para
    // se cadastrar), e lê-la aqui com service role mantém o `anon` em zero —
    // propriedade que o tests/rls.sql afirma e que é mais fácil de defender do
    // que uma exceção.
    const supabase = criarClienteAdmin();
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
