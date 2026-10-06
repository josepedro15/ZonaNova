import { forcaDaSenha } from '@/lib/forca-senha';

// Cor por nível do medidor: vermelho só para o que o servidor recusa ou que cai
// fácil; âmbar para o mínimo aceito; verde daí para cima.
const corDoNivel = ['', 'bg-vermelho', 'bg-ambar', 'bg-verde', 'bg-verde'];
const textoDoNivel = ['', 'text-vermelho', 'text-ambar-texto', 'text-verde', 'text-verde'];

/** Os quatro traços e o rótulo de força embaixo do campo de senha nova. */
export function MedidorForcaSenha({ senha }: { senha: string }) {
    const forca = forcaDaSenha(senha);
    if (forca.nivel === 0) return null;
    return (
        <>
            <div className="mt-0.5 flex gap-1" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                    <div key={n} className={`h-1 flex-1 rounded-full ${n <= forca.nivel ? corDoNivel[forca.nivel] : 'bg-linha'}`} />
                ))}
            </div>
            <span className={`text-xs font-medium ${textoDoNivel[forca.nivel]}`}>{forca.rotulo}</span>
        </>
    );
}
