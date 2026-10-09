import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedidoAnalise, REGRA_ERROS, REGRA_ESCALAS, REGRA_OBJECOES, REGRA_STATUS, REGRA_SUPORTE, REGRA_TIPO } from '../../lib/pedido-analise.ts';
import { REGRA_NATUREZA } from '../../lib/natureza.ts';

const instrucoes = () => pedidoAnalise({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' }).corpo.instructions;

test('o prompt leva todas as regras', () => {
    const texto = instrucoes();
    for (const regra of [REGRA_ESCALAS, REGRA_NATUREZA, REGRA_STATUS, REGRA_TIPO, REGRA_SUPORTE, REGRA_OBJECOES, REGRA_ERROS]) assert.ok(texto.includes(regra));
});

// Auditoria de 07/10: o vendedor pedindo ao estoque saía cliente, o
// comprovante depois do Pix ficava de fora e frase do vendedor virava objeção.
test('as regras cobrem os erros da auditoria de 07/10', () => {
    assert.match(REGRA_NATUREZA, /Posso vender 20\?/);
    assert.match(REGRA_NATUREZA, /entrega tua de Fulano/);
    assert.match(REGRA_STATUS, /separa no nome/);
    assert.match(REGRA_STATUS, /Aguardo comprovante/);
    assert.match(REGRA_STATUS, /QUALQUER assunto é compra_nova_fechada/);
    assert.match(REGRA_STATUS, /sem_resposta SOMENTE/);
    assert.match(REGRA_OBJECOES, /frase do vendedor/);
    assert.match(REGRA_ERROS, /procure X em TODAS as falas V:/);
    assert.match(instrucoes(), /Áudio transcrito numa linha V: é fala do vendedor/);
});

test('a resposta sai conferida contra a conversa (ajustarResultado)', () => {
    const { schema } = pedidoAnalise({ transcript: 'C: "separa no nome"\nV: "Já está no pacote"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' });
    const resposta = {
        quem_pede: 'contato_pede_a_loja', assuntos_do_dia: [{ assunto: 'pedido', situacao: 'compra_nova_fechada' }],
        natureza_contato: 'cliente', confianca_natureza: 90, evidencia_natureza: '', tipo_conversa: 'negociacao', status: 'em_andamento',
        sentiment: 60, score_atendimento: 70, score_oportunidade: 50, score_risco: 30, estagio_funil: 'f', potencial_venda: 'medio', urgencia: 3,
        resumo: 'r', destaque: 'd', proxima_acao: 'p', script_sugerido: 's', objecoes: [], tecnicas_usadas: [], erros_vendedor: [], tags: [],
        evidencias: [{ trecho: 't', conclusao: 'c' }], perfil_cliente: 'nao_identificado', profissao_cliente: '',
        mec: ['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']
            .map((etapa) => ({ etapa, aplicavel: true, aplicado: 'sim', justificativa: 'j', evidencias: [], itens: [] })),
    };
    assert.equal(schema.zod.parse(resposta).status, 'venda_feita');
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
