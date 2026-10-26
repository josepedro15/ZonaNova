import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levantarFeedbacks, type AnaliseComFeedbacks } from '../../lib/feedbacks.ts';

type F = { polaridade: 'positivo' | 'negativo'; assunto: string; trecho: string };
const negativo = (trecho: string, assunto = 'entrega_frete'): F => ({ polaridade: 'negativo', assunto, trecho });
const positivo = (trecho: string, assunto = 'atendimento'): F => ({ polaridade: 'positivo', assunto, trecho });
const analise = (conversa_id: string, data_ref: string, feedbacks: F[] | undefined, extra: { user_id?: string; payload?: Record<string, unknown> } = {}): AnaliseComFeedbacks => ({
    conversa_id, data_ref, user_id: extra.user_id ?? 'ana', payload: { ...(feedbacks ? { feedbacks } : {}), ...extra.payload },
});
const VENDEDORES = new Set(['ana', 'bia']);
const levantar = (analises: AnaliseComFeedbacks[]) => levantarFeedbacks({ analises, vendedores: VENDEDORES });

test('conta por conversa do dia, com elogio e com reclamação, sem repetir o mesmo trecho', () => {
    const r = levantar([
        analise('c1', '2026-10-20', [negativo('atrasou de novo'), negativo('Atrasou de novo!'), positivo('o Rafael é atencioso')]),
        analise('c2', '2026-10-21', [negativo('ninguém me responde', 'atendimento')]),
        analise('c3', '2026-10-21', [positivo('chegou tudo certinho', 'entrega_frete')]),
        analise('c4', '2026-10-21', []),
    ]);
    assert.equal(r.conversas, 4);
    assert.equal(r.comReclamacao, 2);
    assert.equal(r.comElogio, 2);
    // Mais recente primeiro.
    assert.deepEqual(r.reclamacoes.map((f) => f.trecho), ['ninguém me responde', 'atrasou de novo']);
    assert.deepEqual(r.elogios.map((f) => [f.trecho, f.conversa_id, f.data_ref]), [['chegou tudo certinho', 'c3', '2026-10-21'], ['o Rafael é atencioso', 'c1', '2026-10-20']]);
});

test('por assunto: uma vez por conversa do dia em cada lado, o mais reclamado primeiro e "Outros" por último', () => {
    const r = levantar([
        analise('c1', '2026-10-20', [negativo('atrasou'), negativo('veio quebrado o frete'), positivo('entregaram rápido', 'entrega_frete')]),
        analise('c2', '2026-10-20', [negativo('atrasou também')]),
        analise('c3', '2026-10-20', [negativo('demorou pra responder', 'atendimento'), negativo('estranho', 'outros'), negativo('mais estranho', 'outros'), negativo('bem estranho', 'outros')]),
        analise('c4', '2026-10-20', [positivo('atendimento ótimo'), positivo('muito educado')]),
    ]);
    assert.deepEqual(r.assuntos.map((a) => [a.assunto, a.rotulo, a.negativos, a.positivos]), [
        ['entrega_frete', 'Entrega e frete', 2, 1],
        ['atendimento', 'Atendimento', 1, 1],
        ['outros', 'Outros', 1, 0],
    ]);
});

test('o recorte: só vendedor, sem contato interno, qualquer tipo de conversa', () => {
    const r = levantar([
        analise('c1', '2026-10-20', [negativo('atrasou')], { user_id: 'gestor' }),
        analise('c2', '2026-10-20', [negativo('o caminhão não veio')], { payload: { natureza_contato: 'colega_ou_loja', confianca_natureza: '90' } }),
        // O gestor disse "É cliente": volta a contar.
        analise('c3', '2026-10-20', [negativo('faltou uma telha')], { payload: { natureza_contato: 'fornecedor_ou_parceiro', confianca_natureza: 95, natureza_descartada: true } }),
        analise('c4', '2026-10-20', [positivo('valeu demais')], { user_id: 'bia' }),
    ]);
    assert.equal(r.conversas, 2);
    assert.deepEqual(r.reclamacoes.map((f) => f.trecho), ['faltou uma telha']);
    assert.deepEqual(r.elogios.map((f) => f.user_id), ['bia']);
});

// O histórico só ganha feedbacks quando o script roda: a análise que ainda não
// foi lida para feedback não entra nem no total, senão o percentual cai.
test('análise sem o campo feedbacks não conta', () => {
    const r = levantar([analise('c1', '2026-10-20', undefined), analise('c2', '2026-10-20', [])]);
    assert.equal(r.conversas, 1);
});

test('feedback fora do contrato no payload é ignorado sem derrubar a página', () => {
    const r = levantar([{ conversa_id: 'c1', data_ref: '2026-10-20', user_id: 'ana', payload: { feedbacks: [{ polaridade: 'neutro', trecho: 'x' }, null, negativo('atrasou', 'logistica')] } }]);
    assert.equal(r.conversas, 1);
    assert.deepEqual(r.reclamacoes.map((f) => [f.trecho, f.assunto]), [['atrasou', 'outros']]);
});

test('por vendedor: quem mais recebeu reclamação primeiro, com o assunto mais reclamado', () => {
    const r = levantar([
        analise('c1', '2026-10-20', [negativo('atrasou')]),
        analise('c2', '2026-10-20', [negativo('atrasou de novo'), negativo('demorou pra responder', 'atendimento')]),
        analise('c3', '2026-10-20', [positivo('top')], { user_id: 'bia' }),
        analise('c4', '2026-10-20', [], { user_id: 'bia' }),
    ]);
    assert.deepEqual(r.porVendedor, [
        { user_id: 'ana', conversas: 2, comElogio: 0, comReclamacao: 2, principal: 'Entrega e frete' },
        { user_id: 'bia', conversas: 2, comElogio: 1, comReclamacao: 0, principal: null },
    ]);
});
