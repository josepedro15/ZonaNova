import 'server-only';
import { z } from 'zod';
import type { ResultadoComDetalhe } from '@/lib/analise';
import type { ItemPlaybook } from '@/lib/mec';
import type { SinalContato } from '@/lib/natureza';
import { MODELO_PADRAO, pedidoAnalise } from '@/lib/pedido-analise';
import { finalizarConsolidado, pedidoConsolidacao, schemaConsolidado, type CapturaDoRelatorio, type ConsolidadoIa } from '@/lib/consolidacao';

type Uso = { input_tokens?: number; output_tokens?: number };

/**
 * Resposta cortada no meio (`status: incomplete`, em geral por bater no
 * `max_output_tokens`). Com temperatura 0, repetir dá o mesmo corte: o worker
 * trata como falha definitiva em vez de pagar mais três tentativas iguais.
 */
export class RespostaIncompleta extends Error {}

function textoDaResposta(resposta: unknown): string {
    const r = resposta as { status?: string; incomplete_details?: { reason?: string }; output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] };
    if (r.status === 'incomplete') throw new RespostaIncompleta(`OpenAI devolveu resposta incompleta: ${r.incomplete_details?.reason ?? 'motivo não informado'}`);
    if (r.output_text) return r.output_text;
    for (const item of r.output ?? []) for (const conteudo of item.content ?? []) {
        if (conteudo.type === 'output_text' && conteudo.text) return conteudo.text;
    }
    throw new Error('OpenAI não devolveu texto estruturado');
}

export async function analisarConversa({ transcript, doutrina, itens, midia = false, contato = null }: { transcript: string; doutrina: string; itens: readonly ItemPlaybook[] | null; midia?: boolean; contato?: SinalContato | null }): Promise<{ resultado: ResultadoComDetalhe; modelo: string; entrada: number; saida: number }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
    const modelo = process.env.OPENAI_MODEL || MODELO_PADRAO;
    const { schema, corpo: pedido } = pedidoAnalise({ transcript, doutrina, itens, midia, modelo, contato });

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(pedido),
    });
    const corpo = await response.json();
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(corpo).slice(0, 500)}`);
    const uso = (corpo as { usage?: Uso }).usage;
    return {
        resultado: schema.zod.parse(JSON.parse(textoDaResposta(corpo))),
        modelo,
        entrada: uso?.input_tokens ?? 0,
        saida: uso?.output_tokens ?? 0,
    };
}

/**
 * O treino do dia do vendedor. `analises` são os payloads na ordem em que a IA
 * os numera; `conversaIds`, na mesma ordem, vão para o lastro gravado.
 */
export async function consolidarVendedor(analises: Record<string, unknown>[], metricas: Record<string, number | null>, conversaIds: string[] = [], captura: CapturaDoRelatorio | null = null): Promise<{ resultado: ConsolidadoIa; modelo: string; entrada: number; saida: number }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
    const modelo = process.env.OPENAI_MODEL || MODELO_PADRAO;
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(pedidoConsolidacao(analises, metricas, modelo, captura)),
    });
    const corpo = await response.json();
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(corpo).slice(0, 500)}`);
    const uso = (corpo as { usage?: Uso }).usage;
    const resposta = schemaConsolidado.parse(JSON.parse(textoDaResposta(corpo)));
    return { resultado: finalizarConsolidado(resposta, analises, conversaIds), modelo, entrada: uso?.input_tokens ?? 0, saida: uso?.output_tokens ?? 0 };
}

const schemaDescobertas = z.object({ descobertas: z.array(z.object({
    tipo: z.enum(['fora_do_script_deu_certo','no_script_deu_errado','objecao_fora_do_catalogo','minhoca_inventada']),
    hipotese: z.string(), conversas_suporte: z.number().int().min(1),
    conversao_com: z.number().min(0).max(100).nullable(), conversao_sem: z.number().min(0).max(100).nullable(),
    evidencias: z.array(z.string()).min(3).max(5),
})).max(12) });
const schemaJsonDescobertas={type:'object',additionalProperties:false,required:['descobertas'],properties:{descobertas:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['tipo','hipotese','conversas_suporte','conversao_com','conversao_sem','evidencias'],properties:{tipo:{type:'string',enum:['fora_do_script_deu_certo','no_script_deu_errado','objecao_fora_do_catalogo','minhoca_inventada']},hipotese:{type:'string'},conversas_suporte:{type:'integer',minimum:1},conversao_com:{type:['number','null'],minimum:0,maximum:100},conversao_sem:{type:['number','null'],minimum:0,maximum:100},evidencias:{type:'array',minItems:3,maxItems:5,items:{type:'string'}}}}}}}as const;
export async function descobrirPraticas(resumos:unknown[]){const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw new Error('OPENAI_API_KEY não configurada');const modelo=process.env.OPENAI_MODEL||'gpt-4.1-mini-2025-04-14';const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:modelo,temperature:0,store:false,instructions:'Minere padrões semanais de atendimento comercial sem inventar. Procure: prática fora do script que converteu; script seguido que falhou; objeção fora do catálogo; reversão criativa que precedeu venda. Só produza hipótese com pelo menos 3 evidências textuais presentes nos dados. Correlação não é causa.',input:[{role:'user',content:[{type:'input_text',text:JSON.stringify(resumos)}]}],text:{format:{type:'json_schema',name:'descobertas_semanais',strict:true,schema:schemaJsonDescobertas}}})});const corpo=await response.json();if(!response.ok)throw new Error(`OpenAI ${response.status}: ${JSON.stringify(corpo).slice(0,500)}`);return schemaDescobertas.parse(JSON.parse(textoDaResposta(corpo))).descobertas}
