/**
 * Regras de apresentação, puras e testadas: que tom uma espera tem, se uma
 * variação é boa ou ruim, onde grifar uma evidência. Os componentes de
 * components/ui só chamam estas funções — regra de negócio não mora em JSX.
 */

export type Tom = 'bom' | 'atencao' | 'risco' | 'neutro' | 'azul';
export type Sentido = 'maior' | 'menor';

const MINUTO = 60 * 1000;

/** Até 30 min é o normal do balcão; até 2 h pede atenção; depois o lead esfria. */
export function tomEspera(ms: number): Tom {
    if (ms <= 30 * MINUTO) return 'neutro';
    if (ms <= 120 * MINUTO) return 'atencao';
    return 'risco';
}

/** Faixa de nota ou percentual: abaixo de `risco` é risco; abaixo de `atencao`, atenção. */
export function tomFaixa(valor: number, risco: number, atencao: number): Tom {
    if (valor < risco) return 'risco';
    if (valor < atencao) return 'atencao';
    return 'azul';
}

/** Tom de uma variação. `menor` é para o que melhora caindo (tempo de resposta). */
export function tomDelta(delta: number | null, melhorQuando: Sentido): Tom {
    if (delta === null || delta === 0) return 'neutro';
    return (melhorQuando === 'maior') === (delta > 0) ? 'bom' : 'risco';
}

/** Tempo médio de resposta de uma pessoa ou loja: acima de 15 min pede atenção. */
export function tomResposta(minutos: number): Tom {
    return minutos > 15 ? 'atencao' : 'neutro';
}

/** A seta acompanha a cor: quem não distingue as cores lê a seta. */
export function setaDoTom(tom: Tom): '▲' | '▼' | '=' {
    if (tom === 'bom') return '▲';
    if (tom === 'risco') return '▼';
    return '=';
}

/** Compara dois tempos em minutos, em português de balcão. */
export function comparaTempo(atual: number, base: number, referencia = 'sua média'): string {
    const a = Math.round(atual);
    const b = Math.round(base);
    if (a === b) return `sem mudança (${referencia}: ${b} min)`;
    if (b > 0 && a >= 2 * b) return `${Math.round(a / b)}× mais lenta que ${referencia} (${b} min)`;
    if (a > 0 && b >= 2 * a) return `${Math.round(b / a)}× mais rápida que ${referencia} (${b} min)`;
    return `${Math.abs(a - b)} min mais ${a > b ? 'lenta' : 'rápida'} que ${referencia}`;
}

/** Média do que é número. O PostgREST às vezes manda `numeric` como texto. */
export function media(valores: readonly (number | string | null | undefined)[]): number | null {
    const xs = valores
        .map((v) => (typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

/**
 * Duas letras para o avatar, ou null quando o cliente ainda não tem nome.
 * Sem nome, um ícone de pessoa é mais honesto do que dígitos de telefone
 * disfarçados de iniciais.
 */
export function iniciais(nome: string | null | undefined): string | null {
    const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return null;
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export type Pedaco = { texto: string; grifo: number | null };

/** Tira aspas e reticências que a IA põe em volta do trecho citado. */
function limparTrecho(trecho: string): string {
    let t = trecho.trim();
    for (let i = 0; i < 2; i++) {
        t = t.replace(/^["“”'«»]+|["“”'«»]+$/g, '').replace(/^(\.\.\.|…)+|(\.\.\.|…)+$/g, '').trim();
    }
    return t;
}

const TRECHO_MINIMO = 4;

/**
 * Parte o texto de uma mensagem nos pedaços que a análise citou. `grifo` é o
 * número da evidência (a ordem da lista, a partir de 1). Só grifa com
 * correspondência exata, ignorando maiúsculas: grifar errado é pior que não
 * grifar. Trecho curto ("ok") casaria em todo lado e é ignorado.
 */
export function grifar(texto: string, trechos: readonly string[]): Pedaco[] {
    const baixo = texto.toLocaleLowerCase('pt-BR');
    const achados: { ini: number; fim: number; grifo: number }[] = [];
    trechos.forEach((trecho, i) => {
        const alvo = limparTrecho(trecho);
        if (alvo.length < TRECHO_MINIMO) return;
        const ini = baixo.indexOf(alvo.toLocaleLowerCase('pt-BR'));
        if (ini < 0) return;
        const fim = ini + alvo.length;
        if (achados.some((a) => ini < a.fim && fim > a.ini)) return;
        achados.push({ ini, fim, grifo: i + 1 });
    });
    achados.sort((a, b) => a.ini - b.ini);
    const pedacos: Pedaco[] = [];
    let pos = 0;
    for (const a of achados) {
        if (a.ini > pos) pedacos.push({ texto: texto.slice(pos, a.ini), grifo: null });
        pedacos.push({ texto: texto.slice(a.ini, a.fim), grifo: a.grifo });
        pos = a.fim;
    }
    if (pos < texto.length || pedacos.length === 0) pedacos.push({ texto: texto.slice(pos), grifo: null });
    return pedacos;
}

/** Grifa a conversa inteira: cada evidência só na primeira mensagem onde aparece. */
export function grifarConversa(textos: readonly string[], trechos: readonly string[]): Pedaco[][] {
    const usados = new Set<number>();
    return textos.map((texto) => {
        const disponiveis = trechos.map((t, i) => (usados.has(i + 1) ? '' : t));
        const pedacos = grifar(texto, disponiveis);
        for (const p of pedacos) if (p.grifo !== null) usados.add(p.grifo);
        return pedacos;
    });
}

const um = (n: number) => Math.round(n * 10) / 10;

/** `d` de um <path>: `null` é buraco na série, e a linha recomeça depois dele. */
export function caminhoSvg(pontos: readonly ([number, number] | null)[]): string {
    const partes: string[] = [];
    let aberto = false;
    for (const p of pontos) {
        if (!p) { aberto = false; continue; }
        partes.push(`${aberto ? 'L' : 'M'}${um(p[0])} ${um(p[1])}`);
        aberto = true;
    }
    return partes.join(' ');
}
