import { test } from 'node:test';
import assert from 'node:assert/strict';
import { janelaRetomar, paraRetomar, type AnaliseResumo, type CandidataRetomar } from '../../lib/retomar.ts';

const AGORA = new Date('2026-10-03T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA).toISOString();

const analise = (extra: Partial<AnaliseResumo> = {}): AnaliseResumo => ({
    data_ref: '2026-08-20', tipo_conversa: 'negociacao', status: 'em_andamento', potencial_venda: 'medio', score_oportunidade: 50, ...extra,
});
const conversa = (id: string, dias: number, analises: AnaliseResumo[] = [analise()]): CandidataRetomar => ({
    id, cliente_nome: id, cliente_telefone: '5554998124471', ultima_mensagem_em: haDias(dias), analises_conversa: analises,
});

test('negociação em aberto parada há 31 dias entra', () => {
    const itens = paraRetomar([conversa('a', 31)], AGORA);
    assert.equal(itens.length, 1);
    assert.equal(itens[0].dias, 31);
});

test('29 dias ainda não é contato frio', () => {
    assert.equal(paraRetomar([conversa('a', 29)], AGORA).length, 0);
});

test('mais de 90 dias sai da lista', () => {
    assert.equal(paraRetomar([conversa('a', 91)], AGORA).length, 0);
});

test('venda feita, perdida e encerrada não pedem retomada', () => {
    for (const status of ['venda_feita', 'perdida', 'encerrada']) {
        assert.equal(paraRetomar([conversa('a', 40, [analise({ status })])], AGORA).length, 0, status);
    }
});

test('lead frio e sem resposta pedem retomada', () => {
    for (const status of ['lead_frio', 'sem_resposta']) {
        assert.equal(paraRetomar([conversa('a', 40, [analise({ status })])], AGORA).length, 1, status);
    }
});

test('suporte, social e conversa sem análise ficam de fora', () => {
    assert.equal(paraRetomar([conversa('a', 40, [analise({ tipo_conversa: 'suporte' })])], AGORA).length, 0);
    assert.equal(paraRetomar([conversa('b', 40, [analise({ tipo_conversa: 'social' })])], AGORA).length, 0);
    assert.equal(paraRetomar([conversa('c', 40, [])], AGORA).length, 0);
});

// A conversa estava em andamento e, no último dia analisado, virou venda.
test('vale a análise mais recente', () => {
    const analises = [analise({ data_ref: '2026-08-20', status: 'em_andamento' }), analise({ data_ref: '2026-08-25', status: 'venda_feita' })];
    assert.equal(paraRetomar([conversa('a', 35, analises)], AGORA).length, 0);
});

test('ordem: potencial alto, depois oportunidade, depois quem esfriou mais recentemente', () => {
    const itens = paraRetomar([
        conversa('medio-antigo', 60, [analise({ potencial_venda: 'medio', score_oportunidade: 90 })]),
        conversa('alto-baixo', 50, [analise({ potencial_venda: 'alto', score_oportunidade: 40 })]),
        conversa('alto-alto', 70, [analise({ potencial_venda: 'alto', score_oportunidade: 80 })]),
        conversa('medio-recente', 31, [analise({ potencial_venda: 'medio', score_oportunidade: 90 })]),
    ], AGORA);
    assert.deepEqual(itens.map((i) => i.conversa.id), ['alto-alto', 'alto-baixo', 'medio-recente', 'medio-antigo']);
});

test('a janela da consulta é de 90 a 30 dias atrás', () => {
    const { de, ate } = janelaRetomar(AGORA);
    assert.equal(de.toISOString(), haDias(90));
    assert.equal(ate.toISOString(), haDias(30));
});
