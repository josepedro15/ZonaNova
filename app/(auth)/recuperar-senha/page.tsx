'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { pedirLinkDeSenha, type Resultado } from '@/app/actions/auth';

const inicial: Resultado = {};

export default function RecuperarSenha() {
    const [estado, acao, pendente] = useActionState(pedirLinkDeSenha, inicial);

    if (estado.enviado) {
        return (
            <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-5 flex size-[74px] items-center justify-center rounded-full bg-verde-sof">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2f7d52" strokeWidth="1.7" strokeLinecap="round">
                        <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6 8.5-6" />
                    </svg>
                </div>
                <h1 className="display text-[22px] font-semibold">Olha seu e-mail</h1>
                {/* A mensagem é a mesma para e-mail cadastrado e não cadastrado: senão a
                    tela vira jeito de descobrir quem trabalha na rede. */}
                <p className="mt-2.5 text-sm leading-relaxed text-tinta-2">
                    Se esse e-mail estiver cadastrado, o link chega em instantes. Ele vale por 1 hora.
                </p>
                <div className="mt-6 w-full rounded-[11px] border border-[#f0dfc4] bg-ambar-sof px-4 py-3.5 text-left">
                    <span className="text-[12.5px] leading-relaxed text-[#8a6209]">
                        Não chegou em 5 minutos? Confira o lixo eletrônico antes de pedir de novo.
                    </span>
                </div>
                <Link href="/login" className="mt-6 text-[13px] font-medium text-petroleo">Voltar para entrar</Link>
            </main>
        );
    }

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-9">
            <Link href="/login" className="flex items-center gap-2.5 py-8 text-[13px] text-tinta-2">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M15 5l-7 7 7 7" />
                </svg>
                Voltar para entrar
            </Link>

            <h1 className="display text-2xl font-semibold">Esqueceu a senha?</h1>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-tinta-2">
                Manda o e-mail que você usa para entrar. Vai chegar um link para criar uma nova.
            </p>

            <form action={acao} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-tinta-2">E-mail</span>
                    <input
                        name="email" type="email" required autoComplete="email"
                        className="min-h-[46px] rounded-[10px] border border-[#ddd7cc] bg-superficie px-3.5 text-[15px]"
                    />
                </label>

                {estado.erro && (
                    <p role="alert" className="rounded-[10px] border border-[#f2ccc8] bg-vermelho-sof px-3.5 py-3 text-[12.5px] text-[#8f2c25]">
                        {estado.erro}
                    </p>
                )}

                <button
                    type="submit" disabled={pendente}
                    className="display mt-2 min-h-[50px] rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel disabled:opacity-60"
                >
                    {pendente ? 'Mandando…' : 'Mandar o link'}
                </button>
            </form>

            <p className="mt-4 text-[12.5px] leading-relaxed text-tinta-3">
                Não sabe qual e-mail cadastrou? Seu gestor consegue ver.
            </p>
        </main>
    );
}
