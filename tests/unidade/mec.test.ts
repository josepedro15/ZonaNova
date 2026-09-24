/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    chavesDoTipo, detalheLigado, etapaProvisoria, schemaDetalhe, schemaJsonDetalhe, FORA_DO_CATALOGO, type ItemPlaybook,
} from '../../lib/mec.ts';

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
