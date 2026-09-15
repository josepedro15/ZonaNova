'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { entrar, type Resultado } from '@/app/actions/auth';

const inicial: Resultado = {};

export default function Login() {
    const [estado, acao, pendente] = useActionState(entrar, inicial);

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-9">
            <div className="flex flex-col items-center gap-3 pb-9 pt-20">
                <div className="flex size-12 items-center justify-center rounded-[13px] bg-petroleo">
                    <span className="display text-[19px] font-bold text-papel">ZN</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                    <span className="display text-[18px] font-semibold">Zona Nova</span>
                    <span className="text-xs text-tinta-3">Análise de atendimento</span>
                </div>
            </div>

            <h1 className="display text-[26px] font-semibold">Entrar</h1>
            <p className="mt-1.5 mb-6 text-sm text-tinta-2">Use o e-mail que você cadastrou.</p>

            <form action={acao} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-tinta-2">E-mail</span>
                    <input
                        name="email" type="email" required autoComplete="email"
                        className="min-h-[46px] rounded-[10px] border border-[#ddd7cc] bg-superficie px-3.5 text-[15px]"
                    />
                </label>

                <label className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs font-semibold text-tinta-2">Senha</span>
                        <Link href="/recuperar-senha" className="text-xs font-medium text-petroleo">
                            Esqueci a senha
                        </Link>
                    </div>
                    <input
                        name="senha" type="password" required autoComplete="current-password"
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
                    {pendente ? 'Entrando…' : 'Entrar'}
                </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-tinta-3">
                Ainda não tem conta? <Link href="/cadastro" className="font-semibold text-petroleo">Criar agora</Link>
            </p>
        </main>
    );
}
