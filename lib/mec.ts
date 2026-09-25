import { z } from 'zod';
import type { ContagemObjecao } from './derivacoes.ts';

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
- Use exatamente os códigos entre colchetes do MEC VIGENTE, e só dentro de mec_detalhe.
- O campo mec[].itens continua como sempre: frases curtas em português do que o vendedor fez naquela etapa. Nunca coloque ali códigos (sondagem_a, preco_alto…) nem nomes de campo, e não liste o que não aconteceu.
- Sondagem: uma entrada para cada uma das informações do Book. "capturada" = a informação está na conversa, perguntada pelo vendedor ou contada pelo cliente sem pergunta. capturada = true exige trecho literal.
- Pergunta aberta pede relato ("como está a obra?"); fechada pede sim/não ou escolha ("é pra área externa?"). Conte só perguntas do vendedor.
- Frase proibida: cada ocorrência literal dita pelo vendedor; mensagem [automática] não conta.
- Objeção fora do catálogo vira fora_do_catalogo com a descrição; nunca force o código mais próximo.
- ordem_correta considera só os passos presentes (cachorro, depois papagaio, depois minhoca).
- Contorno de objeções e estratégia de preço são seções provisórias do Book: meça só o que o texto diz, sem critério extra.
- Não invente: sem trecho, a resposta é false ou null.`;

export type Sinal =
    | 'sondagem_item' | 'pergunta_aberta' | 'pergunta_fechada' | 'complementar' | 'prazo' | 'condicao'
    | 'frase_proibida' | 'objecao' | 'desconto' | 'gerencia' | 'orcamento_concorrente' | 'fechamento' | 'final_positivo';

export type Observacao = {
    etapa: string; sinal: Sinal; item_chave: string | null; valor: boolean | null;
    detalhe: Record<string, unknown>; trecho: string | null;
};
export type LinhaObservacao = Observacao & { conversa_id: string };

const comTrecho = (t: string | null | undefined): string | null => (t && t.trim() ? t.trim() : null);

const normalizar = (s: string): string =>
    s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Falas do transcript de `montarTranscript` (`V: [marcas] "texto em JSON"`). */
function falasDoTranscript(transcript: string): { vendedor: boolean; automatica: boolean; texto: string }[] {
    const falas: { vendedor: boolean; automatica: boolean; texto: string }[] = [];
    for (const linha of transcript.split('\n')) {
        const m = /^(V|C):((?:\s\[[^\]]*\])*)\s(".*")$/.exec(linha);
        if (!m) continue;
        try {
            falas.push({ vendedor: m[1] === 'V', automatica: m[2].includes('[automática]'), texto: normalizar(JSON.parse(m[3]) as string) });
        } catch { /* linha cortada: fica de fora */ }
    }
    return falas;
}

/**
 * Confere as provas do detalhe contra a própria conversa antes de gravar. Na
 * chamada real a IA marcou "Algo mais?" com o trecho "nem": sem esta conferência
 * o vendedor seria punido por algo que não disse.
 * - frase proibida: o trecho tem de conter a frase do Book e estar numa fala
 *   humana do vendedor;
 * - informação da sondagem: o trecho tem de estar em alguma fala; senão, não
 *   foi capturada.
 */
export function conferirDetalhe(d: DetalheMec, transcript: string, itens: readonly ItemPlaybook[]): DetalheMec {
    const falas = falasDoTranscript(transcript);
    const doVendedor = falas.filter((f) => f.vendedor && !f.automatica).map((f) => f.texto);
    const todas = falas.map((f) => f.texto);
    const rotulo = new Map(itens.map((i) => [i.chave, normalizar(i.rotulo)]));
    const esta = (trecho: string | null, onde: string[]) => {
        const t = trecho ? normalizar(trecho) : '';
        return t !== '' && onde.some((f) => f.includes(t));
    };
    return {
        ...d,
        sondagem: {
            ...d.sondagem,
            itens: d.sondagem.itens.map((i) => (i.capturada && !esta(i.trecho, todas) ? { ...i, capturada: false, trecho: null } : i)),
        },
        solucao_completa: {
            ...d.solucao_completa,
            frases_proibidas: d.solucao_completa.frases_proibidas.filter((f) => {
                const frase = rotulo.get(f.chave);
                return esta(f.trecho, doVendedor) && (!frase || normalizar(f.trecho ?? '').includes(frase));
            }),
        },
    };
}

/** Uma linha por sinal observado: é o que vai para `mec_observacoes`. */
export function observacoesDoDetalhe(d: DetalheMec): Observacao[] {
    const o: Observacao[] = [];
    const linha = (etapa: string, sinal: Sinal, item_chave: string | null, valor: boolean | null, detalhe: Record<string, unknown> = {}, trecho: string | null = null) =>
        o.push({ etapa, sinal, item_chave, valor, detalhe, trecho });

    for (const i of d.sondagem.itens) {
        const trecho = comTrecho(i.trecho);
        // "capturada" sem prova não conta: regra de zero invenção (spec §11).
        linha('sondagem', 'sondagem_item', i.chave, i.capturada && trecho !== null, {}, trecho);
    }
    linha('sondagem', 'pergunta_aberta', null, null, { contagem: d.sondagem.perguntas_abertas });
    linha('sondagem', 'pergunta_fechada', null, null, { contagem: d.sondagem.perguntas_fechadas });

    const s = d.solucao_completa;
    for (const c of s.complementares_oferecidos) linha('solucao_completa', 'complementar', null, true, { produto: c.produto }, comTrecho(c.trecho));
    linha('solucao_completa', 'prazo', null, s.prazo_informado);
    linha('solucao_completa', 'condicao', null, s.condicao_informada);
    for (const f of s.frases_proibidas) linha('solucao_completa', 'frase_proibida', f.chave, true, {}, comTrecho(f.trecho));

    for (const x of d.objecoes) {
        linha('contorno_objecoes', 'objecao', x.codigo, true, {
            descricao: x.descricao, cachorro: x.cachorro, papagaio: x.papagaio, minhoca: x.minhoca,
            ordem_correta: x.ordem_correta, concordou_ou_criticou: x.concordou_ou_criticou, minhoca_do_catalogo: x.minhoca_do_catalogo,
        }, comTrecho(x.trecho));
    }

    const p = d.preco;
    linha('estrategia_preco', 'desconto', null, p.desconto_mencionado, {}, comTrecho(p.trecho_desconto));
    linha('estrategia_preco', 'gerencia', null, p.mencionou_gerencia);
    linha('estrategia_preco', 'orcamento_concorrente', null, p.orcamento_concorrente, { conferiu: p.conferiu_orcamento });

    const f = d.fechamento;
    linha('fechamento', 'fechamento', f.tentou ? (f.tecnica ?? OUTRA) : null, f.tentou, {}, comTrecho(f.trecho));
    linha('fechamento', 'final_positivo', null, f.final_positivo);
    return o;
}

export type DetalheDia = {
    conversas: number; conversas_com_sondagem: number;
    sondagem_por_item: Record<string, number>; perguntas_abertas_pct: number | null;
    objecoes: Record<string, number>; fora_do_catalogo: number;
    contorno_completo_pct: number | null; concordou_ou_criticou: number;
    desconto_mencionado: number; fechamento: Record<string, number>; final_positivo_pct: number | null;
};
export type ResumoMec = { sondagem_itens: number | null; frases_proibidas: number; detalhe: DetalheDia };

/** Chave de uma conversa num dia: a análise é uma por conversa por dia (`analises_conversa`). */
export function chaveConversaDia(conversaId: string, dataRef: string): string {
    return `${conversaId}|${dataRef}`;
}

/**
 * Numa janela de vários dias a unidade do resumo é (conversa, dia): uma negociação
 * que atravessa dois dias tem duas análises e não pode somar 14 itens em "7".
 * Devolve cópias com `conversa_id` trocado pela chave do dia; use só no que vai
 * para `resumirObservacoes` (links continuam com o id real).
 */
export function porConversaDia<T extends { conversa_id: string; data_ref: string }>(linhas: readonly T[]): T[] {
    return linhas.map((l) => ({ ...l, conversa_id: chaveConversaDia(l.conversa_id, l.data_ref) }));
}

const pct = (parte: number, total: number): number | null => (total ? Math.round((parte / total) * 100) : null);
const somar = (mapa: Record<string, number>, chave: string) => { mapa[chave] = (mapa[chave] ?? 0) + 1; };

/**
 * Resume as observações de um período (dia, vendedor, loja). A sondagem só
 * conta nas conversas em que ela cabia E que têm o detalhe gravado: um dia
 * misto (parte analisada antes do detalhe existir) não puxa a média para baixo.
 */
export function resumirObservacoes(linhas: readonly LinhaObservacao[], sondagemAplicavel: ReadonlySet<string>): ResumoMec {
    const itensSondagem = linhas.filter((l) => l.sinal === 'sondagem_item' && sondagemAplicavel.has(l.conversa_id));
    const comSondagem = new Set(itensSondagem.map((l) => l.conversa_id));
    const capturadas = itensSondagem.filter((l) => l.valor === true);
    const porItem: Record<string, number> = {};
    for (const chave of new Set(itensSondagem.map((l) => l.item_chave ?? ''))) {
        porItem[chave] = pct(capturadas.filter((l) => l.item_chave === chave).length, comSondagem.size) ?? 0;
    }
    const contagem = (sinal: Sinal) => linhas.filter((l) => l.sinal === sinal).reduce((s, l) => s + Number(l.detalhe.contagem ?? 0), 0);
    const abertas = contagem('pergunta_aberta');
    const fechadas = contagem('pergunta_fechada');

    const objecoes = linhas.filter((l) => l.sinal === 'objecao');
    const porCodigo: Record<string, number> = {};
    for (const o of objecoes) if (o.item_chave && o.item_chave !== FORA_DO_CATALOGO) somar(porCodigo, o.item_chave);
    const completo = objecoes.filter((o) => o.detalhe.cachorro === true && o.detalhe.papagaio === true && o.detalhe.minhoca === true && o.detalhe.ordem_correta === true);

    const fechamentos = linhas.filter((l) => l.sinal === 'fechamento');
    const porFechamento: Record<string, number> = {};
    for (const f of fechamentos) somar(porFechamento, f.valor ? (f.item_chave ?? OUTRA) : 'nenhum');
    const finais = linhas.filter((l) => l.sinal === 'final_positivo');

    return {
        sondagem_itens: comSondagem.size ? Math.round((capturadas.length / comSondagem.size) * 10) / 10 : null,
        frases_proibidas: linhas.filter((l) => l.sinal === 'frase_proibida').length,
        detalhe: {
            conversas: new Set(linhas.map((l) => l.conversa_id)).size,
            conversas_com_sondagem: comSondagem.size,
            sondagem_por_item: porItem,
            perguntas_abertas_pct: pct(abertas, abertas + fechadas),
            objecoes: porCodigo,
            fora_do_catalogo: objecoes.filter((o) => o.item_chave === FORA_DO_CATALOGO).length,
            contorno_completo_pct: pct(completo.length, objecoes.length),
            concordou_ou_criticou: objecoes.filter((o) => o.detalhe.concordou_ou_criticou === true).length,
            desconto_mencionado: linhas.filter((l) => l.sinal === 'desconto' && l.valor === true).length,
            fechamento: porFechamento,
            final_positivo_pct: pct(finais.filter((l) => l.valor === true).length, finais.length),
        },
    };
}

/** "Objeções da semana" pelo código do catálogo, com o rótulo do Book. */
export function contarObjecoesPorCodigo(
    linhas: readonly { item_chave: string | null }[], rotulos: ReadonlyMap<string, string>, quantas = 4,
): ContagemObjecao[] {
    const contagem = new Map<string, number>();
    for (const l of linhas) if (l.item_chave) contagem.set(l.item_chave, (contagem.get(l.item_chave) ?? 0) + 1);
    return [...contagem.entries()]
        .map(([chave, total]) => ({ objecao: chave === FORA_DO_CATALOGO ? 'Fora do catálogo' : rotulos.get(chave) ?? chave, total }))
        .sort((a, b) => b.total - a.total || a.objecao.localeCompare(b.objecao, 'pt-BR'))
        .slice(0, quantas);
}

/**
 * Junta duas contagens de objeções (catálogo e texto livre) pelo rótulo
 * exibido, sem diferenciar maiúsculas: soma, ordena e corta. Quem chama
 * garante que uma conversa não entra nas duas listas.
 */
export function juntarObjecoes(a: readonly ContagemObjecao[], b: readonly ContagemObjecao[], quantas = 4): ContagemObjecao[] {
    const juntas = new Map<string, ContagemObjecao>();
    for (const o of [...a, ...b]) {
        const chave = o.objecao.toLocaleLowerCase('pt-BR');
        const atual = juntas.get(chave);
        if (atual) atual.total += o.total;
        else juntas.set(chave, { objecao: o.objecao, total: o.total });
    }
    return [...juntas.values()]
        .sort((x, y) => y.total - x.total || x.objecao.localeCompare(y.objecao, 'pt-BR'))
        .slice(0, quantas);
}

/** Célula da planilha de calibração: minúscula, sem espaço, lista `a|b` em ordem. */
export function normalizarCelula(v: string): string {
    return v.toLocaleLowerCase('pt-BR').split('|').map((s) => s.trim()).filter(Boolean).sort().join('|');
}

/** % de concordância IA × humano; célula que o humano não preencheu não conta. */
export function concordancia(pares: readonly { ia: string; humano: string }[]): number | null {
    const medidos = pares.filter((p) => normalizarCelula(p.humano) !== '');
    return pct(medidos.filter((p) => normalizarCelula(p.ia) === normalizarCelula(p.humano)).length, medidos.length);
}
