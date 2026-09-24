export type DiaSerie = { dia: string; nota: number | null; temRelatorio: boolean };

/**
 * Nota diária em barras. Dia sem relatório é um traço no chão; dia com
 * relatório e sem nota (só suporte ou social) é tracejado. Nota zero e "não
 * houve nota" não são a mesma coisa.
 */
export function SerieDias({ dias, invertida = false }: { dias: DiaSerie[]; invertida?: boolean }) {
    const cor = invertida
        ? { cheia: 'bg-white/35', ultima: 'bg-white', vazia: 'bg-white/20', tracejo: 'border-white/45' }
        : { cheia: 'bg-azul/30', ultima: 'bg-azul', vazia: 'bg-linha', tracejo: 'border-tinta-3' };
    return (
        <div className="flex h-12 items-end gap-1.5" role="img" aria-label={`Nota dos últimos ${dias.length} dias`}>
            {dias.map((d, i) => {
                const rotulo = `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${!d.temRelatorio ? 'sem relatório' : d.nota === null ? 'sem nota' : `nota ${d.nota}`}`;
                if (!d.temRelatorio) return <span key={d.dia} title={rotulo} className={`h-0.5 min-w-1.5 flex-1 rounded ${cor.vazia}`} />;
                if (d.nota === null) return <span key={d.dia} title={rotulo} className={`h-1/4 min-w-1.5 flex-1 rounded-sm border border-dashed ${cor.tracejo}`} />;
                return <span key={d.dia} title={rotulo} className={`min-w-1.5 flex-1 rounded-sm ${i === dias.length - 1 ? cor.ultima : cor.cheia}`} style={{ height: `${Math.max(8, d.nota)}%` }} />;
            })}
        </div>
    );
}
