import { custoEstimado } from './analise.ts';

/**
 * O custo de cada chamada paga de IA, uma linha em `custos_ia` (migration
 * 0034). A análise já guardava o seu em `analises_conversa`, mas a reanálise
 * sobrescreve; o relatório, refeito a cada análise nova do dia, guardava só a
 * última versão; áudio, mídia e descobertas não guardavam nada.
 */
export type EtapaIa = 'analise' | 'relatorio' | 'transcricao' | 'midia' | 'descobertas' | 'conversa_ia' | 'monitoramento';

export type UsoIa = { modelo: string; entrada: number; saida: number; segundos: number | null; custo: number };

/** O `usage` da transcrição: tokens nos modelos gpt-4o, duração no whisper-1. */
export type UsoTranscricao =
    | { type?: 'tokens'; input_tokens?: number; output_tokens?: number; input_token_details?: { text_tokens?: number; audio_tokens?: number } }
    | { type: 'duration'; seconds?: number };

// US$ por milhão de tokens (áudio de entrada, texto de entrada, saída), da
// tabela da OpenAI em 27/10/2026. O texto de entrada é a pista de vocabulário.
const PRECO_TRANSCRICAO: Record<string, { audio: number; texto: number; saida: number }> = {
    'gpt-4o-mini-transcribe': { audio: 3, texto: 1.25, saida: 5 },
    'gpt-4o-transcribe': { audio: 6, texto: 2.5, saida: 10 },
};
const WHISPER_POR_MINUTO = 0.006;

export function usoDaTranscricao(modelo: string, uso: UsoTranscricao | undefined): UsoIa {
    if (uso?.type === 'duration') {
        const segundos = uso.seconds ?? 0;
        return { modelo, entrada: 0, saida: 0, segundos, custo: modelo === 'whisper-1' ? (segundos / 60) * WHISPER_POR_MINUTO : 0 };
    }
    const entrada = uso?.input_tokens ?? 0;
    const saida = uso?.output_tokens ?? 0;
    const preco = PRECO_TRANSCRICAO[modelo];
    if (!preco) return { modelo, entrada, saida, segundos: null, custo: 0 };
    // Sem o detalhe, toda a entrada conta como áudio, o mais caro.
    const texto = uso?.input_token_details?.text_tokens ?? 0;
    const audio = uso?.input_token_details?.audio_tokens ?? entrada - texto;
    return { modelo, entrada, saida, segundos: null, custo: (audio * preco.audio + texto * preco.texto + saida * preco.saida) / 1_000_000 };
}

/** Uso de uma chamada cobrada por tokens (análise, relatório, mídia, descobertas). */
export function usoPorTokens(modelo: string, entrada: number, saida: number): UsoIa {
    return { modelo, entrada, saida, segundos: null, custo: custoEstimado(modelo, entrada, saida) };
}

type ClienteDeCusto = { from(tabela: 'custos_ia'): { insert(linha: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> } };

/**
 * Grava a chamada. Nunca derruba o item: a chamada já foi paga e o resultado
 * dela vale mais que a linha de custo (e a tabela pode ainda não existir até a
 * 0034 ser aplicada).
 */
export async function registrarCusto(supabase: ClienteDeCusto, etapa: EtapaIa, uso: UsoIa, onde: { referencia?: string | null; dataRef?: string | null } = {}): Promise<void> {
    try {
        const { error } = await supabase.from('custos_ia').insert({
            etapa, modelo: uso.modelo, entrada: uso.entrada, saida: uso.saida, segundos: uso.segundos,
            custo: uso.custo, referencia: onde.referencia ?? null, data_ref: onde.dataRef ?? null,
        });
        if (error) console.error(`custos_ia: falha ao gravar ${etapa}`, error.message);
    } catch (e) {
        console.error(`custos_ia: falha ao gravar ${etapa}`, e);
    }
}
