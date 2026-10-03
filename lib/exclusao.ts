import { variantesTelefone } from './painel.ts';

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
