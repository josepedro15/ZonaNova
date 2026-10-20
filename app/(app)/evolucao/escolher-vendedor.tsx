'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import type { Vendedor } from '@/lib/evolucao';

/**
 * De quem é a evolução na tela: a equipe toda ou um vendedor. Troca na hora,
 * mantendo o período. Com vendedores de mais de uma loja, agrupa por loja.
 */
export function EscolherVendedor({ vendedores, atual, periodo, base = '/evolucao' }: {
    vendedores: Vendedor[]; atual: string | null; periodo: number; base?: string;
}) {
    const router = useRouter();
    const lojas = [...new Set(vendedores.map((v) => v.unidade ?? 'Sem loja'))];
    const opcao = (v: Vendedor) => <option key={v.id} value={v.id}>{v.nome}</option>;
    return (
        <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-linha bg-superficie px-3 text-[13px] font-semibold text-tinta-2">
            <span>Ver</span>
            <select id="evolucao-vendedor" value={atual ?? ''}
                    onChange={(e) => {
                        const [caminho, fixos] = base.split('?');
                        const p = new URLSearchParams(fixos);
                        p.set('periodo', String(periodo));
                        if (e.target.value) p.set('vendedor', e.target.value);
                        router.push(`${caminho}?${p}` as Route);
                    }}
                    className="max-w-[220px] min-h-10 bg-transparent font-semibold text-tinta focus-visible:outline-2 focus-visible:outline-azul">
                <option value="">Equipe toda</option>
                {lojas.length > 1
                    ? lojas.map((loja) => (
                        <optgroup key={loja} label={loja}>{vendedores.filter((v) => (v.unidade ?? 'Sem loja') === loja).map(opcao)}</optgroup>
                    ))
                    : vendedores.map(opcao)}
            </select>
        </label>
    );
}
