'use client';

import { useActionState, useState } from 'react';
import { definirNovaSenha, type Resultado } from '@/app/actions/auth';
import { forcaDaSenha } from '@/lib/forca-senha';
import LinkVencido from './link-vencido';

const inicial: Resultado = {};

const campo = 'min-h-[46px] w-full rounded-[10px] border bg-superficie px-3.5 text-[15px]';

// Cor por nível do medidor: vermelho só para o que o servidor recusa ou que cai
// fácil; âmbar para o mínimo aceito; verde daí para cima.
const corDoNivel = ['', 'bg-vermelho', 'bg-ambar', 'bg-verde', 'bg-verde'];
const textoDoNivel = ['', 'text-vermelho', 'text-ambar-texto', 'text-verde', 'text-verde'];

export default function Formulario({ email }: { email: string }) {
    const [estado, acao, pendente] = useActionState(definirNovaSenha, inicial);
    const [senha, setSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');
    const [mostrar, setMostrar] = useState(false);

    // A sessão do link pode expirar com a tela aberta; aí o formulário já não
    // grava nada e mostrar erro genérico só faria a pessoa tentar de novo.
    if (estado.vencido) return <LinkVencido />;

    const forca = forcaDaSenha(senha);
    const iguais = confirmacao.length > 0 && confirmacao === senha;

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-9">
            <h1 className="display pt-16 text-2xl font-semibold">Criar uma senha nova</h1>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-tinta-2">
                Depois disso você entra direto.
                {email && <><br /><span className="text-tinta-3">Conta: {email}</span></>}
            </p>

            <form action={acao} className="flex flex-col gap-4">
                {/* Invisível, mas é o que faz o gerenciador de senhas do celular
                    guardar a senha nova na conta certa em vez de criar outra. */}
                <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-tinta-2">Nova senha</span>
                    <div className="relative">
                        <input
                            name="senha" type={mostrar ? 'text' : 'password'} required minLength={8}
                            autoComplete="new-password" value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            aria-invalid={estado.campo === 'senha' || undefined}
                            className={`${campo} pr-11 ${estado.campo === 'senha' ? 'border-vermelho' : 'border-linha-campo'}`}
                        />
                        <button
                            type="button" onClick={() => setMostrar((m) => !m)}
                            aria-label={mostrar ? 'Esconder a senha' : 'Mostrar a senha'}
                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-tinta-3"
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" />
                                {mostrar && <path d="M4 4l16 16" />}
                            </svg>
                        </button>
                    </div>
                    {forca.nivel > 0 && (
                        <>
                            <div className="mt-0.5 flex gap-1" aria-hidden>
                                {[1, 2, 3, 4].map((n) => (
                                    <div key={n} className={`h-1 flex-1 rounded-full ${n <= forca.nivel ? corDoNivel[forca.nivel] : 'bg-linha'}`} />
                                ))}
                            </div>
                            <span className={`text-xs font-medium ${textoDoNivel[forca.nivel]}`}>{forca.rotulo}</span>
                        </>
                    )}
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-tinta-2">Repetir a senha</span>
                    <div className="relative">
                        <input
                            name="confirmacao" type={mostrar ? 'text' : 'password'} required
                            autoComplete="new-password" value={confirmacao}
                            onChange={(e) => setConfirmacao(e.target.value)}
                            aria-invalid={estado.campo === 'confirmacao' || undefined}
                            className={`${campo} pr-11 ${
                                iguais ? 'border-verde'
                                    : estado.campo === 'confirmacao' ? 'border-vermelho' : 'border-linha-campo'
                            }`}
                        />
                        {iguais && (
                            <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 stroke-verde" width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M20 6L9 17l-5-5" />
                            </svg>
                        )}
                    </div>
                </label>

                {estado.erro && (
                    <p role="alert" className="rounded-[10px] border border-vermelho-linha bg-vermelho-sof px-3.5 py-3 text-[12.5px] text-vermelho-texto">
                        {estado.erro}
                    </p>
                )}

                <button
                    type="submit" disabled={pendente}
                    className="display mt-2 min-h-[50px] rounded-[11px] bg-petroleo text-[15px] font-semibold text-papel disabled:opacity-60"
                >
                    {pendente ? 'Salvando…' : 'Salvar e entrar'}
                </button>
            </form>
        </main>
    );
}
