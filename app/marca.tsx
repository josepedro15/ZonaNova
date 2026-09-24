import Image from 'next/image';
import logo from '@/public/marca/logo.png';
import logoBranco from '@/public/marca/logo-branco.png';

/**
 * A marca, num sítio só: o logo oficial da Redemac Zona Nova (PNG do site,
 * 428×204). `invertida` usa a versão de letras brancas, para fundo azul.
 * A API é a mesma da marca provisória, e as páginas não precisaram mudar.
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
    const largura = tamanho === 'md' ? 168 : 104;
    const imagem = (
        <Image src={invertida ? logoBranco : logo} alt="Redemac Zona Nova" width={largura} priority />
    );
    if (!legenda) return imagem;
    const texto = (
        <span className={`text-xs ${invertida ? 'text-white/65' : 'text-tinta-3'}`}>{legenda}</span>
    );
    return orientacao === 'vertical' ? (
        <div className="flex flex-col items-center gap-3">{imagem}{texto}</div>
    ) : (
        <div className="flex items-center gap-3">
            {imagem}
            <span className={`h-7 w-px ${invertida ? 'bg-white/25' : 'bg-linha'}`} aria-hidden="true" />
            {texto}
        </div>
    );
}
