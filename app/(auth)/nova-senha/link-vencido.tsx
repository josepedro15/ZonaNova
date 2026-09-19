import Link from 'next/link';

/**
 * Estado "SE O LINK VENCEU" de design/Senha.dc.html. Tela inteira, não só a
 * faixa vermelha do design: sem sessão não há formulário a mostrar, e a única
 * coisa útil a fazer é pedir outro link.
 */
export default function LinkVencido() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 flex size-[74px] items-center justify-center rounded-full bg-vermelho-sof">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="stroke-vermelho" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16.2h.01" />
                </svg>
            </div>
            <h1 className="display text-[22px] font-semibold">Esse link não vale mais</h1>
            {/* As três causas reais, ditas de uma vez: "vencido" sozinho deixava
                sem explicação quem abriu o e-mail no celular depois de pedir no
                computador — o PKCE só aceita o link no mesmo navegador. */}
            <p className="mt-2.5 text-sm leading-relaxed text-tinta-2">
                O link de senha vale por 1 hora, funciona uma vez só e precisa ser aberto
                no mesmo aparelho em que você pediu.
            </p>
            <Link
                href="/recuperar-senha"
                className="display mt-7 flex min-h-[50px] w-full items-center justify-center rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel"
            >
                Pedir outro link
            </Link>
            <Link href="/login" className="mt-5 text-[13px] font-medium text-petroleo">Voltar para entrar</Link>
        </main>
    );
}
