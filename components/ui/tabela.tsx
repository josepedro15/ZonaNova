import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Cartao } from './cartao';

export type LinhaTabela = { chave: string; href?: string; celulas: ReactNode[]; resumo?: ReactNode; atenuada?: boolean };

/**
 * Tabela em grade: `grade` é o grid-template-columns. Com `resumo` nas linhas,
 * o celular mostra o resumo empilhado no lugar da grade; sem ele, a grade
 * rola na horizontal a partir de `larguraMin`.
 */
export function Tabela({ titulo, acao, colunas, grade, linhas, vazio, larguraMin }: {
    titulo?: ReactNode; acao?: ReactNode; colunas: string[]; grade: string; linhas: LinhaTabela[]; vazio: ReactNode; larguraMin?: number;
}) {
    const compacta = linhas.some((l) => l.resumo !== undefined);
    const grid = compacta ? 'hidden sm:grid' : 'grid';
    return (
        <Cartao recuo="nenhum" className="overflow-hidden">
            {(titulo || acao) && (
                <div className="flex items-center justify-between gap-3 px-5 py-4 lg:px-6">
                    {titulo && <h2 className="display text-lg font-bold">{titulo}</h2>}
                    {acao}
                </div>
            )}
            {linhas.length === 0 ? (
                <div className="border-t border-linha-2 px-5 py-6 text-sm text-tinta-3 lg:px-6">{vazio}</div>
            ) : (
                <div className={compacta ? '' : 'overflow-x-auto'}>
                    <div style={{ minWidth: compacta ? undefined : larguraMin }}>
                        <div className={`${grid} gap-3 bg-fundo px-5 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-tinta-3 lg:px-6`}
                             style={{ gridTemplateColumns: grade }}>
                            {colunas.map((c) => <span key={c}>{c}</span>)}
                        </div>
                        {linhas.map((l) => {
                            const cor = l.atenuada ? 'bg-fundo/60 text-tinta-3' : '';
                            const celulas = l.celulas.map((c, i) => <span key={i} className="min-w-0">{c}</span>);
                            const linhaGrade = `${grid} items-center gap-3 border-t border-linha-2 px-5 py-3.5 text-sm lg:px-6 ${cor} ${l.href ? 'hover:bg-fundo' : ''}`;
                            const resumo = compacta && (
                                <div className={`border-t border-linha-2 px-5 py-3 sm:hidden ${cor}`}>{l.resumo}</div>
                            );
                            if (l.href) {
                                return (
                                    <Link key={l.chave} href={l.href as Route} className="block text-tinta">
                                        {resumo}
                                        <span className={linhaGrade} style={{ gridTemplateColumns: grade }}>{celulas}</span>
                                    </Link>
                                );
                            }
                            return (
                                <div key={l.chave}>
                                    {resumo}
                                    <div className={linhaGrade} style={{ gridTemplateColumns: grade }}>{celulas}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Cartao>
    );
}
