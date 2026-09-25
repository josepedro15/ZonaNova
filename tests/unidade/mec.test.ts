/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    chavesDoTipo, detalheLigado, etapaProvisoria, schemaDetalhe, schemaJsonDetalhe, FORA_DO_CATALOGO, type ItemPlaybook,
    concordancia, contarObjecoesPorCodigo, normalizarCelula, observacoesDoDetalhe, resumirObservacoes, type DetalheMec, type LinhaObservacao,
    chaveConversaDia, porConversaDia,
} from '../../lib/mec.ts';
import { montarSchemaAnalise } from '../../lib/analise.ts';

export const SONDAGEM = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((l) => `sondagem_${l}`);
export const ITENS: ItemPlaybook[] = [
    ...SONDAGEM.map((chave) => ({ chave, tipo: 'informacao' as const, rotulo: `Info ${chave}`, etapa: 'sondagem' })),
    { chave: 'algo_mais', tipo: 'frase_proibida', rotulo: 'Algo mais?', etapa: 'solucao_completa' },
    { chave: 'preco_alto', tipo: 'objecao', rotulo: 'Preço alto', etapa: 'contorno_objecoes' },
    { chave: 'pensar', tipo: 'objecao', rotulo: 'Vou pensar', etapa: 'contorno_objecoes' },
    { chave: 'direto', tipo: 'tecnica', rotulo: 'Fechamento direto', etapa: 'fechamento' },
    { chave: 'opcoes', tipo: 'tecnica', rotulo: 'Limitação de opções', etapa: 'fechamento' },
];
export const DETALHE = {
    sondagem: {
        aplicavel: true,
        itens: SONDAGEM.map((chave, i) => ({ chave, capturada: i < 3, trecho: i < 3 ? `trecho ${i}` : null })),
        perguntas_abertas: 2, perguntas_fechadas: 3,
    },
    solucao_completa: {
        complementares_oferecidos: [{ produto: 'rolo', trecho: 'leva o rolo junto' }],
        prazo_informado: true, condicao_informada: false,
        frases_proibidas: [{ chave: 'algo_mais', trecho: 'algo mais?' }],
    },
    objecoes: [
        { codigo: 'preco_alto', descricao: 'achou caro', trecho: 'tá caro', cachorro: true, papagaio: true, minhoca: true,
          ordem_correta: true, concordou_ou_criticou: false, minhoca_do_catalogo: true },
        { codigo: FORA_DO_CATALOGO, descricao: 'sem lugar para o caminhão', trecho: 'não tem onde parar', cachorro: false,
          papagaio: false, minhoca: true, ordem_correta: true, concordou_ou_criticou: true, minhoca_do_catalogo: false },
    ],
    preco: { desconto_mencionado: true, trecho_desconto: 'faço 5%', mencionou_gerencia: false, orcamento_concorrente: false, conferiu_orcamento: null },
    fechamento: { tentou: true, tecnica: 'opcoes', trecho: 'entrego ou vocês retiram?', final_positivo: true },
};

test('chaves do playbook por tipo', () => {
    assert.deepEqual(chavesDoTipo(ITENS, 'objecao'), ['preco_alto', 'pensar']);
    assert.equal(chavesDoTipo(ITENS, 'informacao').length, 7);
});

test('interruptor por unidade: vazio desliga, * liga tudo, lista liga só as listadas', () => {
    assert.equal(detalheLigado('u1', undefined), false);
    assert.equal(detalheLigado('u1', '  '), false);
    assert.equal(detalheLigado('u1', '*'), true);
    assert.equal(detalheLigado('u1', 'u0, u1'), true);
    assert.equal(detalheLigado('u2', 'u0,u1'), false);
});

test('seção provisória do Book é detectada pela descrição da etapa', () => {
    assert.equal(etapaProvisoria('Aplicar cachorro... Seção provisória do Book.'), true);
    assert.equal(etapaProvisoria('Cumprimentar e manter tom cordial.'), false);
    assert.equal(etapaProvisoria(null), false);
});

test('JSON Schema leva os códigos do playbook como enum', () => {
    const s = schemaJsonDetalhe(ITENS) as any;
    const itensSondagem = s.properties.sondagem.properties.itens;
    assert.equal(itensSondagem.minItems, 7);
    assert.equal(itensSondagem.maxItems, 7);
    assert.deepEqual(itensSondagem.items.properties.chave.enum, SONDAGEM);
    assert.deepEqual(s.properties.objecoes.items.properties.codigo.enum, ['preco_alto', 'pensar', FORA_DO_CATALOGO]);
    assert.deepEqual(s.properties.fechamento.properties.tecnica.enum, ['direto', 'opcoes', 'outra', null]);
    assert.equal(s.additionalProperties, false);
});

test('Zod aceita um detalhe válido', () => {
    assert.doesNotThrow(() => schemaDetalhe(ITENS).parse(DETALHE));
});

test('Zod rejeita objeção fora do enum e sondagem incompleta ou repetida', () => {
    const z = schemaDetalhe(ITENS);
    assert.throws(() => z.parse({ ...DETALHE, objecoes: [{ ...DETALHE.objecoes[0], codigo: 'inventada' }] }));
    assert.throws(() => z.parse({ ...DETALHE, sondagem: { ...DETALHE.sondagem, itens: DETALHE.sondagem.itens.slice(1) } }));
    const repetida = DETALHE.sondagem.itens.map((i) => ({ ...i, chave: 'sondagem_a' }));
    assert.throws(() => z.parse({ ...DETALHE, sondagem: { ...DETALHE.sondagem, itens: repetida } }));
});

test('playbook sem frase proibida: nenhuma frase é aceita', () => {
    const semFrase = ITENS.filter((i) => i.tipo !== 'frase_proibida');
    assert.equal((schemaJsonDetalhe(semFrase) as any).properties.solucao_completa.properties.frases_proibidas.maxItems, 0);
    assert.throws(() => schemaDetalhe(semFrase).parse(DETALHE));
});

const comConversa = (conversa_id: string, d: DetalheMec): LinhaObservacao[] =>
    observacoesDoDetalhe(d).map((o) => ({ ...o, conversa_id }));

const variar = (mudancas: Partial<DetalheMec>) => ({ ...DETALHE, ...mudancas }) as unknown as DetalheMec;

test('um detalhe vira uma linha por sinal', () => {
    const o = observacoesDoDetalhe(DETALHE as DetalheMec);
    // 7 sondagem + 2 perguntas + 1 complementar + prazo + condição + 1 frase + 2 objeções + 3 preço + 2 fechamento
    assert.equal(o.length, 20);
    assert.deepEqual(o.filter((x) => x.sinal === 'sondagem_item' && x.valor).map((x) => x.item_chave), SONDAGEM.slice(0, 3));
    const fecha = o.find((x) => x.sinal === 'fechamento')!;
    assert.deepEqual([fecha.item_chave, fecha.valor, fecha.etapa], ['opcoes', true, 'fechamento']);
    assert.equal(o.find((x) => x.sinal === 'pergunta_aberta')!.detalhe.contagem, 2);
});

// Zero invenção: sem trecho, não conta.
test('capturada sem trecho conta como não capturada', () => {
    const d = variar({ sondagem: { ...DETALHE.sondagem, itens: SONDAGEM.map((chave) => ({ chave, capturada: true, trecho: '  ' })) } });
    assert.equal(observacoesDoDetalhe(d).filter((x) => x.sinal === 'sondagem_item' && x.valor).length, 0);
});

test('fechamento não tentado fica sem código', () => {
    const d = variar({ fechamento: { tentou: false, tecnica: null, trecho: null, final_positivo: false } });
    const fecha = observacoesDoDetalhe(d).find((x) => x.sinal === 'fechamento')!;
    assert.deepEqual([fecha.item_chave, fecha.valor], [null, false]);
});

test('resumo do dia: sondagem média, por item, perguntas, frases, objeções e fechamento', () => {
    const c2 = variar({
        sondagem: { ...DETALHE.sondagem, itens: SONDAGEM.map((chave, i) => ({ chave, capturada: i < 5, trecho: i < 5 ? 't' : null })) },
        solucao_completa: { ...DETALHE.solucao_completa, frases_proibidas: [] },
        objecoes: [],
        preco: { ...DETALHE.preco, desconto_mencionado: false, trecho_desconto: null },
        fechamento: { tentou: false, tecnica: null, trecho: null, final_positivo: false },
    });
    const r = resumirObservacoes([...comConversa('c1', DETALHE as DetalheMec), ...comConversa('c2', c2)], new Set(['c1', 'c2']));
    assert.equal(r.sondagem_itens, 4);
    assert.deepEqual(r.detalhe.sondagem_por_item, {
        sondagem_a: 100, sondagem_b: 100, sondagem_c: 100, sondagem_d: 50, sondagem_e: 50, sondagem_f: 0, sondagem_g: 0,
    });
    assert.equal(r.detalhe.perguntas_abertas_pct, 40);
    assert.equal(r.frases_proibidas, 1);
    assert.deepEqual(r.detalhe.objecoes, { preco_alto: 1 });
    assert.equal(r.detalhe.fora_do_catalogo, 1);
    assert.equal(r.detalhe.contorno_completo_pct, 50);
    assert.equal(r.detalhe.concordou_ou_criticou, 1);
    assert.equal(r.detalhe.desconto_mencionado, 1);
    assert.deepEqual(r.detalhe.fechamento, { opcoes: 1, nenhum: 1 });
    assert.equal(r.detalhe.final_positivo_pct, 50);
    assert.deepEqual([r.detalhe.conversas, r.detalhe.conversas_com_sondagem], [2, 2]);
});

test('sondagem só conta nas conversas em que cabia', () => {
    const r = resumirObservacoes([...comConversa('c1', DETALHE as DetalheMec), ...comConversa('c3', DETALHE as DetalheMec)], new Set(['c1']));
    assert.equal(r.sondagem_itens, 3);
    assert.equal(r.detalhe.conversas_com_sondagem, 1);
});

test('chave da conversa no dia junta id e data', () => {
    assert.equal(chaveConversaDia('c1', '2026-09-20'), 'c1|2026-09-20');
});

// Uma análise por conversa por dia: numa janela de vários dias a unidade é (conversa, dia).
test('janela de vários dias: a mesma conversa em dois dias conta como duas sondagens', () => {
    const dia = (capturadas: number) => variar({
        sondagem: { ...DETALHE.sondagem, itens: SONDAGEM.map((chave, i) => ({ chave, capturada: i < capturadas, trecho: i < capturadas ? 't' : null })) },
    });
    const linhas = [
        ...comConversa('c1', dia(4)).map((l) => ({ ...l, data_ref: '2026-09-20' })),
        ...comConversa('c1', dia(5)).map((l) => ({ ...l, data_ref: '2026-09-21' })),
    ];
    assert.equal(linhas.filter((l) => l.sinal === 'sondagem_item').length, 14);
    const aplicavel = new Set(['2026-09-20', '2026-09-21'].map((d) => chaveConversaDia('c1', d)));
    const r = resumirObservacoes(porConversaDia(linhas), aplicavel);
    assert.equal(r.sondagem_itens, 4.5);
    assert.equal(r.detalhe.conversas_com_sondagem, 2);
    assert.ok(Object.values(r.detalhe.sondagem_por_item).every((v) => v <= 100));
    assert.equal(linhas[0].conversa_id, 'c1');
});

test('sem nada para medir, o resumo é ausência e não zero', () => {
    const r = resumirObservacoes([], new Set());
    assert.equal(r.sondagem_itens, null);
    assert.equal(r.detalhe.perguntas_abertas_pct, null);
    assert.equal(r.detalhe.contorno_completo_pct, null);
    assert.equal(r.detalhe.final_positivo_pct, null);
    assert.deepEqual(r.detalhe.sondagem_por_item, {});
});

test('objeções por código do catálogo, com rótulo e fora do catálogo', () => {
    const rotulos = new Map([['preco_alto', 'Preço alto'], ['pensar', 'Vou pensar']]);
    const r = contarObjecoesPorCodigo(
        [{ item_chave: 'pensar' }, { item_chave: 'preco_alto' }, { item_chave: 'pensar' }, { item_chave: FORA_DO_CATALOGO }],
        rotulos,
    );
    assert.deepEqual(r, [
        { objecao: 'Vou pensar', total: 2 },
        { objecao: 'Fora do catálogo', total: 1 },
        { objecao: 'Preço alto', total: 1 },
    ]);
});

test('célula da planilha: maiúsculas, espaços e ordem não importam', () => {
    assert.equal(normalizarCelula(' Pensar | preco_alto '), 'pensar|preco_alto');
    assert.equal(normalizarCelula('preco_alto|pensar'), 'pensar|preco_alto');
});

test('concordância ignora célula que o humano deixou vazia', () => {
    assert.equal(concordancia([
        { ia: 'sim', humano: 'SIM' }, { ia: 'nao', humano: 'sim' },
        { ia: 'preco_alto|pensar', humano: 'pensar | preco_alto' }, { ia: 'sim', humano: '' },
    ]), 67);
    assert.equal(concordancia([{ ia: 'sim', humano: '' }]), null);
});

test('sem itens, o schema da análise é o de sempre', () => {
    const { json } = montarSchemaAnalise(null) as { json: any };
    assert.equal(json.properties.mec_detalhe, undefined);
    assert.equal(json.required.includes('mec_detalhe'), false);
});

test('com itens, mec_detalhe é obrigatório e pode ser null', () => {
    const { json, zod } = montarSchemaAnalise(ITENS) as { json: any; zod: any };
    assert.equal(json.required.includes('mec_detalhe'), true);
    assert.deepEqual(json.properties.mec_detalhe.anyOf[1], { type: 'null' });
    assert.equal(zod.shape.mec_detalhe.safeParse(null).success, true);
    assert.equal(zod.shape.mec_detalhe.safeParse(DETALHE).success, true);
});
