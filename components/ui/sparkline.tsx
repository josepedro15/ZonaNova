import { caminhoSvg } from '@/lib/visual';

export function Sparkline({ valores, rotulo, invertida = false }: { valores: (number | null)[]; rotulo: string; invertida?: boolean }) {
    const nums = valores.filter((v): v is number => v !== null);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const amp = Math.max(...nums) - min || 1;
    const x = (i: number) => (i / (valores.length - 1)) * 300;
    const y = (v: number) => 70 - ((v - min) / amp) * 60;
    return (
        <svg viewBox="0 0 300 80" preserveAspectRatio="none" className={`h-16 w-full ${invertida ? 'text-white' : 'text-azul'}`} role="img" aria-label={rotulo}>
            <path d={caminhoSvg(valores.map((v, i) => (v === null ? null : [x(i), y(v)])))} fill="none" stroke="currentColor"
                  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}
