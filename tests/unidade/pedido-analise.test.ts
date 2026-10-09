import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedidoAnalise, REGRA_ESCALAS, REGRA_STATUS, REGRA_SUPORTE } from '../../lib/pedido-analise.ts';

const instrucoes = () => pedidoAnalise({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' }).corpo.instructions;

test('o prompt leva a regra de suporte junto com escalas e status', () => {
    const texto = instrucoes();
    for (const regra of [REGRA_ESCALAS, REGRA_STATUS, REGRA_SUPORTE]) assert.ok(texto.includes(regra));
});

// O caso do piloto (08/10): cliente perguntando pela entrega ou pelo crediário
// tirava nota baixa do vendedor por falta de fechamento.
test('suporte cobre entrega, crediário e pagamento e não cobra fechamento', () => {
    for (const termo of ['entrega', 'crediário', 'boleto', 'pagamento']) assert.ok(REGRA_SUPORTE.includes(termo), termo);
    assert.match(REGRA_SUPORTE, /Fechamento, sondagem, oferta e preço não se aplicam a suporte/);
});

test('as faixas de 0 a 100 continuam sendo a escala do suporte', () => {
    assert.match(REGRA_SUPORTE, /70–100/);
    assert.match(REGRA_ESCALAS, /suporte tem as suas/);
});
