import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levantarObjecoes, MAX_EXEMPLOS, periodoDe, temaDaObjecao, type AnaliseComObjecoes } from '../../lib/objecoes.ts';

const analise = (conversa_id: string, data_ref: string, objecoes: string[], extra: Partial<AnaliseComObjecoes> & { payload?: Record<string, unknown> } = {}): AnaliseComObjecoes => ({
    conversa_id, data_ref, user_id: 'ana', tipo_conversa: 'negociacao', ...extra, payload: { objecoes, ...extra.payload },
});
const VENDEDORES = new Set(['ana', 'bia']);
const levantar = (analises: AnaliseComObjecoes[], codigos: { conversa_id: string; data_ref: string; item_chave: string | null }[] = []) =>
    levantarObjecoes({ analises, vendedores: VENDEDORES, codigos, rotulos: new Map([['preco_alto', 'Preço alto']]) });

test('conta por negociação do dia, a mais citada primeiro, sem repetir na mesma conversa', () => {
    const r = levantar([
        analise('c1', '2026-10-08', ['frete caro', 'Frete caro', 'prazo']),
        analise('c2', '2026-10-08', ['Frete caro']),
        analise('c1', '2026-10-09', ['frete caro']),
        analise('c3', '2026-10-09', []),
    ]);
    assert.equal(r.negociacoes, 4);
    assert.equal(r.comObjecao, 3);
    assert.deepEqual(r.objecoes.map((o) => [o.objecao, o.total]), [['Frete caro', 3], ['Prazo', 1]]);
    // Exemplos do mais recente para o mais antigo.
    assert.deepEqual(r.objecoes[0].exemplos[0], { conversa_id: 'c1', data_ref: '2026-10-09' });
});

test('o recorte do relatório: só negociação de vendedor, sem contato interno', () => {
    const r = levantar([
        analise('c1', '2026-10-08', ['preço'], { tipo_conversa: 'suporte' }),
        analise('c2', '2026-10-08', ['custo da campanha'], { user_id: 'gestor' }),
        analise('c3', '2026-10-08', ['prazo do fornecedor'], { payload: { natureza_contato: 'fornecedor_ou_parceiro', confianca_natureza: '90' } }),
        // O gestor disse "É cliente": volta a contar.
        analise('c4', '2026-10-08', ['frete'], { payload: { natureza_contato: 'colega_ou_loja', confianca_natureza: '95', natureza_descartada: 'true' } }),
        analise('c5', '2026-10-08', ['preço'], { payload: { natureza_contato: 'colega_ou_loja', confianca_natureza: '60' } }),
    ]);
    assert.equal(r.negociacoes, 2);
    assert.deepEqual(r.objecoes.map((o) => o.objecao).sort(), ['Frete', 'Preço']);
});

test('com o código do catálogo (piloto), vale o rótulo do código no lugar do texto livre', () => {
    const r = levantar(
        [analise('c1', '2026-10-08', ['achou caro demais']), analise('c2', '2026-10-08', ['Preço alto'])],
        [{ conversa_id: 'c1', data_ref: '2026-10-08', item_chave: 'preco_alto' }, { conversa_id: 'c1', data_ref: '2026-10-07', item_chave: 'fora_do_catalogo' }],
    );
    assert.deepEqual(r.objecoes.map((o) => [o.objecao, o.total]), [['Preço alto', 2]]);
});

test('por vendedor: negociações, quantas com objeção e a mais comum', () => {
    const r = levantar([
        analise('c1', '2026-10-08', ['frete']), analise('c2', '2026-10-08', ['frete', 'prazo']), analise('c3', '2026-10-08', []),
        analise('c4', '2026-10-08', ['prazo'], { user_id: 'bia' }),
    ]);
    assert.deepEqual(r.porVendedor, [
        { user_id: 'ana', negociacoes: 3, comObjecao: 2, principal: 'Frete' },
        { user_id: 'bia', negociacoes: 1, comObjecao: 1, principal: 'Prazo' },
    ]);
});

test('no máximo três exemplos por objeção; período desconhecido é 30 dias', () => {
    const r = levantar(['c1', 'c2', 'c3', 'c4', 'c5'].map((c) => analise(c, '2026-10-08', ['frete'])));
    assert.equal(r.objecoes[0].exemplos.length, MAX_EXEMPLOS);
    assert.equal(periodoDe(undefined), '30');
    assert.equal(periodoDe('geral'), 'geral');
    assert.equal(periodoDe('toString'), '30');
});

// Textos reais de 09/10: a mesma objeção escrita de três jeitos contava separado.
test('o tema junta a objeção pelo assunto; a primeira regra que casa vence', () => {
    for (const t of ['Produto indisponível', 'produto não disponível', 'Produto não disponível na loja', 'Falta de estoque']) assert.equal(temaDaObjecao(t), 'disponibilidade', t);
    assert.equal(temaDaObjecao('Preço maior que o concorrente'), 'concorrente');
    assert.equal(temaDaObjecao('Já comprei em outra loja'), 'concorrente');
    assert.equal(temaDaObjecao('pedido de desconto no frete e valor'), 'frete');
    assert.equal(temaDaObjecao('Cliente esperava valor menor'), 'preco');
    assert.equal(temaDaObjecao('não pode pagar na entrega'), 'pagamento');
    assert.equal(temaDaObjecao('dúvida sobre parcelamento e acréscimo'), 'pagamento');
    assert.equal(temaDaObjecao('Atraso na entrega'), 'prazo');
    assert.equal(temaDaObjecao('cor não adequada'), 'produto');
    assert.equal(temaDaObjecao('quantidade mínima para compra da brita rosa'), 'outros');
});

test('por tema: uma vez por negociação, "Outros" por último', () => {
    const r = levantar([
        analise('c1', '2026-10-08', ['Preço alto', 'pedido de desconto', 'quantidade mínima']),
        analise('c2', '2026-10-08', ['quantidade mínima']), analise('c3', '2026-10-08', ['quantidade errada']),
        analise('c4', '2026-10-08', ['frete caro']),
    ]);
    assert.deepEqual(r.temas.map((t) => [t.rotulo, t.total]), [['Preço e desconto', 1], ['Frete', 1], ['Outros', 3]]);
});
