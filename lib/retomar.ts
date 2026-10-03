/**
 * "Retomar contato": a negociação que esfriou. O cliente está há pelo menos
 * 30 dias sem conversa com o vendedor (combinado com a Redemac em 02/10/2026),
 * a última análise não a deu por vendida, perdida nem encerrada, e ela ainda
 * não passou de 90 dias — depois disso a lista vira arquivo morto.
 *
 * Sai sozinha: quando o vendedor escreve, `ultima_mensagem_em` anda e a
 * conversa deixa de ter 30 dias.
 */
export const DIAS_PARA_RETOMAR = 30;
export const DIAS_LIMITE_RETOMAR = 90;

const DIA = 24 * 60 * 60 * 1000;
const EM_ABERTO = new Set(['em_andamento', 'lead_frio', 'sem_resposta']);
const PESO_POTENCIAL: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

export type AnaliseResumo = {
    data_ref: string;
    tipo_conversa: string | null;
    status: string | null;
    potencial_venda: string | null;
    score_oportunidade: number | null;
};

export type CandidataRetomar = {
    id: string;
    cliente_nome: string | null;
    cliente_telefone: string;
    ultima_mensagem_em: string;
    analises_conversa?: AnaliseResumo[];
};

export type ItemRetomar = { conversa: CandidataRetomar; dias: number; analise: AnaliseResumo };

/** O intervalo de `ultima_mensagem_em` que a consulta deve buscar. */
export function janelaRetomar(agora: Date): { de: Date; ate: Date } {
    return {
        de: new Date(agora.getTime() - DIAS_LIMITE_RETOMAR * DIA),
        ate: new Date(agora.getTime() - DIAS_PARA_RETOMAR * DIA),
    };
}

export function paraRetomar(conversas: CandidataRetomar[], agora: Date): ItemRetomar[] {
    const { de, ate } = janelaRetomar(agora);
    return conversas
        .flatMap((c): ItemRetomar[] => {
            const quando = new Date(c.ultima_mensagem_em);
            if (quando > ate || quando < de) return [];
            // A última análise diz como a negociação ficou.
            const analise = [...(c.analises_conversa ?? [])].sort((a, b) => b.data_ref.localeCompare(a.data_ref))[0];
            if (!analise || analise.tipo_conversa !== 'negociacao' || !EM_ABERTO.has(analise.status ?? '')) return [];
            return [{ conversa: c, dias: Math.floor((agora.getTime() - quando.getTime()) / DIA), analise }];
        })
        .sort((a, b) =>
            (PESO_POTENCIAL[a.analise.potencial_venda ?? ''] ?? 3) - (PESO_POTENCIAL[b.analise.potencial_venda ?? ''] ?? 3)
            || (b.analise.score_oportunidade ?? 0) - (a.analise.score_oportunidade ?? 0)
            || a.dias - b.dias);
}
