/**
 * Medidor de força da tela de nova senha (design/Senha.dc.html, passo 3).
 *
 * É só uma dica visual: quem barra senha curta é o schemaNovaSenha no servidor,
 * e o Supabase tem a política dele. Por isso a conta é simples de propósito —
 * comprimento e variedade — em vez de puxar uma biblioteca de entropia para
 * uma barrinha de quatro traços.
 */
export type Forca = { nivel: 0 | 1 | 2 | 3 | 4; rotulo: string };

export function forcaDaSenha(senha: string): Forca {
    if (!senha) return { nivel: 0, rotulo: '' };
    if (senha.length < 8) return { nivel: 1, rotulo: 'Curta demais' };

    // "aaaaaaaa" e "12121212" passam no mínimo de 8, mas caem em segundos.
    if (new Set(senha).size < 4) return { nivel: 1, rotulo: 'Fácil de adivinhar' };

    const variedade = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
        .filter((r) => r.test(senha)).length;

    let nivel = 2;
    if (senha.length >= 12) nivel++;
    if (variedade >= 3) nivel++;

    if (nivel === 2) return { nivel: 2, rotulo: 'Aceitável' };
    if (nivel === 3) return { nivel: 3, rotulo: 'Boa senha' };
    return { nivel: 4, rotulo: 'Senha forte' };
}
