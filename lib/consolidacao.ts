import { z } from 'zod';

/**
 * O relatório do dia que a IA escreve para o vendedor (o "treino de hoje"):
 * o pedido, o schema e a conferência da resposta. Fora de `openai-analise.ts`,
 * que só roda no servidor, para o teste de unidade e os scripts alcançarem.
 *
 * Sem `maxLength` em texto nenhum. No schema estrito a OpenAI não reescreve
 * para caber: ela para de escrever no limite, e o vendedor recebia
 * "…faltou resposta direta a perguntas do cliente, o que ger". O tamanho é
 * pedido nas instruções (`INSTRUCOES_CONSOLIDACAO`); passar um pouco dele é
 * melhor que frase cortada.
 *
 * Crítica com lastro (auditoria de 07/10): "não oferece complementares",
 * "condições de entrega e pagamento" e "limite opções" saíam em quase todo
 * relatório sem nenhuma análise que dissesse isso. Agora cada melhoria,
 * padrão de falha e alerta volta com o número da análise e o texto exato do
 * erro (ou da evidência) que a sustenta, e `finalizarConsolidado` descarta o
 * que não bate com a análise citada.
 */

/** Item com lastro: `base` é a cópia literal de um erro ou evidência da análise `analise`. */
const schemaItemComLastro = z.object({ texto: z.string(), analise: z.number().int(), base: z.string() });
const schemaObjecao = z.object({ texto: z.string(), analises: z.array(z.number().int()) });

/** A resposta da IA, como o schema estrito devolve. */
export const schemaConsolidado = z.object({
    resumo: z.string(),
    // De 0 a 3: com três obrigatórias, dia com um erro só ganhava duas
    // melhorias de manual ("ofereça complementares").
    melhorias: z.array(schemaItemComLastro).max(3),
    elogio: z.string(),
    desafio: z.string(),
    padroes_sucesso: z.array(z.string()),
    padroes_falha: z.array(schemaItemComLastro),
    objecoes_frequentes: z.array(schemaObjecao),
    alertas: z.array(schemaItemComLastro),
});

export type RespostaConsolidacao = z.infer<typeof schemaConsolidado>;

/** Itens por lista do relatório do vendedor: o gestor lê os principais, não o inventário. */
export const MAX_ITENS_LISTA = 5;

const jsonItemComLastro = {
    type: 'object', additionalProperties: false, required: ['texto', 'analise', 'base'],
    properties: { texto: { type: 'string' }, analise: { type: 'integer' }, base: { type: 'string' } },
} as const;

export const schemaJsonConsolidado = {
    type: 'object', additionalProperties: false,
    required: ['resumo','melhorias','elogio','desafio','padroes_sucesso','padroes_falha','objecoes_frequentes','alertas'],
    properties: {
        resumo: { type: 'string' }, melhorias: { type: 'array', maxItems: 3, items: jsonItemComLastro },
        elogio: { type: 'string' }, desafio: { type: 'string' },
        // Listas com teto: sem ele, num dia com muitas conversas o modelo
        // repetia itens até estourar o max_output_tokens (Vendas Xangri-Lá, 06/10).
        padroes_sucesso: { type: 'array', maxItems: MAX_ITENS_LISTA, items: { type: 'string' } },
        padroes_falha: { type: 'array', maxItems: MAX_ITENS_LISTA, items: jsonItemComLastro },
        objecoes_frequentes: { type: 'array', maxItems: MAX_ITENS_LISTA, items: {
            type: 'object', additionalProperties: false, required: ['texto', 'analises'],
            properties: { texto: { type: 'string' }, analises: { type: 'array', items: { type: 'integer' } } },
        } },
        alertas: { type: 'array', maxItems: MAX_ITENS_LISTA, items: jsonItemComLastro },
    },
} as const;

/** De onde saiu cada crítica que ficou no relatório. */
export type Lastro = {
    melhorias: { conversa_id: string | null; base: string }[];
    padroes_falha: { conversa_id: string | null; base: string }[];
    alertas: { conversa_id: string | null; base: string }[];
    objecoes_frequentes: { conversa_ids: (string | null)[] }[];
    /** Itens que a IA mandou sem lastro na análise citada e não entraram. */
    descartados: number;
};

/** O que fica gravado em `relatorios_diarios.payload` (as telas leem listas de texto). */
export type ConsolidadoIa = {
    resumo: string;
    melhorias: string[];
    elogio: string;
    desafio: string;
    padroes_sucesso: string[];
    padroes_falha: string[];
    objecoes_frequentes: string[];
    alertas: string[];
    lastro: Lastro;
};

/*
 * Nenhuma frase daqui pode servir de conselho ao vendedor: o modelo copiava a
 * regra de formato "Termine sempre a frase: nunca deixe um texto pela metade"
 * para alertas, melhorias e desafio (11 de 12 relatórios em 07/10). Por isso
 * não há exemplo literal nem ordem dirigida a quem vende.
 */
export const INSTRUCOES_CONSOLIDACAO = [
    'Tarefa: escrever o treino do dia de um único vendedor a partir das análises das conversas dele. Os números em "metricas" já foram calculados: não recalcule nem invente.',
    'Leitor: o próprio vendedor. Português do Brasil, segunda pessoa do singular (você), tom direto, específico e construtivo. O relatório é de uma pessoa só: o texto fica no singular do começo ao fim, sem se referir a grupo de pessoas.',
    'Fonte: cada análise tem um número no campo "analise". Use somente o que as análises dizem. Problema que nenhuma análise apontou em "erros_vendedor" não vira crítica, por mais comum que seja em vendas.',
    'melhorias: de zero a três, uma por erro de "erros_vendedor", priorizando o erro que aparece em mais análises; cada uma é uma única ação, sem listas internas, em até 180 caracteres. Em "analise" vai o número da análise e em "base" a cópia exata do item de "erros_vendedor" que a sustenta. Sem erros nas análises, a lista fica vazia.',
    'Em melhorias, padroes_falha e alertas, o texto trata só do erro copiado em "base", sem juntar outro assunto que a base não menciona.',
    'padroes_falha: o que deu errado, descrito como fato, com o mesmo lastro das melhorias ("base" copiado de "erros_vendedor").',
    'alertas: riscos concretos do dia, escritos como constatação do que aconteceu (sujeito e fato), nunca como ordem nem proibição. "base" é a cópia exata de um item de "erros_vendedor" ou da "conclusao" de uma "evidencias" da análise citada.',
    'objecoes_frequentes: só objeções levantadas pelo cliente (campo "objecoes") que se repetem em pelo menos duas análises diferentes; em "analises" vão os números delas. O que o vendedor informou não é objeção do cliente. Sem repetição, a lista fica vazia.',
    'padroes_sucesso: o que funcionou, tirado de "tecnicas_usadas" e "evidencias". elogio: uma frase, até 200 caracteres, sobre algo que de fato aconteceu. desafio: uma frase, até 200 caracteres, ligada ao erro mais repetido. resumo: até 2 frases curtas, no máximo 300 caracteres no total. Resumo e desafio seguem a regra da fonte: só criticam o que está em "erros_vendedor".',
    'Priorize negociações; suporte e conversa social não viram crítica de técnica comercial.',
    'Se a entrada trouxer "captura", nos intervalos de "sem_registro" o sistema não registrou mensagem nenhuma por falha técnica: o silêncio ali não é abandono, demora nem falta de retorno ao cliente, e conversa que parece parada nesse intervalo não vira crítica.',
].join('\n');

/**
 * A entrada da IA: as análises numeradas de 1 em diante, para a resposta
 * citar de onde tirou cada crítica.
 */
export function entradaConsolidacao(analises: readonly Record<string, unknown>[], metricas: Record<string, number | null>, captura?: CapturaDoRelatorio | null): string {
    return JSON.stringify({
        metricas,
        ...(captura?.intervalos.length ? { captura: {
            aviso: 'Falha técnica: nestes intervalos nenhuma mensagem do vendedor foi registrada, nas duas direções.',
            sem_registro: captura.intervalos.map((i) => ({ de: horaDoIntervalo(i.de, false), ate: horaDoIntervalo(i.ate, true) })),
        } } : {}),
        analises: analises.map((a, i) => ({ analise: i + 1, ...a })),
    });
}

/** Os buracos de captura do dia (lib/captura.ts `capturaDoDia`), como o relatório os guarda. */
export type CapturaDoRelatorio = { intervalos: readonly { de: string; ate: string; expediente_ms: number }[] };

/** "07/10 10:56" em Brasília. O fim do dia sai "07/10 24:00", não "08/10 00:00". */
function horaDoIntervalo(iso: string, fim: boolean): string {
    const local = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
    const dois = (n: number) => String(n).padStart(2, '0');
    const meiaNoite = fim && local.getUTCHours() === 0 && local.getUTCMinutes() === 0;
    // A data é a do último instante do intervalo: meia-noite fecha o dia anterior.
    const dia = meiaNoite ? new Date(local.getTime() - 1) : local;
    const hora = meiaNoite ? '24:00' : `${dois(local.getUTCHours())}:${dois(local.getUTCMinutes())}`;
    return `${dois(dia.getUTCDate())}/${dois(dia.getUTCMonth() + 1)} ${hora}`;
}

/** O corpo do pedido à OpenAI (Responses API), igual no worker e nos scripts. */
export function pedidoConsolidacao(analises: readonly Record<string, unknown>[], metricas: Record<string, number | null>, modelo: string, captura?: CapturaDoRelatorio | null) {
    return {
        model: modelo, temperature: 0, store: false,
        instructions: INSTRUCOES_CONSOLIDACAO,
        input: [{ role: 'user', content: [{ type: 'input_text', text: entradaConsolidacao(analises, metricas, captura) }] }],
        text: { format: { type: 'json_schema', name: 'consolidado_vendedor', strict: true, schema: schemaJsonConsolidado } },
        // Uma consolidação real tem ~350 tokens (no máximo 431 até 06/10); o
        // lastro de cada item soma uns 30. Os textos não têm `maxLength`: o
        // teto é o que segura uma resposta degenerada.
        max_output_tokens: 2000,
    };
}

/**
 * Tira do texto a regra de formato que o modelo copiava ("nunca deixe um
 * texto pela metade", "termine sempre a frase") e a pontuação que sobra.
 * Devolve '' quando não resta nada.
 */
export function limparTexto(texto: string): string {
    const original = texto.trim();
    const limpo = original
        .replace(/[,;:]?[^,;:.!?]*\b(?:textos?|frases?)\s+pela\s+metade\b[^,;:.!?]*[.!]?/gi, '')
        .replace(/[,;:]?[^,;:.!?]*\btermine\s+sempre\s+a\s+frase\b[^,;:.!?]*[.!]?/gi, '')
        .replace(/["“”]\s*["“”]/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,;:."“”-]+|[\s,;:"“”-]+$/g, '');
    if (!limpo) return '';
    const comInicial = limpo[0].toUpperCase() + limpo.slice(1);
    return /[.!?]$/.test(original) && !/[.!?]$/.test(comInicial) ? `${comInicial}.` : comInicial;
}

/** Comparação tolerante a caixa, acento, espaço e pontuação final. */
function normal(s: string): string {
    return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!;,]+$/, '').trim();
}

function textos(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function conclusoes(v: unknown): string[] {
    return Array.isArray(v) ? v.flatMap((e) => (e && typeof e === 'object' && typeof (e as { conclusao?: unknown }).conclusao === 'string' ? [(e as { conclusao: string }).conclusao] : [])) : [];
}

/**
 * Os conselhos de manual que a auditoria de 07/10 achou sem lastro. Com a base
 * certa ("não ofereceu complementares"), o modelo ainda pendurava "e informe
 * condições de entrega e pagamento" no texto; item que traz um desses assuntos
 * sem que a base fale dele sai.
 */
const ASSUNTOS_DE_MANUAL = [
    /complementa/,
    /condic\w* de (?:entrega|pagamento|venda)|entrega e pagamento|pagamento e entrega/,
    /limit\w* (?:as |de )?opc/,
    /fech/,
];

function acrescentaAssunto(texto: string, base: string): boolean {
    const t = normal(texto), b = normal(base);
    return ASSUNTOS_DE_MANUAL.some((r) => r.test(t) && !r.test(b));
}

/**
 * Resumo e desafio não citam análise: a frase que traz um assunto de manual
 * que nenhum erro do dia menciona sai inteira (Keli, 07/10: "não ofereceu
 * complementares" sem um erro sequer sobre isso).
 */
function semAssuntoSemLastro(texto: string, errosDoDia: string[]): string {
    const erros = errosDoDia.map(normal);
    const frases = texto.split(/(?<=[.!?])\s+/);
    const ficam = frases.filter((f) => !ASSUNTOS_DE_MANUAL.some((r) => r.test(normal(f)) && !erros.some((e) => r.test(e))));
    return ficam.length === frases.length ? texto : ficam.join(' ');
}

/** A base aparece nas fontes da análise? Cópia exata ou um trecho dela. */
function sustenta(base: string, fontes: string[]): boolean {
    const b = normal(base);
    if (b.length < 8) return false;
    return fontes.some((f) => { const n = normal(f); return n === b || n.includes(b); });
}

/**
 * Confere a resposta da IA contra as análises que ela recebeu e devolve o que
 * vai para o relatório: crítica sem lastro na análise citada sai, objeção de
 * uma conversa só sai, e a regra de formato é tirada de todo texto.
 */
export function finalizarConsolidado(
    resposta: RespostaConsolidacao,
    analises: readonly Record<string, unknown>[],
    conversaIds: readonly (string | null)[] = [],
): ConsolidadoIa {
    let descartados = 0;
    const analise = (n: number) => (Number.isInteger(n) && n >= 1 && n <= analises.length ? analises[n - 1] : null);
    const conversa = (n: number) => conversaIds[n - 1] ?? null;

    const comLastro = (itens: RespostaConsolidacao['melhorias'], fontes: (a: Record<string, unknown>) => string[]) => {
        const ficam: { texto: string; lastro: { conversa_id: string | null; base: string } }[] = [];
        for (const item of itens) {
            const a = analise(item.analise);
            const texto = limparTexto(item.texto);
            if (!a || !texto || !sustenta(item.base, fontes(a)) || acrescentaAssunto(texto, item.base)
                || ficam.some((f) => normal(f.texto) === normal(texto))) { descartados++; continue; }
            ficam.push({ texto, lastro: { conversa_id: conversa(item.analise), base: item.base } });
        }
        return ficam;
    };
    const erros = (a: Record<string, unknown>) => textos(a.erros_vendedor);
    const melhorias = comLastro(resposta.melhorias, erros);
    const padroesFalha = comLastro(resposta.padroes_falha, erros);
    const alertas = comLastro(resposta.alertas, (a) => [...erros(a), ...conclusoes(a.evidencias)]);

    const objecoes: { texto: string; conversa_ids: (string | null)[] }[] = [];
    for (const o of resposta.objecoes_frequentes) {
        const citadas = [...new Set(o.analises)].filter((n) => textos(analise(n)?.objecoes).length > 0);
        const texto = limparTexto(o.texto);
        if (citadas.length < 2 || !texto) { descartados++; continue; }
        objecoes.push({ texto, conversa_ids: citadas.map(conversa) });
    }

    const lista = (xs: string[]) => xs.map(limparTexto).filter(Boolean);
    const errosDoDia = analises.flatMap(erros);
    return {
        resumo: semAssuntoSemLastro(limparTexto(resposta.resumo), errosDoDia),
        melhorias: melhorias.map((m) => m.texto),
        elogio: limparTexto(resposta.elogio),
        desafio: semAssuntoSemLastro(limparTexto(resposta.desafio), errosDoDia),
        padroes_sucesso: lista(resposta.padroes_sucesso),
        padroes_falha: padroesFalha.map((p) => p.texto),
        objecoes_frequentes: objecoes.map((o) => o.texto),
        alertas: alertas.map((a) => a.texto),
        lastro: {
            melhorias: melhorias.map((m) => m.lastro),
            padroes_falha: padroesFalha.map((p) => p.lastro),
            alertas: alertas.map((a) => a.lastro),
            objecoes_frequentes: objecoes.map((o) => ({ conversa_ids: o.conversa_ids })),
            descartados,
        },
    };
}

/**
 * Dia em que nenhuma mensagem do vendedor saiu (automática não conta): não há
 * atendimento para dar nota nem treino. Lidiane, 07/10: 21 mensagens de
 * entrada, nenhuma de saída, e o relatório saiu com nota 32,5 e elogio por um
 * cumprimento que não existiu.
 */
export function semAtividadeDeSaida(mensagens: readonly { direcao: string; automatica: boolean }[]): boolean {
    return !mensagens.some((m) => m.direcao === 'saida' && !m.automatica);
}
