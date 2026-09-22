import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/env';
import { destinoSeguro } from '@/lib/destino';

/**
 * Destino do link de confirmação de e-mail — e do de recuperação de senha,
 * que chega com `next=/nova-senha`.
 *
 * O projeto Supabase exige confirmar o e-mail (mailer_autoconfirm = false). O
 * link do e-mail passa pelo Supabase, que confirma a conta e manda para cá com
 * um `code`; aqui ele vira sessão. Sem esta rota a pessoa confirmava, caía
 * numa 404, e tinha de adivinhar que o próximo passo era voltar ao login.
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    // Só caminho da própria aplicação: um `next=https://…` (ou `/\evil.com`)
    // faria desta rota um redirecionador aberto, com o domínio da Zona Nova na
    // frente do link de phishing.
    const destino = destinoSeguro(url.searchParams.get('next'), APP_URL, '/aguardando-aprovacao');

    // A base do redirecionamento é o APP_URL, não `url.origin`. Atrás de um
    // proxy — o túnel do `npm run tunel`, e qualquer balanceador — o Next vê o
    // próprio endereço local em request.url: a primeira versão desta rota
    // mandava quem confirmava o e-mail para https://localhost:3000, que no
    // celular da pessoa não abre.
    if (code) {
        const supabase = await criarClienteServidor();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL(destino, APP_URL));
    }

    // Link de recuperação vencido ou já usado: volta para /nova-senha, que
    // explica e oferece outro link. O `?erro` é o que manda — se o navegador já
    // tivesse outra sessão aberta, sem ele a tela mostraria o formulário e a
    // pessoa trocaria a senha da conta errada.
    if (destino === '/nova-senha') {
        return NextResponse.redirect(new URL('/nova-senha?erro=link', APP_URL));
    }

    // Link vencido ou já usado: a conta pode até estar confirmada — o login resolve.
    return NextResponse.redirect(new URL('/login?erro=link', APP_URL));
}
