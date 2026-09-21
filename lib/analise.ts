import { createHash } from 'node:crypto';
import { z } from 'zod';

export type MensagemAnalise = {
    direcao: 'entrada' | 'saida';
    tipo: string;
    conteudo: string | null;
    transcricao: string | null;
    automatica: boolean;
    enviada_em: string;
};

export const schemaAnalise = z.object({
    tipo_conversa: z.enum(['negociacao', 'suporte', 'social']),
    status: z.enum(['em_andamento', 'venda_feita', 'lead_frio', 'sem_resposta', 'perdida', 'encerrada']),
    sentiment: z.number().int().min(0).max(100),
    score_atendimento: z.number().int().min(0).max(100),
    score_oportunidade: z.number().int().min(0).max(100),
    score_risco: z.number().int().min(0).max(100),
    estagio_funil: z.string(),
    potencial_venda: z.enum(['baixo', 'medio', 'alto']),
    urgencia: z.number().int().min(1).max(5),
    resumo: z.string(),
    destaque: z.string(),
    proxima_acao: z.string(),
    script_sugerido: z.string(),
    objecoes: z.array(z.string()),
    tecnicas_usadas: z.array(z.string()),
    erros_vendedor: z.array(z.string()),
    tags: z.array(z.string()),
    evidencias: z.array(z.object({ trecho: z.string(), conclusao: z.string() })).min(1).max(5),
    mec: z.array(z.object({
        etapa: z.enum(['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']),
        aplicavel: z.boolean(),
        aplicado: z.enum(['sim', 'parcial', 'nao', 'nao_verificavel']),
        justificativa: z.string(),
        evidencias: z.array(z.string()),
        itens: z.array(z.string()),
    })).length(7),
});

export type ResultadoAnalise = z.infer<typeof schemaAnalise>;

export const schemaJsonAnalise = {
    type: 'object', additionalProperties: false,
    required: ['tipo_conversa','status','sentiment','score_atendimento','score_oportunidade','score_risco','estagio_funil','potencial_venda','urgencia','resumo','destaque','proxima_acao','script_sugerido','objecoes','tecnicas_usadas','erros_vendedor','tags','evidencias','mec'],
    properties: {
        tipo_conversa: { type: 'string', enum: ['negociacao','suporte','social'] },
        status: { type: 'string', enum: ['em_andamento','venda_feita','lead_frio','sem_resposta','perdida','encerrada'] },
        sentiment: { type: 'integer', minimum: 0, maximum: 100 },
        score_atendimento: { type: 'integer', minimum: 0, maximum: 100 },
        score_oportunidade: { type: 'integer', minimum: 0, maximum: 100 },
        score_risco: { type: 'integer', minimum: 0, maximum: 100 },
        estagio_funil: { type: 'string' },
        potencial_venda: { type: 'string', enum: ['baixo','medio','alto'] },
        urgencia: { type: 'integer', minimum: 1, maximum: 5 },
        resumo: { type: 'string' }, destaque: { type: 'string' }, proxima_acao: { type: 'string' }, script_sugerido: { type: 'string' },
        objecoes: { type: 'array', items: { type: 'string' } }, tecnicas_usadas: { type: 'array', items: { type: 'string' } },
        erros_vendedor: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } },
        evidencias: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['trecho','conclusao'], properties: { trecho: { type: 'string' }, conclusao: { type: 'string' } } } },
        mec: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['etapa','aplicavel','aplicado','justificativa','evidencias','itens'], properties: {
            etapa: { type: 'string', enum: ['acolhida','sondagem','solucao_completa','contorno_objecoes','estrategia_preco','fechamento','acompanhamento'] },
            aplicavel: { type: 'boolean' }, aplicado: { type: 'string', enum: ['sim','parcial','nao','nao_verificavel'] }, justificativa: { type: 'string' },
            evidencias: { type: 'array', items: { type: 'string' } }, itens: { type: 'array', items: { type: 'string' } },
        } } },
    },
} as const;

export function dataEmSaoPaulo(instante: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(instante);
}

export function janelaDoDia(dataRef: string): { inicio: Date; fim: Date } {
    const inicio = new Date(`${dataRef}T00:00:00-03:00`);
    return { inicio, fim: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}

export function montarTranscript(mensagens: MensagemAnalise[]): string {
    return [...mensagens].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em)).map((m) => {
        const ator = m.direcao === 'saida' ? 'V' : 'C';
        const automatico = m.automatica ? '[automática] ' : '';
        let conteudo = m.conteudo?.trim() ?? '';
        if (m.tipo === 'audio') conteudo = `[Mídia: áudio]${m.transcricao ? ` (Transcrição: ${JSON.stringify(m.transcricao)})` : ' (sem transcrição)'}`;
        else if (m.tipo !== 'texto') conteudo = `[Mídia: ${m.tipo}]${conteudo ? ` ${conteudo}` : ''}`;
        return `${ator}: ${automatico}${conteudo || '[sem conteúdo textual]'}`;
    }).join('\n');
}

export function hashTranscript(transcript: string): string {
    return createHash('sha256').update(transcript).digest('hex');
}

export function custoEstimado(modelo: string, entrada: number, saida: number): number {
    // Preços do snapshot GPT-4.1 mini em 2026-09-21. Mantidos aqui para que o
    // custo gravado seja reprodutível; modelo desconhecido fica sem estimativa.
    if (!modelo.startsWith('gpt-4.1-mini')) return 0;
    return (entrada * 0.40 + saida * 1.60) / 1_000_000;
}
