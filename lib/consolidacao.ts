import { z } from 'zod';

/**
 * O formato do relatório do dia que a IA escreve para o vendedor (o "treino de
 * hoje"). Fora de `openai-analise.ts`, que só roda no servidor, para o teste
 * de unidade alcançar o schema.
 *
 * Sem `maxLength` em texto nenhum. No schema estrito a OpenAI não reescreve
 * para caber: ela para de escrever no limite, e o vendedor recebia
 * "…faltou resposta direta a perguntas do cliente, o que ger". O tamanho é
 * pedido nas instruções (`INSTRUCOES_CONSOLIDACAO`); passar um pouco dele é
 * melhor que frase cortada.
 */
export const schemaConsolidado = z.object({
    resumo: z.string(),
    melhorias: z.array(z.string()).length(3),
    elogio: z.string(),
    desafio: z.string(),
    padroes_sucesso: z.array(z.string()),
    padroes_falha: z.array(z.string()),
    objecoes_frequentes: z.array(z.string()),
    alertas: z.array(z.string()),
});

/** Itens por lista do relatório do vendedor: o gestor lê os principais, não o inventário. */
export const MAX_ITENS_LISTA = 5;

export const schemaJsonConsolidado = {
    type: 'object', additionalProperties: false,
    required: ['resumo','melhorias','elogio','desafio','padroes_sucesso','padroes_falha','objecoes_frequentes','alertas'],
    properties: {
        resumo: { type: 'string' }, melhorias: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
        elogio: { type: 'string' }, desafio: { type: 'string' },
        // Listas com teto: sem ele, num dia com muitas conversas o modelo
        // repetia itens até estourar o max_output_tokens (Vendas Xangri-Lá, 06/10).
        padroes_sucesso: { type: 'array', maxItems: MAX_ITENS_LISTA, items: { type: 'string' } }, padroes_falha: { type: 'array', maxItems: MAX_ITENS_LISTA, items: { type: 'string' } },
        objecoes_frequentes: { type: 'array', maxItems: MAX_ITENS_LISTA, items: { type: 'string' } }, alertas: { type: 'array', maxItems: MAX_ITENS_LISTA, items: { type: 'string' } },
    },
} as const;

export type ConsolidadoIa = z.infer<typeof schemaConsolidado>;

export const INSTRUCOES_CONSOLIDACAO = 'Você é um treinador comercial. Os números já foram calculados: não recalcule nem invente. Escreva em português do Brasil, tom direto, específico e construtivo. Use somente os fatos e evidências das análises recebidas. Cada melhoria deve conter uma única ação, sem listas internas, em até 180 caracteres. Priorize negociações; suporte e conversa social não viram crítica de técnica comercial. Resumo em até 2 frases curtas, com no máximo 300 caracteres no total; elogio e desafio em 1 frase cada, com no máximo 200 caracteres. Termine sempre a frase: nunca deixe um texto pela metade.';
