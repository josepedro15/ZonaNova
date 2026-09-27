/**
 * As contas da tela Evolução — sem I/O.
 *
 * Tudo sai de linhas diárias já fechadas (`relatorios_*`, `aderencia_diaria`).
 * Duas regras atravessam o arquivo: dia sem relatório não é dia com nota zero,
 * e média de tempo ou de taxa é ponderada por leads (a regra do rollup da rede).
 */

import { diaMenos, ETAPAS, NOMES_ETAPA, type Etapa, type Valor } from './derivacoes.ts';
import { media } from './visual.ts';

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

/** `?periodo=` da URL; qualquer outra coisa cai nos 30 dias. */
export function periodoDe(param: string | string[] | undefined): Periodo {
    const n = Number(Array.isArray(param) ? param[0] : param);
    return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

const num = (v: Valor): number | null => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export type Dia = {
    data_ref: string;
    score_geral: Valor;
    leads_atendidos: Valor;
    conversoes_confirmadas: Valor;
    oportunidades_perdidas: Valor;
    tempo_medio_resposta_s: Valor;
    taxa_resposta: Valor;
};

/** As linhas com `data_ref` em (fim − dias, fim]. */
export function noIntervalo<T extends { data_ref: string }>(linhas: readonly T[], fim: string, dias: number): T[] {
    const corte = diaMenos(fim, dias);
    return linhas.filter((l) => l.data_ref > corte && l.data_ref <= fim);
}

export type Resumo = {
    diasComRelatorio: number;
    diasComNota: number;
    nota: number | null;
    leads: number;
    conversoes: number;
    perdidas: number;
    respostaS: number | null;
    taxa: number | null;
};

/** Média ponderada por leads (mínimo 1): um dia de 2 leads não pesa o mesmo que um de 20. */
function ponderada(linhas: readonly Dia[], campo: 'tempo_medio_resposta_s' | 'taxa_resposta'): number | null {
    let soma = 0, peso = 0;
    for (const l of linhas) {
        const v = num(l[campo]);
        if (v === null) continue;
        const p = Math.max(1, num(l.leads_atendidos) ?? 0);
        soma += v * p;
        peso += p;
    }
    return peso ? soma / peso : null;
}

/** O período em números. A nota é média simples dos dias: cada dia é um relatório. */
export function resumir(linhas: readonly Dia[]): Resumo {
    const total = (campo: 'leads_atendidos' | 'conversoes_confirmadas' | 'oportunidades_perdidas') =>
        linhas.reduce((s, l) => s + (num(l[campo]) ?? 0), 0);
    const notas = linhas.map((l) => num(l.score_geral)).filter((n): n is number => n !== null);
    return {
        diasComRelatorio: linhas.length,
        diasComNota: notas.length,
        nota: media(notas),
        leads: total('leads_atendidos'),
        conversoes: total('conversoes_confirmadas'),
        perdidas: total('oportunidades_perdidas'),
        respostaS: ponderada(linhas, 'tempo_medio_resposta_s'),
        taxa: ponderada(linhas, 'taxa_resposta'),
    };
}

/** Diferença entre dois valores que podem faltar. Sem os dois, não há comparação. */
export function delta(atual: number | null, anterior: number | null): number | null {
    return atual === null || anterior === null ? null : atual - anterior;
}

export type DiaDestaque = { data_ref: string; nota: number; leads: number; conversoes: number; perdidas: number };

const destaque = (l: Dia): DiaDestaque => ({
    data_ref: l.data_ref,
    nota: Math.round(num(l.score_geral)!),
    leads: num(l.leads_atendidos) ?? 0,
    conversoes: num(l.conversoes_confirmadas) ?? 0,
    perdidas: num(l.oportunidades_perdidas) ?? 0,
});

/** Melhor e pior dia com nota. Empate fica com o mais recente. Com um dia só, não há par. */
export function melhorEPior(linhas: readonly Dia[]): { melhor: DiaDestaque; pior: DiaDestaque } | null {
    const comNota = linhas.filter((l) => num(l.score_geral) !== null)
        .sort((a, b) => b.data_ref.localeCompare(a.data_ref));
    if (comNota.length < 2) return null;
    let melhor = comNota[0], pior = comNota[0];
    for (const l of comNota) {
        if (num(l.score_geral)! > num(melhor.score_geral)!) melhor = l;
        if (num(l.score_geral)! < num(pior.score_geral)!) pior = l;
    }
    return melhor === pior ? null : { melhor: destaque(melhor), pior: destaque(pior) };
}

export const NOTA_BOA = 70;

/**
 * Quantos dias com nota seguidos, do mais recente para trás, ficaram em
 * `corte` ou mais. Dia sem relatório (folga, domingo) não quebra a sequência:
 * só conta o que foi trabalhado. `desde` é o primeiro dia dela.
 */
export function sequenciaAtual(linhas: readonly Dia[], corte = NOTA_BOA): { dias: number; desde: string | null } {
    const comNota = linhas.filter((l) => num(l.score_geral) !== null)
        .sort((a, b) => b.data_ref.localeCompare(a.data_ref));
    let dias = 0;
    let desde: string | null = null;
    for (const l of comNota) {
        if (num(l.score_geral)! < corte) break;
        dias += 1;
        desde = l.data_ref;
    }
    return { dias, desde };
}

/** 0 = domingo … 6 = sábado, de um AAAA-MM-DD, sem depender do fuso da máquina. */
export function diaDaSemana(dataRef: string): number {
    const [a, m, d] = dataRef.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const NOMES_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export type NotaSemana = { dia: number; nome: string; nota: number; dias: number };

/** Nota média por dia da semana, de segunda a domingo; só os dias da semana que tiveram nota. */
export function notaPorDiaDaSemana(linhas: readonly Dia[]): NotaSemana[] {
    const grupos = new Map<number, number[]>();
    for (const l of linhas) {
        const n = num(l.score_geral);
        if (n === null) continue;
        const d = diaDaSemana(l.data_ref);
        grupos.set(d, [...(grupos.get(d) ?? []), n]);
    }
    return [1, 2, 3, 4, 5, 6, 0]
        .filter((d) => grupos.has(d))
        .map((d) => ({ dia: d, nome: NOMES_SEMANA[d], nota: Math.round(media(grupos.get(d)!)!), dias: grupos.get(d)!.length }));
}

/**
 * O dia da semana que fica para trás: pelo menos `margem` pontos abaixo da
 * média dos outros, com pelo menos dois dias de nota para não ser um dia ruim
 * isolado. Sem um destaque claro, null — a tela não inventa padrão.
 */
export function diaMaisFraco(semana: readonly NotaSemana[], margem = 5): (NotaSemana & { abaixo: number }) | null {
    const validos = semana.filter((s) => s.dias >= 2);
    if (validos.length < 3) return null;
    const pior = validos.reduce((a, b) => (b.nota < a.nota ? b : a));
    const outros = media(validos.filter((s) => s !== pior).map((s) => s.nota))!;
    const abaixo = Math.round(outros - pior.nota);
    return abaixo >= margem ? { ...pior, abaixo } : null;
}

/** Média da segunda metade do período menos a da primeira. Precisa de duas notas em cada. */
export function viradaDoPeriodo(linhas: readonly Dia[], fim: string, dias: number): number | null {
    const metade = Math.floor(dias / 2);
    const notas = (xs: Dia[]) => xs.map((l) => num(l.score_geral)).filter((n): n is number => n !== null);
    const segunda = notas(noIntervalo(linhas, fim, metade));
    const primeira = notas(noIntervalo(linhas, diaMenos(fim, metade), dias - metade));
    if (primeira.length < 2 || segunda.length < 2) return null;
    return Math.round(media(segunda)! - media(primeira)!);
}

export type DiaMec = { data_ref: string; aderencia_geral: Valor; por_etapa: Record<string, Valor> | null };
export type Mec = { geral: number | null; porEtapa: Record<Etapa, number | null> };

/**
 * Aderência do período: a média dos dias em que a etapa coube. Etapa que não
 * coube em dia nenhum fica null ("n/v" na tela), nunca zero.
 */
export function mecDoPeriodo(dias: readonly DiaMec[]): Mec {
    const porEtapa = Object.fromEntries(ETAPAS.map((e) => {
        const m = media(dias.map((d) => num(d.por_etapa?.[e])));
        return [e, m === null ? null : Math.round(m)];
    })) as Record<Etapa, number | null>;
    const geral = media(dias.map((d) => num(d.aderencia_geral)));
    return { geral: geral === null ? null : Math.round(geral), porEtapa };
}

export type MudancaEtapa = { etapa: Etapa; nome: string; delta: number };

/** A etapa que mais subiu e a que mais caiu contra o período anterior. */
export function mudancasDoMec(atual: Mec, anterior: Mec): { subiu: MudancaEtapa | null; caiu: MudancaEtapa | null } {
    let subiu: MudancaEtapa | null = null;
    let caiu: MudancaEtapa | null = null;
    for (const e of ETAPAS) {
        const d = delta(atual.porEtapa[e], anterior.porEtapa[e]);
        if (d === null || d === 0) continue;
        if (d > 0 && (!subiu || d > subiu.delta)) subiu = { etapa: e, nome: NOMES_ETAPA[e], delta: d };
        if (d < 0 && (!caiu || d < caiu.delta)) caiu = { etapa: e, nome: NOMES_ETAPA[e], delta: d };
    }
    return { subiu, caiu };
}

/** Tempo de resposta em português de balcão: "45 s", "4 min", "1 h 20 min". */
export function tempoCurto(segundos: number): string {
    const s = Math.round(segundos);
    if (s < 60) return `${s} s`;
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}
