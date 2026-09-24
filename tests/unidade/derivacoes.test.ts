import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    comQuemFalar, contarObjecoes, destaquesDaRede, diaMenos, etapaMaisFraca,
    serieSemanal, variacaoDoPeriodo, variacaoSemanal, type NotaDia,
} from '../../lib/derivacoes.ts';

const nd = (data_ref: string, score_geral: number | string | null): NotaDia => ({ data_ref, score_geral });

test('diaMenos atravessa mês e ano', () => {
    assert.equal(diaMenos('2026-03-01', 1), '2026-02-28');
    assert.equal(diaMenos('2026-01-03', 7), '2025-12-27');
});

// --- variação semanal ---------------------------------------------------------

test('variação: último dia contra a média dos 7 anteriores', () => {
    const dias = [nd('2026-09-23', 72), nd('2026-09-22', 66), nd('2026-09-21', 70), nd('2026-09-10', 20)];
    // 72 − média(66, 70) = 4; o dia 10 está fora da janela.
    assert.equal(variacaoSemanal(dias), 4);
});

test('variação: dia sem nota não conta, e texto do PostgREST vira número', () => {
    assert.equal(variacaoSemanal([nd('2026-09-23', '60'), nd('2026-09-22', null), nd('2026-09-21', 70)]), -10);
});

test('variação: sem histórico não há tendência', () => {
    assert.equal(variacaoSemanal([nd('2026-09-23', 72)]), null);
    assert.equal(variacaoSemanal([nd('2026-09-23', 72), nd('2026-09-01', 50)]), null);
});

// --- etapa mais fraca e com quem falar -------------------------------------------

test('etapa mais fraca ignora etapa sem dado', () => {
    assert.deepEqual(etapaMaisFraca({ acolhida: 100, sondagem: '20', fechamento: null }), {
        etapa: 'sondagem', nome: 'Sondagem', pct: 20,
    });
    assert.equal(etapaMaisFraca({}), null);
    assert.equal(etapaMaisFraca(null), null);
});

test('com quem falar: só quem caiu, da maior queda para a menor, no máximo 2', () => {
    const pessoas = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Beto' }, { id: 'c', nome: 'Caio' }, { id: 'd', nome: 'Dani' }];
    const notas = new Map([
        ['a', [nd('2026-09-23', 60), nd('2026-09-22', 67)]],
        ['b', [nd('2026-09-23', 80), nd('2026-09-22', 70)]],
        ['c', [nd('2026-09-23', 50), nd('2026-09-22', 54)]],
        ['d', [nd('2026-09-23', 40), nd('2026-09-22', 49)]],
    ]);
    const etapas = new Map([['a', { sondagem: 20 }]]);
    const r = comQuemFalar(pessoas, notas, etapas);
    assert.deepEqual(r.map((s) => [s.pessoa.id, s.queda]), [['d', -9], ['a', -7]]);
    assert.equal(r[1].etapaFraca?.etapa, 'sondagem');
    assert.equal(r[0].etapaFraca, null);
});

// --- objeções -------------------------------------------------------------------

test('objeções: conta por conversa, junta maiúsculas e ordena', () => {
    const r = contarObjecoes([
        { objecoes: ['Preço', 'preço', 'Prazo de entrega'] },
        { objecoes: ['preço'] },
        { objecoes: 'não é lista' },
        null,
        { objecoes: ['frete', 42] },
    ]);
    assert.deepEqual(r, [
        { objecao: 'Preço', total: 2 },
        { objecao: 'Frete', total: 1 },
        { objecao: 'Prazo de entrega', total: 1 },
    ]);
});

// --- períodos e séries -------------------------------------------------------------

type L = { data_ref: string; unidade_id: string; v: number | null };
const l = (data_ref: string, unidade_id: string, v: number | null): L => ({ data_ref, unidade_id, v });

test('variação do período: janela atual contra a anterior', () => {
    const linhas = [l('2026-09-23', 'x', 70), l('2026-09-20', 'x', 74), l('2026-09-10', 'x', 60), l('2026-08-01', 'x', 10)];
    // últimos 10 dias: média 72; 10 anteriores: 60.
    assert.equal(variacaoDoPeriodo(linhas, (x) => x.v, '2026-09-23', 10), 12);
});

test('variação do período sem um dos lados é null', () => {
    assert.equal(variacaoDoPeriodo([l('2026-09-23', 'x', 70)], (x) => x.v, '2026-09-23', 10), null);
});

test('série semanal: da mais antiga à mais recente, semana vazia é null', () => {
    const linhas = [l('2026-09-23', 'x', 70), l('2026-09-17', 'x', 60), l('2026-09-16', 'x', 64)];
    // Semanas (fim − 7k, fim]: 16/09 cai na do meio; 17/09 e 23/09 na última.
    assert.deepEqual(serieSemanal(linhas, (x) => x.v, '2026-09-23', 3), [null, 64, 65]);
});

// --- destaques da rede ----------------------------------------------------------

test('destaques: quem mais subiu, quem mais caiu e loja sem gestor', () => {
    const unidades = [{ id: 'n', nome: 'Noiva do Mar' }, { id: 't', nome: 'Tramandaí' }, { id: 'a', nome: 'Atlântida' }];
    const linhas = [
        l('2026-09-23', 'n', 81), l('2026-09-05', 'n', 72),
        l('2026-09-23', 't', 63), l('2026-09-05', 't', 71),
        l('2026-09-23', 'a', 61), l('2026-09-05', 'a', 61),
    ];
    const r = destaquesDaRede(unidades, linhas, (x) => x.v, 'maior', '2026-09-23', 14, new Set(['n', 't']));
    assert.deepEqual(r.subiu, { id: 'n', nome: 'Noiva do Mar', variacao: 9 });
    assert.deepEqual(r.caiu, { id: 't', nome: 'Tramandaí', variacao: -8 });
    assert.equal(r.variacoes.get('a'), 0);
    assert.deepEqual(r.semGestor, [{ id: 'a', nome: 'Atlântida' }]);
});

// Para tempo de resposta, subir é piorar.
test('destaques: com "menor é melhor", quem mais caiu é quem mais melhorou', () => {
    const unidades = [{ id: 'n', nome: 'N' }, { id: 't', nome: 'T' }];
    const linhas = [l('2026-09-23', 'n', 4), l('2026-09-05', 'n', 10), l('2026-09-23', 't', 20), l('2026-09-05', 't', 9)];
    const r = destaquesDaRede(unidades, linhas, (x) => x.v, 'menor', '2026-09-23', 14, new Set(['n', 't']));
    assert.equal(r.subiu?.id, 'n');
    assert.equal(r.caiu?.id, 't');
});
