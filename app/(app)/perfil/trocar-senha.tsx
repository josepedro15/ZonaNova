'use client';

import { useActionState, useState } from 'react';
import { trocarSenha, type Resultado } from '@/app/actions/auth';
import { MedidorForcaSenha } from '@/components/medidor-forca-senha';

const inicial: Resultado = {};

const campo = 'w-full rounded-[9px] border bg-superficie px-3 py-2 text-sm';
const borda = (erro: boolean) => (erro ? 'border-vermelho' : 'border-linha-campo');

export function TrocarSenha({ email }: { email: string }) {
    const [atual, setAtual] = useState('');
    const [senha, setSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');
    // Limpa os campos dentro da própria ação, quando ela volta salva: a senha
    // nova não pode ficar escrita na tela de um computador da loja.
    const [estado, acao, pendente] = useActionState(async (anterior: Resultado, form: FormData) => {
        const r = await trocarSenha(anterior, form);
        if (r.salvo) { setAtual(''); setSenha(''); setConfirmacao(''); }
        return r;
    }, inicial);

    return (
        <section className="mt-5 rounded-card border border-linha bg-superficie p-5">
            <h2 className="display text-lg font-semibold">Senha</h2>
            <p className="mt-1 text-[12px] text-tinta-2">Troque a senha que você usa para entrar.</p>

            <form action={acao} className="mt-4 flex flex-col gap-3">
                {/* Invisível, mas é o que faz o gerenciador de senhas guardar a
                    senha nova na conta certa em vez de criar outra. */}
                <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-tinta-2">Senha atual</span>
                        <input name="senhaAtual" type="password" required autoComplete="current-password"
                               value={atual} onChange={(e) => setAtual(e.target.value)}
                               aria-invalid={estado.campo === 'senhaAtual' || undefined}
                               className={`${campo} ${borda(estado.campo === 'senhaAtual')}`} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-tinta-2">Senha nova</span>
                        <input name="senha" type="password" required minLength={8} autoComplete="new-password"
                               value={senha} onChange={(e) => setSenha(e.target.value)}
                               aria-invalid={estado.campo === 'senha' || undefined}
                               className={`${campo} ${borda(estado.campo === 'senha')}`} />
                        <MedidorForcaSenha senha={senha} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-tinta-2">Repetir a senha nova</span>
                        <input name="confirmacao" type="password" required autoComplete="new-password"
                               value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                               aria-invalid={estado.campo === 'confirmacao' || undefined}
                               className={`${campo} ${borda(estado.campo === 'confirmacao')}`} />
                    </label>
                </div>

                {estado.erro && (
                    <p role="alert" className="rounded-[9px] border border-vermelho-linha bg-vermelho-sof px-3 py-2.5 text-[12.5px] text-vermelho-texto">{estado.erro}</p>
                )}
                {estado.salvo && !pendente && (
                    <p role="status" className="text-[12.5px] font-semibold text-verde">Senha trocada. Use a nova no próximo login.</p>
                )}

                <button type="submit" disabled={pendente}
                        className="self-start rounded-[9px] bg-petroleo px-4 py-2 text-xs font-semibold text-papel disabled:opacity-60">
                    {pendente ? 'Salvando…' : 'Trocar senha'}
                </button>
            </form>
        </section>
    );
}
