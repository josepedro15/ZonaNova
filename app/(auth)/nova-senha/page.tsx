import { criarClienteServidor } from '@/lib/supabase/server';
import LinkVencido from './link-vencido';
import Formulario from './formulario';

/**
 * Passo 3 da recuperação de senha (design/Senha.dc.html).
 *
 * Esta página não troca o `code` do e-mail: quem faz isso é o /auth/callback,
 * que já existia para a confirmação de cadastro e redireciona para cá com a
 * sessão criada. Aqui só se decide entre formulário e "link vencido".
 */
export default async function NovaSenha({
    searchParams,
}: {
    searchParams: Promise<{ erro?: string }>;
}) {
    const { erro } = await searchParams;

    // O callback avisa que a troca falhou. Olhar isto ANTES da sessão importa:
    // se o navegador tinha outra conta aberta, o formulário apareceria e a
    // senha trocada seria a dessa outra conta.
    if (erro) return <LinkVencido />;

    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return <LinkVencido />;

    return <Formulario email={user.email ?? ''} />;
}
