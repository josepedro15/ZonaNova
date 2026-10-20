import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajustarAoSchema, analiseNoClaude, mecPorEtapa, entradaClaude, esforcoClaude, RespostaIncompleta, schemaParaClaude, textoDaMensagemClaude } from '../../lib/claude.ts';
import { schemaJsonAnalise } from '../../lib/analise.ts';

test('só ANALISE_PROVEDOR=anthropic liga o Claude', () => {
    assert.equal(analiseNoClaude('anthropic'), true);
    assert.equal(analiseNoClaude(' Anthropic '), true);
    assert.equal(analiseNoClaude(undefined), false);
    assert.equal(analiseNoClaude('openai'), false);
});

test('effort: low por padrão, medium e high quando pedidos', () => {
    assert.equal(esforcoClaude(undefined), 'low');
    assert.equal(esforcoClaude('medium'), 'medium');
    assert.equal(esforcoClaude('high'), 'high');
    // xhigh e max pensam demais para a análise e não desligam o raciocínio.
    assert.equal(esforcoClaude('max'), 'low');
});

test('o schema vai ao Claude sem os limites que ele recusa', () => {
    const json = JSON.stringify(schemaParaClaude(schemaJsonAnalise));
    for (const chave of ['minimum', 'maximum', 'maxItems']) assert.ok(!json.includes(`"${chave}"`), chave);
    assert.ok(!json.includes('"minItems":7'));
    assert.ok(json.includes('"minItems":1'), 'minItems 1 é aceito');
    // enum e required continuam iguais.
    assert.deepEqual((schemaParaClaude(schemaJsonAnalise) as typeof schemaJsonAnalise).required, schemaJsonAnalise.required);
});

test('a leitura devolve os limites: nota na borda, inteiro arredondado, lista cortada', () => {
    const r = ajustarAoSchema({
        score_atendimento: 105, sentiment: -3, urgencia: 4.6, confianca_natureza: 80,
        evidencias: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ trecho: `t${n}`, conclusao: 'c' })),
        objecoes: ['preço'], extra: 'fica',
    }, schemaJsonAnalise) as Record<string, unknown>;
    assert.equal(r.score_atendimento, 100);
    assert.equal(r.sentiment, 0);
    assert.equal(r.urgencia, 5);
    assert.equal(r.confianca_natureza, 80);
    assert.equal((r.evidencias as unknown[]).length, 5);
    assert.deepEqual(r.objecoes, ['preço']);
    assert.equal(r.extra, 'fica');
});

test('anyOf: null passa, objeto é ajustado pelo ramo de objeto', () => {
    const schema = { type: 'object', properties: { d: { anyOf: [{ type: 'object', properties: { n: { type: 'integer', minimum: 0 } } }, { type: 'null' }] } } };
    assert.deepEqual(ajustarAoSchema({ d: null }, schema), { d: null });
    assert.deepEqual(ajustarAoSchema({ d: { n: -2 } }, schema), { d: { n: 0 } });
});

const mensagem = (stop_reason: string, content: unknown[], stop_details: unknown = null) => ({ stop_reason, content, stop_details }) as Parameters<typeof textoDaMensagemClaude>[0];

test('o texto é lido pelo tipo, mesmo depois do bloco de raciocínio', () => {
    assert.equal(textoDaMensagemClaude(mensagem('end_turn', [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '{"a":1}' }])), '{"a":1}');
});

test('corte vira RespostaIncompleta; recusa e vazio viram erro', () => {
    assert.throws(() => textoDaMensagemClaude(mensagem('max_tokens', [{ type: 'thinking', thinking: '', signature: 's' }])), RespostaIncompleta);
    assert.throws(() => textoDaMensagemClaude(mensagem('refusal', [], { type: 'refusal', category: 'cyber', explanation: null })), /recusou a análise \(cyber\)/);
    assert.throws(() => textoDaMensagemClaude(mensagem('end_turn', [{ type: 'thinking', thinking: '', signature: 's' }])), /não devolveu texto/);
});

test('a entrada soma o fresco, o cache lido e o escrito', () => {
    assert.equal(entradaClaude({ input_tokens: 100, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }), 4100);
    assert.equal(entradaClaude({ input_tokens: 100, cache_read_input_tokens: null, cache_creation_input_tokens: null }), 100);
});

test('MEC por etapa: o item perde o campo etapa e a volta mantém a ordem', () => {
    const { schema, paraLista } = mecPorEtapa(schemaJsonAnalise as unknown as Record<string, unknown>);
    const mec = (schema.properties as Record<string, { required: string[]; properties: Record<string, unknown> }>).mec;
    assert.equal(mec.required.length, 7);
    // Uma definição só, referenciada pelas 7: cópias estouram o tamanho do schema.
    assert.deepEqual(mec.properties.acolhida, { $ref: '#/$defs/etapa_mec' });
    const etapa = (schema.$defs as Record<string, { required: string[]; properties: object }>).etapa_mec;
    assert.ok(!('etapa' in etapa.properties));
    assert.ok(!etapa.required.includes('etapa'));
    const volta = paraLista({ x: 1, mec: { sondagem: { aplicado: 'nao' }, acolhida: { aplicado: 'sim' } } }) as { x: number; mec: unknown[] };
    assert.deepEqual(volta.mec, [{ etapa: 'acolhida', aplicado: 'sim' }, { etapa: 'sondagem', aplicado: 'nao' }]);
    assert.equal(volta.x, 1);
    const lista = { mec: [{ etapa: 'acolhida' }] };
    assert.equal(paraLista(lista), lista);
});
