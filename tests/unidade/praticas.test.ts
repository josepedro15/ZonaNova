import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerPraticas, MAX_PRATICAS, praticasDoPayload, regraPraticas, schemaJsonPraticas, schemaPraticas, usoDasPraticas, type PraticaAprovada } from '../../lib/praticas.ts';
import { pedidoAnalise, pedidoAnaliseClaude } from '../../lib/pedido-analise.ts';
import { schemaParaClaude } from '../../lib/claude.ts';

const desconto: PraticaAprovada = {
    id: '11111111-1111-1111-1111-111111111111', tipo: 'fora_do_script_deu_certo',
    hipotese: 'Oferecer desconto progressivo e consultar a gerência fecha mesmo com objeção de preço.',
    nota: 'Só acima de R$ 500.', desde: '2026-10-20T15:00:00Z',
};
const semResposta: PraticaAprovada = {
    id: '22222222-2222-2222-2222-222222222222', tipo: 'no_script_deu_errado',
    hipotese: 'Deixar o cliente sem alternativa quando falta o produto perde a venda.', nota: null, desde: '2026-10-20T16:00:00Z',
};

const TRANSCRIPT = 'C: "quanto fica 20 sacos?"\nV: "R$ 600, mas vou ver com a gerência um desconto"\nC: "fechado então"';

test('sem prática aprovada, nada muda no pedido', () => {
    assert.equal(regraPraticas([]), '');
    const antes = pedidoAnalise({ transcript: TRANSCRIPT, doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' }).corpo;
    const depois = pedidoAnalise({ transcript: TRANSCRIPT, doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini', praticas: [] }).corpo;
    assert.equal(depois.instructions, antes.instructions);
    assert.deepEqual(depois.text.format.schema, antes.text.format.schema);
    assert.ok(!('praticas_aprovadas' in (antes.text.format.schema as { properties: object }).properties));
});

test('a regra lista cada prática com código, rótulo do tipo e a orientação do supervisor', () => {
    const regra = regraPraticas([desconto, semResposta]);
    assert.match(regra, /PRÁTICAS APROVADAS PELA REDE/);
    assert.match(regra, /\[P1\] Funciona: Oferecer desconto progressivo/);
    assert.match(regra, /orientação do supervisor: Só acima de R\$ 500\./);
    assert.match(regra, /\[P2\] Evite: Deixar o cliente sem alternativa/);
    assert.match(regra, /NÃO mudam score_atendimento/);
});

test('a regra vai no fim do prompt, depois do MEC, nos dois modelos', () => {
    const openai = pedidoAnalise({ transcript: TRANSCRIPT, doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini', praticas: [desconto] }).corpo;
    assert.ok(openai.instructions.endsWith(regraPraticas([desconto])));
    assert.ok(openai.instructions.indexOf('MEC VIGENTE') < openai.instructions.indexOf('PRÁTICAS APROVADAS'));
    assert.ok((openai.text.format.schema as { required: string[] }).required.includes('praticas_aprovadas'));
    const claude = pedidoAnaliseClaude({ transcript: TRANSCRIPT, doutrina: 'MEC', itens: null, praticas: [desconto] }).corpo;
    assert.ok(claude.system[0].text.endsWith(regraPraticas([desconto])));
});

test('o schema só aceita os códigos das práticas do pedido', () => {
    const json = schemaJsonPraticas([desconto, semResposta]) as { maxItems: number; items: { properties: { pratica: { enum: string[] } } } };
    assert.deepEqual(json.items.properties.pratica.enum, ['P1', 'P2']);
    assert.equal(json.maxItems, 2);
    // O Claude recusa maxItems: sai no schema dele e volta na leitura.
    assert.ok(!('maxItems' in (schemaParaClaude(json) as object)));
    assert.deepEqual(schemaPraticas([desconto]).parse([{ pratica: 'P9', seguiu: true, trecho: 'x' }]), []);
});

test('a leitura troca o código pelo id, confere o trecho e não repete prática', () => {
    const lidas = lerPraticas([
        { pratica: 'P1', seguiu: true, trecho: 'vou ver com a gerência um desconto' },
        { pratica: 'P1', seguiu: false, trecho: 'fechado então' },
        { pratica: 'P2', seguiu: false, trecho: 'trecho que não está na conversa' },
    ], [desconto, semResposta], TRANSCRIPT);
    assert.deepEqual(lidas, [{ id: desconto.id, tipo: desconto.tipo, texto: desconto.hipotese, seguiu: true, trecho: 'vou ver com a gerência um desconto' }]);
});

test('o trecho confere sem acento, caixa nem pontuação', () => {
    const lidas = lerPraticas([{ pratica: 'P1', seguiu: true, trecho: 'Vou ver com a GERENCIA, um desconto.' }], [desconto], TRANSCRIPT);
    assert.equal(lidas.length, 1);
});

test('a análise devolve as práticas pelo id, já conferidas', () => {
    const { schema } = pedidoAnalise({ transcript: TRANSCRIPT, doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini', praticas: [desconto] });
    const r = schema.zod.parse({ ...RESPOSTA, praticas_aprovadas: [{ pratica: 'P1', seguiu: true, trecho: 'um desconto' }] });
    assert.deepEqual(r.praticas_aprovadas, [{ id: desconto.id, tipo: desconto.tipo, texto: desconto.hipotese, seguiu: true, trecho: 'um desconto' }]);
});

test('o uso conta seguiu e deixou passar só depois da aprovação', () => {
    const lida = { id: desconto.id, tipo: desconto.tipo, texto: desconto.hipotese, trecho: 't' };
    const uso = usoDasPraticas([desconto], [
        { data_ref: '2026-10-21', praticas: [{ ...lida, seguiu: true }] },
        { data_ref: '2026-10-21', praticas: [{ ...lida, seguiu: false }] },
        { data_ref: '2026-10-19', praticas: [{ ...lida, seguiu: true }] },
        { data_ref: '2026-10-21', praticas: null },
    ]);
    assert.deepEqual(uso.get(desconto.id), { seguiu: 1, deixou: 1 });
});

// Aprovada às 22h de 20/10 em São Paulo (01h de 21/10 em UTC): vale desde 20/10.
test('o dia da aprovação é o de São Paulo', () => {
    const tarde = { ...desconto, desde: '2026-10-21T01:00:00Z' };
    const lida = { id: desconto.id, tipo: desconto.tipo, texto: desconto.hipotese, seguiu: true, trecho: 't' };
    assert.deepEqual(usoDasPraticas([tarde], [{ data_ref: '2026-10-20', praticas: [lida] }]).get(desconto.id), { seguiu: 1, deixou: 0 });
});

// Prova de 20/10 no Haiku: o trecho veio como a linha inteira do transcript.
test('o trecho sai sem o prefixo da linha do transcript', () => {
    const [lida] = lerPraticas([{ pratica: 'P1', seguiu: true, trecho: 'V: "R$ 600, mas vou ver com a gerência um desconto"' }], [desconto], TRANSCRIPT);
    assert.equal(lida.trecho, 'R$ 600, mas vou ver com a gerência um desconto');
});

test('o payload antigo ou estranho não quebra a tela', () => {
    const boa = { id: desconto.id, tipo: desconto.tipo, texto: desconto.hipotese, seguiu: false, trecho: 't' };
    assert.deepEqual(praticasDoPayload(undefined), []);
    assert.deepEqual(praticasDoPayload([boa, { pratica: 'P1' }, null, 'x']), [boa]);
});

test('o teto de práticas no prompt existe', () => {
    assert.ok(MAX_PRATICAS >= 5 && MAX_PRATICAS <= 20);
});

const RESPOSTA = {
    quem_pede: 'contato_pede_a_loja', assuntos_do_dia: [{ assunto: 'sacos', situacao: 'compra_nova_fechada' }],
    natureza_contato: 'cliente', confianca_natureza: 90, evidencia_natureza: 'pediu preço',
    tipo_conversa: 'negociacao', status: 'venda_feita', sentiment: 70, score_atendimento: 80, score_oportunidade: 100, score_risco: 10,
    estagio_funil: 'fechamento', potencial_venda: 'alto', urgencia: 3, resumo: 'r', destaque: 'd', proxima_acao: 'p', script_sugerido: 's',
    objecoes: [], tecnicas_usadas: [], erros_vendedor: [], tags: [], perfil_cliente: 'nao_identificado', profissao_cliente: '',
    evidencias: [{ trecho: 'fechado então', conclusao: 'fechou' }],
    mec: ['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']
        .map((etapa) => ({ etapa, aplicavel: false, aplicado: 'nao_verificavel', justificativa: '', evidencias: [], itens: [] })),
};
