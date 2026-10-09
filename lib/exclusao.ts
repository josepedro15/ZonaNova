import type { SupabaseClient } from '@supabase/supabase-js';
import { PREFIXO_LID, semTelefone, variantesTelefone } from './painel.ts';

/**
 * As três razões para uma conversa não ser atendimento:
 * - `pessoais`: a lista do próprio vendedor (contatos_bloqueados);
 * - `internos`: a lista da unidade, cadastrada pelo gestor (Depósito, caixa);
 * - `colegas`: o número de outro vendedor conectado — conversa de trabalho.
 */
export type ListasDeExclusao = { pessoais: string[]; internos: string[]; colegas: string[] };

/**
 * O contato está fora da análise? Uma regra só para o webhook, o bloqueio e o
 * desbloqueio: se cada um decidisse do seu jeito, tirar o Depósito da lista
 * pessoal o devolvia ao painel mesmo ele estando na lista da loja.
 *
 * Compara com e sem o nono dígito, como o bloqueio pessoal já fazia.
 */
export function estaFora(telefone: string, listas: ListasDeExclusao): boolean {
    const dele = new Set(variantesTelefone(telefone));
    return [...listas.pessoais, ...listas.internos, ...listas.colegas]
        .some((t) => variantesTelefone(t).some((v) => dele.has(v)));
}

/** Um contato como uma conversa do vendedor o guarda: telefone (ou `lid:`) e o LID, se ligado (0031). */
export type ContatoConhecido = { telefone: string; lid: string | null };

const lidDe = (c: ContatoConhecido) => c.lid ?? (semTelefone(c.telefone) ? c.telefone.slice(PREFIXO_LID.length) : null);

/**
 * Todos os nomes de um contato: o telefone (ou `lid:`), o `lid:` do LID e o
 * que as conversas do vendedor já ligam a eles (`conversas.cliente_lid`).
 *
 * O LID é a mesma pessoa que o telefone. Bloquear o número tem de barrar a
 * mensagem que chega só pelo LID — history, reinjeção da recuperação, webhook
 * sem `chat` —, e bloquear a conversa `lid:` tem de barrar a que chega pelo
 * número. Foi o Marco (09/10): o Rafael bloqueado pelo telefone voltava pelo LID.
 */
export function nomesDoContato(contato: ContatoConhecido, conhecidos: ContatoConhecido[]): string[] {
    const lid = lidDe(contato);
    const variantes = new Set(variantesTelefone(contato.telefone));
    const nomes = new Set([contato.telefone]);
    if (lid) nomes.add(`${PREFIXO_LID}${lid}`);
    for (const c of conhecidos) {
        const lidDele = lidDe(c);
        const mesmo = (!!lid && lidDele === lid) || variantesTelefone(c.telefone).some((v) => variantes.has(v));
        if (!mesmo) continue;
        nomes.add(c.telefone);
        if (lidDele) nomes.add(`${PREFIXO_LID}${lidDele}`);
    }
    return [...nomes];
}

/** As listas com os outros nomes de cada contato nelas (ver `nomesDoContato`). */
export function comNomesConhecidos(listas: ListasDeExclusao, conhecidos: ContatoConhecido[]): ListasDeExclusao {
    if (!conhecidos.length) return listas;
    const expandir = (lista: string[]) => [...new Set(lista.flatMap((t) => nomesDoContato({ telefone: t, lid: null }, conhecidos)))];
    return { pessoais: expandir(listas.pessoais), internos: expandir(listas.internos), colegas: expandir(listas.colegas) };
}

/** 42703 vem do Postgres; PGRST204 é como o PostgREST diz o mesmo. */
const COLUNA_AUSENTE = new Set(['42703', 'PGRST204']);

/**
 * As conversas do vendedor que ligam LID e telefone a algum destes nomes
 * (telefones ou `lid:`). Sem a coluna `cliente_lid` (0031 não aplicada),
 * nenhuma: a regra volta a ser só pelo telefone.
 */
export async function contatosConhecidos(db: SupabaseClient, userId: string, nomes: string[]): Promise<ContatoConhecido[]> {
    // Só dígitos nos dois: o filtro `or` do PostgREST não pode receber vírgula nem parêntese.
    const telefones = [...new Set(nomes.filter((n) => !semTelefone(n)).flatMap(variantesTelefone))].filter(Boolean);
    const lids = [...new Set(nomes.filter(semTelefone).map((n) => n.slice(PREFIXO_LID.length).replace(/\D/g, '')))].filter(Boolean);
    const filtros = [
        ...(telefones.length ? [`cliente_telefone.in.(${telefones.join(',')})`] : []),
        ...(lids.length ? [`cliente_lid.in.(${lids.join(',')})`] : []),
    ];
    if (!filtros.length) return [];
    const { data, error } = await db.from('conversas').select('cliente_telefone, cliente_lid')
        .eq('user_id', userId).not('cliente_lid', 'is', null).or(filtros.join(','))
        .returns<{ cliente_telefone: string; cliente_lid: string }[]>();
    if (error) {
        if (COLUNA_AUSENTE.has(error.code)) return [];
        throw error;
    }
    return (data ?? []).map((c) => ({ telefone: c.cliente_telefone, lid: c.cliente_lid }));
}
