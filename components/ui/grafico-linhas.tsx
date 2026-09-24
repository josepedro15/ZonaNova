import { caminhoSvg } from '@/lib/visual';

export type SerieGrafico = { id: string; nome: string; valores: (number | null)[]; destaque?: 'azul' | 'risco' };

const X0 = 8, X1 = 772, Y0 = 16, Y1 = 196;

/**
 * Linhas por loja. Só as séries com `destaque` ganham cor; as outras ficam
 * cinza, para o gráfico não virar arco-íris. Os rótulos não vão mais dentro
 * do SVG (ilegíveis em telas estreitas e cortados com muitas lojas): viram
 * uma legenda em HTML abaixo do gráfico, com as séries em destaque primeiro.
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
    // Legenda: destaque azul, depois risco, depois as cinzas por ordem alfabética.
    const ordem = (t?: 'azul' | 'risco') => (t === 'azul' ? 0 : t === 'risco' ? 1 : 2);
    const legenda = [...finais].sort((a, b) => {
        const d = ordem(a.s.destaque) - ordem(b.s.destaque);
        return d !== 0 ? d : a.s.nome.localeCompare(b.s.nome, 'pt-BR');
    });
    return (
        <figure className="m-0">
            {/* Altura fixa: com h-auto, numa coluna larga o gráfico passava de 350px de altura. */}
            <svg viewBox="0 0 780 212" preserveAspectRatio="none" className="h-[200px] w-full lg:h-[240px]" role="img" aria-label={rotulo}>
                {[Y0, (Y0 + Y1) / 2, Y1].map((g) => <line key={g} x1={X0} x2={X1} y1={g} y2={g} className="stroke-linha-2" vectorEffect="non-scaling-stroke" />)}
                {cinzaPrimeiro.map((s) => (
                    <path key={s.id} d={caminhoSvg(s.valores.map((v, i) => (v === null ? null : [x(i), y(v)])))} fill="none"
                          strokeWidth={s.destaque ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                          className={s.destaque === 'azul' ? 'stroke-azul' : s.destaque === 'risco' ? 'stroke-risco' : 'stroke-linha-campo'} />
                ))}
            </svg>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {legenda.map(({ s, v }) => (
                    <li key={s.id} className={`flex items-center gap-1.5 ${s.destaque === 'azul' ? 'font-bold text-azul' : s.destaque === 'risco' ? 'font-bold text-risco-texto' : 'text-tinta-2'}`}>
                        <span className={`h-[3px] w-4 rounded ${s.destaque === 'azul' ? 'bg-azul' : s.destaque === 'risco' ? 'bg-risco' : 'bg-linha-campo'}`} aria-hidden="true" />
                        {s.nome} {formato(v)}{s.destaque === 'risco' ? ' ▼' : s.destaque === 'azul' ? ' ▲' : ''}
                    </li>
                ))}
            </ul>
            <figcaption className="mt-2 flex w-full justify-between text-xs text-tinta-3"><span>{rotulosX[0]}</span><span>{rotulosX[1]}</span></figcaption>
        </figure>
    );
}
