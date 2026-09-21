/**
 * A marca, num sítio só.
 *
 * O monograma "ZN", as cores e a tipografia são **placeholder**: não existe
 * logo, paleta nem fonte reais da Zona Nova (ver `design/README.md`). Estavam
 * copiados à mão em quatro páginas, o que faria a troca ser uma caça ao rato.
 * Agora a identidade entra por aqui e pelos tokens de `app/globals.css` — e
 * mais nada precisa mudar.
 *
 * Quando a marca real chegar: trocar o <span>ZN</span> por um <Image> ou <svg>
 * do logo, e os valores dos tokens `petroleo`/`papel`/`--font-display`.
 */
export default function Marca({
    tamanho = 'sm',
    orientacao = 'horizontal',
    legenda,
    invertida = false,
}: {
    tamanho?: 'sm' | 'md';
    orientacao?: 'horizontal' | 'vertical';
    legenda?: string;
    invertida?: boolean;
}) {
    const grande = tamanho === 'md';

    const simbolo = (
        <div
            className={`flex items-center justify-center bg-petroleo ${
                grande ? 'size-12 rounded-[13px]' : 'size-[26px] rounded-[7px]'
            }`}
        >
            <span className={`display font-bold text-papel ${grande ? 'text-[19px]' : 'text-[13px]'}`}>
                ZN
            </span>
        </div>
    );

    const nome = (
        <div className={`flex flex-col ${orientacao === 'vertical' ? 'items-center gap-0.5' : ''}`}>
            <span className={`display font-semibold ${invertida ? 'text-papel' : ''} ${grande ? 'text-[18px]' : 'text-sm'}`}>
                Zona Nova
            </span>
            {legenda && (
                <span className={`${invertida ? 'text-white/55' : 'text-tinta-3'} ${grande ? 'text-xs' : 'text-[11px]'}`}>{legenda}</span>
            )}
        </div>
    );

    return orientacao === 'vertical' ? (
        <div className="flex flex-col items-center gap-3">{simbolo}{nome}</div>
    ) : (
        <div className="flex items-center gap-2.5">{simbolo}{nome}</div>
    );
}
