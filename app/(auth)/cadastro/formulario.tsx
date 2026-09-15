'use client';

import { useActionState } from 'react';
import { cadastrar, type Resultado } from '@/app/actions/auth';
import type { Unidade } from '@/lib/tipos';

const inicial: Resultado = {};
const campo = 'min-h-[46px] rounded-[10px] border border-linha-campo bg-superficie px-3.5 text-[15px]';
const rotulo = 'text-xs font-semibold text-tinta-2';

export default function FormularioCadastro({ unidades }: { unidades: Pick<Unidade, 'id' | 'nome' | 'cidade' | 'uf'>[] }) {
    const [estado, acao, pendente] = useActionState(cadastrar, inicial);

    return (
        <form action={acao} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
                <span className={rotulo}>Nome completo</span>
                <input name="nome" required autoComplete="name" className={campo} />
            </label>

            <label className="flex flex-col gap-1.5">
                <span className={rotulo}>E-mail</span>
                <input name="email" type="email" required autoComplete="email" className={campo} />
            </label>

            <label className="flex flex-col gap-1.5">
                <span className={rotulo}>WhatsApp comercial</span>
                <input name="telefone" required placeholder="(54) 9 9711-3082" autoComplete="tel" className={campo} />
            </label>

            <label className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                    <span className={rotulo}>Unidade onde você trabalha</span>
                    <span className="text-[11px] font-semibold text-ocre">obrigatório</span>
                </div>
                <select name="unidadeId" required defaultValue="" className={campo}>
                    <option value="" disabled>Escolha sua unidade</option>
                    {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.nome}{u.cidade ? ` — ${u.cidade}/${u.uf}` : ''}
                        </option>
                    ))}
                </select>
                <span className="text-xs leading-snug text-tinta-3">
                    Seu gestor precisa aprovar antes de você entrar. Escolha com cuidado.
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className={rotulo}>Senha</span>
                <input name="senha" type="password" required minLength={8} autoComplete="new-password" className={campo} />
                <span className="text-xs text-tinta-3">Mínimo de 8 caracteres.</span>
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
                {pendente ? 'Criando…' : 'Criar conta'}
            </button>
        </form>
    );
}
