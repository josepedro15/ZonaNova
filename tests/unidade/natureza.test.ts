import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparSugestoes, LIMIAR_NATUREZA, naturezaSuspeita, REGRA_NATUREZA, type LinhaSugestao } from '../../lib/natureza.ts';
import { schemaJsonAnalise } from '../../lib/analise.ts';
import { pedidoAnalise } from '../../lib/pedido-analise.ts';

test('suspeita só com natureza diferente de cliente e confiança no limiar', () => {
    assert.equal(naturezaSuspeita({ natureza_contato: 'fornecedor_ou_parceiro', confianca_natureza: LIMIAR_NATUREZA }), 'fornecedor_ou_parceiro');
    assert.equal(naturezaSuspeita({ natureza_contato: 'colega_ou_loja', confianca_natureza: '92' }), 'colega_ou_loja');
    assert.equal(naturezaSuspeita({ natureza_contato: 'pessoal', confianca_natureza: LIMIAR_NATUREZA - 1 }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'cliente', confianca_natureza: 100 }), null);
});

test('payload antigo, estranho ou vazio continua sendo cliente', () => {
    assert.equal(naturezaSuspeita({ resumo: 'análise de antes do campo' }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'agencia', confianca_natureza: 99 }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'pessoal', confianca_natureza: null }), null);
    assert.equal(naturezaSuspeita(null), null);
    assert.equal(naturezaSuspeita('texto'), null);
});

test('uma sugestão por número da loja, com o motivo do dia mais recente', () => {
    const l = (telefone: string, data_ref: string, natureza: string, confianca: number, evidencia = '', unidade_id = 'u1'): LinhaSugestao =>
        ({ unidade_id, telefone, nome: ' Agência X ', data_ref, payload: { natureza_contato: natureza, confianca_natureza: confianca, evidencia_natureza: evidencia } });
    const r = agruparSugestoes([
        l('5551999990000', '2026-10-01', 'fornecedor_ou_parceiro', 85, 'boleto da campanha'),
        l('5551999990000', '2026-10-05', 'fornecedor_ou_parceiro', 95, ' relatório do Meta Ads '),
        // Outro vendedor, mesmo número e dia: conta um dia só.
        l('5551999990000', '2026-10-05', 'fornecedor_ou_parceiro', 90),
        l('5551999990000', '2026-10-06', 'cliente', 99),
        l('5551888880000', '2026-10-04', 'colega_ou_loja', 70),
        l('5551999990000', '2026-10-03', 'pessoal', 88, '', 'u2'),
    ]);
    assert.deepEqual(r, [
        { unidade_id: 'u1', telefone: '5551999990000', nome: 'Agência X', natureza: 'fornecedor_ou_parceiro', confianca: 95, evidencia: 'relatório do Meta Ads', ultimo_dia: '2026-10-05', dias: 2 },
        { unidade_id: 'u2', telefone: '5551999990000', nome: 'Agência X', natureza: 'pessoal', confianca: 88, evidencia: '', ultimo_dia: '2026-10-03', dias: 1 },
    ]);
});

test('o pedido da análise leva a regra e o campo da natureza', () => {
    const { corpo, schema } = pedidoAnalise({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' });
    assert.ok(corpo.instructions.includes(REGRA_NATUREZA));
    assert.ok(schemaJsonAnalise.required.includes('natureza_contato'));
    assert.equal(schema.json, schemaJsonAnalise);
});
