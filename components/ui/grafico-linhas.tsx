import { afastarRotulos, caminhoSvg } from '@/lib/visual';

export type SerieGrafico = { id: string; nome: string; valores: (number | null)[]; destaque?: 'azul' | 'risco' };

const X0 = 8, X1 = 590, Y0 = 16, Y1 = 196;

/**
 * Linhas por loja. Só as séries com `destaque` ganham cor; as outras ficam
 * cinza, para o gráfico não virar arco-íris. O rótulo vai no fim de cada linha.
 */
export function GraficoLinhas({ series, formato, rotulosX, rotulo }: {
    series: SerieGrafico[]; formato: (n: number) => string; rotulosX: [string, string]; rotulo: string;
}) {
    const todos = series.flatMap((s) => s.valores).filter((v): v is number => v !== null);
    if (todos.length === 0) return <p className="text-sm text-tinta-3">Ainda não há semanas suficientes para comparar.</p>;
    const min = Math.min(...todos);
    const amp = Math.max(...todos) - min || 1;
    const n = Math.max(...series.map((s) => s.valores.length));
    const x = (i: number) => X0 + (n <= 1 ? 0 : (i / (n - 1)) * (X1 - X0));
    const y = (v: number) => Y1 - ((v - min) / amp) * (Y1 - Y0);
    const cinzaPrimeiro = [...series].sort((a, b) => Number(!!a.destaque) - Number(!!b.destaque));
    const finais = series.flatMap((s) => {
        for (let i = s.valores.length - 1; i >= 0; i--) { const v = s.valores[i]; if (v !== null) return [{ s, v }]; }
        return [];
    });
    const ys = afastarRotulos(finais.map((f) => y(f.v) + 4), 14);
    return (
        <figure className="m-0">
            <svg viewBox="0 0 780 212" className="h-auto w-full" role="img" aria-label={rotulo}>
                {[Y0, (Y0 + Y1) / 2, Y1].map((g) => <line key={g} x1={X0} x2={X1} y1={g} y2={g} className="stroke-linha-2" />)}
                {cinzaPrimeiro.map((s) => (
                    <path key={s.id} d={caminhoSvg(s.valores.map((v, i) => (v === null ? null : [x(i), y(v)])))} fill="none"
                          strokeWidth={s.destaque ? 3 : 2} strokeLinecap="round" strokeLinejoin="round"
                          className={s.destaque === 'azul' ? 'stroke-azul' : s.destaque === 'risco' ? 'stroke-risco' : 'stroke-linha-campo'} />
                ))}
                {finais.map((f, k) => (
                    <text key={f.s.id} x={X1 + 12} y={ys[k]}
                          className={`text-[12px] ${f.s.destaque === 'azul' ? 'fill-azul font-bold' : f.s.destaque === 'risco' ? 'fill-risco-texto font-bold' : 'fill-tinta-2'}`}>
                        {f.s.nome} {formato(f.v)}{f.s.destaque === 'risco' ? ' ▼' : f.s.destaque === 'azul' ? ' ▲' : ''}
                    </text>
                ))}
            </svg>
            <figcaption className="flex w-3/4 justify-between text-xs text-tinta-3"><span>{rotulosX[0]}</span><span>{rotulosX[1]}</span></figcaption>
        </figure>
    );
}
