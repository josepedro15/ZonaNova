import { z } from 'zod';

/**
 * MEC estruturado (spec docs/superpowers/specs/2026-09-24-mec-estruturado-design.md).
 * Os códigos vêm do playbook vigente no banco (`playbook_itens.chave`): quando o
 * Book mudar, a análise acompanha sem deploy. Tudo aqui é puro e testado.
 */

export type TipoItem = 'informacao' | 'frase_proibida' | 'objecao' | 'tecnica' | 'regra';
export type ItemPlaybook = { chave: string; tipo: TipoItem; rotulo: string; etapa: string };

export const FORA_DO_CATALOGO = 'fora_do_catalogo';
const OUTRA = 'outra';

export function chavesDoTipo(itens: readonly ItemPlaybook[], tipo: TipoItem): string[] {
    return itens.filter((i) => i.tipo === tipo).map((i) => i.chave);
}

/** `MEC_DETALHE_UNIDADES`: vazio desliga; `*` liga tudo; senão ids separados por vírgula (piloto). */
export function detalheLigado(unidadeId: string, config: string | undefined): boolean {
    const valor = (config ?? '').trim();
    if (!valor) return false;
    if (valor === '*') return true;
    return valor.split(',').map((s) => s.trim()).includes(unidadeId);
}

/** O Book 1 marca contorno e preço como provisórios; o seed escreve isso na descrição da etapa. */
export function etapaProvisoria(descricao: string | null | undefined): boolean {
    return /provis[óo]ri/i.test(descricao ?? '');
}

const textoOuNulo = { type: ['string', 'null'] } as const;
const enumOuTexto = (chaves: string[]) => (chaves.length ? { type: 'string', enum: chaves } : { type: 'string' });

/** JSON Schema (modo strict da OpenAI) do bloco mec_detalhe, com os enums do playbook. */
export function schemaJsonDetalhe(itens: readonly ItemPlaybook[]): Record<string, unknown> {
    const informacoes = chavesDoTipo(itens, 'informacao');
    const frases = chavesDoTipo(itens, 'frase_proibida');
    const objecoes = [...chavesDoTipo(itens, 'objecao'), FORA_DO_CATALOGO];
    const tecnicas = [...chavesDoTipo(itens, 'tecnica'), OUTRA];
    const itemFrase = {
        type: 'object', additionalProperties: false, required: ['chave', 'trecho'],
        properties: { chave: enumOuTexto(frases), trecho: { type: 'string' } },
    };
    return {
        type: 'object', additionalProperties: false,
        required: ['sondagem', 'solucao_completa', 'objecoes', 'preco', 'fechamento'],
        properties: {
            sondagem: {
                type: 'object', additionalProperties: false,
                required: ['aplicavel', 'itens', 'perguntas_abertas', 'perguntas_fechadas'],
                properties: {
                    aplicavel: { type: 'boolean' },
                    itens: {
                        type: 'array', minItems: informacoes.length, maxItems: informacoes.length,
                        items: {
                            type: 'object', additionalProperties: false, required: ['chave', 'capturada', 'trecho'],
                            properties: { chave: enumOuTexto(informacoes), capturada: { type: 'boolean' }, trecho: textoOuNulo },
                        },
                    },
                    perguntas_abertas: { type: 'integer', minimum: 0 },
                    perguntas_fechadas: { type: 'integer', minimum: 0 },
                },
            },
            solucao_completa: {
                type: 'object', additionalProperties: false,
                required: ['complementares_oferecidos', 'prazo_informado', 'condicao_informada', 'frases_proibidas'],
                properties: {
                    complementares_oferecidos: {
                        type: 'array', items: {
                            type: 'object', additionalProperties: false, required: ['produto', 'trecho'],
                            properties: { produto: { type: 'string' }, trecho: { type: 'string' } },
                        },
                    },
                    prazo_informado: { type: 'boolean' },
                    condicao_informada: { type: 'boolean' },
                    frases_proibidas: frases.length ? { type: 'array', items: itemFrase } : { type: 'array', maxItems: 0, items: itemFrase },
                },
            },
            objecoes: {
                type: 'array', items: {
                    type: 'object', additionalProperties: false,
                    required: ['codigo', 'descricao', 'trecho', 'cachorro', 'papagaio', 'minhoca', 'ordem_correta', 'concordou_ou_criticou', 'minhoca_do_catalogo'],
                    properties: {
                        codigo: { type: 'string', enum: objecoes }, descricao: { type: 'string' }, trecho: { type: 'string' },
                        cachorro: { type: 'boolean' }, papagaio: { type: 'boolean' }, minhoca: { type: 'boolean' },
                        ordem_correta: { type: 'boolean' }, concordou_ou_criticou: { type: 'boolean' },
                        minhoca_do_catalogo: { type: ['boolean', 'null'] },
                    },
                },
            },
            preco: {
                type: 'object', additionalProperties: false,
                required: ['desconto_mencionado', 'trecho_desconto', 'mencionou_gerencia', 'orcamento_concorrente', 'conferiu_orcamento'],
                properties: {
                    desconto_mencionado: { type: 'boolean' }, trecho_desconto: textoOuNulo,
                    mencionou_gerencia: { type: 'boolean' }, orcamento_concorrente: { type: 'boolean' },
                    conferiu_orcamento: { type: ['boolean', 'null'] },
                },
            },
            fechamento: {
                type: 'object', additionalProperties: false,
                required: ['tentou', 'tecnica', 'trecho', 'final_positivo'],
                properties: {
                    tentou: { type: 'boolean' },
                    tecnica: { type: ['string', 'null'], enum: [...tecnicas, null] },
                    trecho: textoOuNulo,
                    final_positivo: { type: 'boolean' },
                },
            },
        },
    };
}

const enumZ = (chaves: string[]) => (chaves.length ? z.enum(chaves as [string, ...string[]]) : z.string());

/** O mesmo contrato em Zod: a resposta da OpenAI passa por aqui antes de ser gravada. */
export function schemaDetalhe(itens: readonly ItemPlaybook[]) {
    const informacoes = chavesDoTipo(itens, 'informacao');
    const frases = chavesDoTipo(itens, 'frase_proibida');
    const objecoes = [...chavesDoTipo(itens, 'objecao'), FORA_DO_CATALOGO];
    const tecnicas = [...chavesDoTipo(itens, 'tecnica'), OUTRA];
    const frase = z.object({ chave: enumZ(frases), trecho: z.string() });
    return z.object({
        sondagem: z.object({
            aplicavel: z.boolean(),
            itens: z.array(z.object({ chave: enumZ(informacoes), capturada: z.boolean(), trecho: z.string().nullable() }))
                .length(informacoes.length)
                .refine((xs) => new Set(xs.map((x) => x.chave)).size === xs.length, 'cada informação da sondagem aparece uma vez'),
            perguntas_abertas: z.number().int().min(0),
            perguntas_fechadas: z.number().int().min(0),
        }),
        solucao_completa: z.object({
            complementares_oferecidos: z.array(z.object({ produto: z.string(), trecho: z.string() })),
            prazo_informado: z.boolean(),
            condicao_informada: z.boolean(),
            frases_proibidas: frases.length ? z.array(frase) : z.array(frase).max(0),
        }),
        objecoes: z.array(z.object({
            codigo: z.enum(objecoes as [string, ...string[]]), descricao: z.string(), trecho: z.string(),
            cachorro: z.boolean(), papagaio: z.boolean(), minhoca: z.boolean(),
            ordem_correta: z.boolean(), concordou_ou_criticou: z.boolean(), minhoca_do_catalogo: z.boolean().nullable(),
        })),
        preco: z.object({
            desconto_mencionado: z.boolean(), trecho_desconto: z.string().nullable(),
            mencionou_gerencia: z.boolean(), orcamento_concorrente: z.boolean(), conferiu_orcamento: z.boolean().nullable(),
        }),
        fechamento: z.object({
            tentou: z.boolean(), tecnica: z.enum(tecnicas as [string, ...string[]]).nullable(),
            trecho: z.string().nullable(), final_positivo: z.boolean(),
        }),
    });
}

export type DetalheMec = z.infer<ReturnType<typeof schemaDetalhe>>;

/** Regras do detalhe que se somam às REGRAS INEGOCIÁVEIS da análise (spec §4). */
export const REGRAS_DETALHE_MEC = `DETALHE DO MEC (campo mec_detalhe):
- Preencha só se tipo_conversa = negociacao; senão devolva mec_detalhe = null.
- Use exatamente os códigos entre colchetes do MEC VIGENTE.
- Sondagem: uma entrada para cada uma das informações do Book. "capturada" = a informação está na conversa, perguntada pelo vendedor ou contada pelo cliente sem pergunta. capturada = true exige trecho literal.
- Pergunta aberta pede relato ("como está a obra?"); fechada pede sim/não ou escolha ("é pra área externa?"). Conte só perguntas do vendedor.
- Frase proibida: cada ocorrência literal dita pelo vendedor; mensagem [automática] não conta.
- Objeção fora do catálogo vira fora_do_catalogo com a descrição; nunca force o código mais próximo.
- ordem_correta considera só os passos presentes (cachorro, depois papagaio, depois minhoca).
- Contorno de objeções e estratégia de preço são seções provisórias do Book: meça só o que o texto diz, sem critério extra.
- Não invente: sem trecho, a resposta é false ou null.`;
