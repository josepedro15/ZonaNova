import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/env';

/**
 * Destino do link de confirmação de e-mail.
 *
 * O projeto Supabase exige confirmar o e-mail (mailer_autoconfirm = false). O
 * link do e-mail passa pelo Supabase, que confirma a conta e manda para cá com
 * um `code`; aqui ele vira sessão. Sem esta rota a pessoa confirmava, caía
 * numa 404, e tinha de adivinhar que o próximo passo era voltar ao login.
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    // Só caminho relativo: um `next=https://…` faria desta rota um redirecionador
    // aberto, com o domínio da Zona Nova na frente do link de phishing.
    const pedido = url.searchParams.get('next') ?? '/aguardando-aprovacao';
    const destino = pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/aguardando-aprovacao';

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

    // Link vencido ou já usado: a conta pode até estar confirmada — o login resolve.
    return NextResponse.redirect(new URL('/login?erro=link', APP_URL));
}
