import { media } from './visual.ts';

/**
 * Números que as telas novas mostram e que o banco não guarda pronto. Tudo
 * sai de tabelas que já existem (spec §6): nenhum backend novo. Toda função
 * devolve null quando falta dado — ausência nunca vira zero.
 */

export const NOMES_ETAPA = {
    acolhida: 'Acolhida',
    sondagem: 'Sondagem',
    solucao_completa: 'Solução completa',
    contorno_objecoes: 'Contorno de objeções',
    estrategia_preco: 'Estratégia de preço',
    fechamento: 'Fechamento',
    acompanhamento: 'Acompanhamento',
} as const;
export type Etapa = keyof typeof NOMES_ETAPA;
export const ETAPAS = Object.keys(NOMES_ETAPA) as Etapa[];

export type Valor = number | string | null | undefined;

const num = (v: Valor): number | null => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** AAAA-MM-DD menos n dias. Aritmética de calendário, sem fuso. */
export function diaMenos(dia: string, n: number): string {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

export type NotaDia = { data_ref: string; score_geral: Valor };

/** Nota do último dia com nota menos a média dos 7 dias anteriores a ele. */
export function variacaoSemanal(dias: readonly NotaDia[]): number | null {
    const comNota = dias
        .filter((d) => num(d.score_geral) !== null)
        .sort((a, b) => b.data_ref.localeCompare(a.data_ref));
    if (comNota.length < 2) return null;
    const [ultimo, ...resto] = comNota;
    const limite = diaMenos(ultimo.data_ref, 7);
    const anterior = media(resto.filter((d) => d.data_ref >= limite).map((d) => num(d.score_geral)));
    return anterior === null ? null : Math.round(num(ultimo.score_geral)! - anterior);
}

export type EtapaFraca = { etapa: Etapa; nome: string; pct: number };

/** A etapa do MEC com menor aderência. Etapa sem dado (não cabia) não conta. */
export function etapaMaisFraca(porEtapa: Record<string, Valor> | null | undefined): EtapaFraca | null {
    let pior: EtapaFraca | null = null;
    for (const etapa of ETAPAS) {
        const v = num(porEtapa?.[etapa]);
        if (v === null) continue;
        const pct = Math.round(v);
        if (!pior || pct < pior.pct) pior = { etapa, nome: NOMES_ETAPA[etapa], pct };
    }
    return pior;
}

export type Identificado = { id: string; nome: string };
export type Sugestao = { pessoa: Identificado; queda: number; etapaFraca: EtapaFraca | null };

/** Quem mais caiu na semana, e onde. É a resposta de "com quem eu falo hoje". */
export function comQuemFalar(
    pessoas: readonly Identificado[],
    notas: ReadonlyMap<string, readonly NotaDia[]>,
    etapas: ReadonlyMap<string, Record<string, Valor> | null>,
    quantos = 2,
): Sugestao[] {
    return pessoas
        .map((pessoa) => ({ pessoa, queda: variacaoSemanal(notas.get(pessoa.id) ?? []) }))
        .filter((x): x is { pessoa: Identificado; queda: number } => x.queda !== null && x.queda < 0)
        .sort((a, b) => a.queda - b.queda || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'))
        .slice(0, quantos)
        .map(({ pessoa, queda }) => ({ pessoa, queda, etapaFraca: etapaMaisFraca(etapas.get(pessoa.id)) }));
}

export type ContagemObjecao = { objecao: string; total: number };

/** Objeções mais frequentes em `analises_conversa.payload.objecoes`, uma vez por conversa. */
export function contarObjecoes(payloads: readonly unknown[], quantas = 4): ContagemObjecao[] {
    const contagem = new Map<string, ContagemObjecao>();
    for (const p of payloads) {
        const bruto = p && typeof p === 'object' ? (p as { objecoes?: unknown }).objecoes : undefined;
        if (!Array.isArray(bruto)) continue;
        const vistas = new Set<string>();
        for (const item of bruto) {
            if (typeof item !== 'string') continue;
            const texto = item.trim();
            if (!texto) continue;
            const chave = texto.toLocaleLowerCase('pt-BR');
            if (vistas.has(chave)) continue;
            vistas.add(chave);
            const atual = contagem.get(chave);
            if (atual) atual.total += 1;
            else contagem.set(chave, { objecao: texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1), total: 1 });
        }
    }
    return [...contagem.values()]
        .sort((a, b) => b.total - a.total || a.objecao.localeCompare(b.objecao, 'pt-BR'))
        .slice(0, quantas);
}

type ComData = { data_ref: string };

/** Média de (fim − janela, fim] menos a média de (fim − 2·janela, fim − janela]. */
export function variacaoDoPeriodo<T extends ComData>(
    linhas: readonly T[], valor: (l: T) => Valor, fim: string, janela: number,
): number | null {
    const corte = diaMenos(fim, janela);
    const inicio = diaMenos(fim, 2 * janela);
    const agora = media(linhas.filter((l) => l.data_ref > corte && l.data_ref <= fim).map((l) => num(valor(l))));
    const antes = media(linhas.filter((l) => l.data_ref > inicio && l.data_ref <= corte).map((l) => num(valor(l))));
    return agora === null || antes === null ? null : agora - antes;
}

/** Médias semanais terminando em `fim`, da mais antiga à mais recente. */
export function serieSemanal<T extends ComData>(
    linhas: readonly T[], valor: (l: T) => Valor, fim: string, semanas = 12,
): (number | null)[] {
    return Array.from({ length: semanas }, (_, w) => {
        const ate = diaMenos(fim, 7 * (semanas - 1 - w));
        const de = diaMenos(fim, 7 * (semanas - w));
        return media(linhas.filter((l) => l.data_ref > de && l.data_ref <= ate).map((l) => num(valor(l))));
    });
}

export type Destaque = { id: string; nome: string; variacao: number };

/** A loja que mais melhorou, a que mais piorou e as sem gestor ativo. */
export function destaquesDaRede<T extends ComData & { unidade_id: string }>(
    unidades: readonly Identificado[],
    linhas: readonly T[],
    valor: (l: T) => Valor,
    melhorQuando: 'maior' | 'menor',
    fim: string,
    janela: number,
    comGestor: ReadonlySet<string>,
): { variacoes: Map<string, number | null>; subiu: Destaque | null; caiu: Destaque | null; semGestor: Identificado[] } {
    const ganho = (v: number) => (melhorQuando === 'maior' ? v : -v);
    const variacoes = new Map<string, number | null>();
    let subiu: Destaque | null = null;
    let caiu: Destaque | null = null;
    for (const u of unidades) {
        const v = variacaoDoPeriodo(linhas.filter((l) => l.unidade_id === u.id), valor, fim, janela);
        variacoes.set(u.id, v);
        if (v === null || v === 0) continue;
        if (ganho(v) > 0 && (!subiu || ganho(v) > ganho(subiu.variacao))) subiu = { id: u.id, nome: u.nome, variacao: v };
        if (ganho(v) < 0 && (!caiu || ganho(v) < ganho(caiu.variacao))) caiu = { id: u.id, nome: u.nome, variacao: v };
    }
    return { variacoes, subiu, caiu, semGestor: unidades.filter((u) => !comGestor.has(u.id)) };
}
