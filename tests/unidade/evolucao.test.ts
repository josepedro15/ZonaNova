import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    delta, diaDaSemana, diaMaisFraco, mecDoPeriodo, melhorEPior, mudancasDoMec, noIntervalo, notaPorDiaDaSemana,
    periodoDe, resumir, sequenciaAtual, tempoCurto, viradaDoPeriodo, type Dia,
} from '../../lib/evolucao.ts';

const dia = (data_ref: string, nota: number | string | null, extra: Partial<Dia> = {}): Dia => ({
    data_ref, score_geral: nota, leads_atendidos: 10, conversoes_confirmadas: 1, oportunidades_perdidas: 0,
    tempo_medio_resposta_s: null, taxa_resposta: null, ...extra,
});

test('período: só 7, 30 ou 90; o resto vira 30', () => {
    assert.equal(periodoDe('7'), 7);
    assert.equal(periodoDe(['90']), 90);
    assert.equal(periodoDe('15'), 30);
    assert.equal(periodoDe(undefined), 30);
    assert.equal(periodoDe('abc'), 30);
});

test('intervalo é (fim − dias, fim]', () => {
    const linhas = [dia('2026-09-19', 1), dia('2026-09-20', 2), dia('2026-09-26', 3), dia('2026-09-27', 4)];
    assert.deepEqual(noIntervalo(linhas, '2026-09-26', 7).map((l) => l.data_ref), ['2026-09-20', '2026-09-26']);
});

test('resumo soma contagens, e dia sem nota não puxa a média para baixo', () => {
    const r = resumir([
        dia('2026-09-24', 80, { leads_atendidos: 12, conversoes_confirmadas: 3, oportunidades_perdidas: 1 }),
        dia('2026-09-25', null, { leads_atendidos: '2', conversoes_confirmadas: 0, oportunidades_perdidas: 0 }),
        dia('2026-09-26', '60', { leads_atendidos: 6, conversoes_confirmadas: 1, oportunidades_perdidas: 2 }),
    ]);
    assert.equal(r.diasComRelatorio, 3);
    assert.equal(r.diasComNota, 2);
    assert.equal(r.nota, 70);
    assert.deepEqual([r.leads, r.conversoes, r.perdidas], [20, 4, 3]);
});

test('tempo e taxa são ponderados por leads, com peso mínimo 1', () => {
    const r = resumir([
        dia('2026-09-24', 70, { leads_atendidos: 9, tempo_medio_resposta_s: 60, taxa_resposta: 100 }),
        dia('2026-09-25', 70, { leads_atendidos: 0, tempo_medio_resposta_s: 600, taxa_resposta: 0 }),
    ]);
    // (60·9 + 600·1) / 10 = 114; (100·9 + 0·1) / 10 = 90.
    assert.equal(r.respostaS, 114);
    assert.equal(r.taxa, 90);
    assert.equal(resumir([dia('2026-09-24', 70)]).respostaS, null);
});

test('delta só existe com os dois lados', () => {
    assert.equal(delta(70, 62), 8);
    assert.equal(delta(70, null), null);
    assert.equal(delta(null, 62), null);
});

test('melhor e pior dia; empate fica com o mais recente', () => {
    const r = melhorEPior([dia('2026-09-20', 80), dia('2026-09-21', 55), dia('2026-09-22', 80), dia('2026-09-23', null)]);
    assert.equal(r?.melhor.data_ref, '2026-09-22');
    assert.equal(r?.pior.data_ref, '2026-09-21');
    assert.equal(r?.pior.nota, 55);
});

test('melhor e pior precisam de dois dias com nota diferentes', () => {
    assert.equal(melhorEPior([dia('2026-09-20', 80), dia('2026-09-21', null)]), null);
    assert.equal(melhorEPior([dia('2026-09-20', 70), dia('2026-09-21', 70)]), null);
});

test('sequência conta do mais recente para trás e para no primeiro dia abaixo', () => {
    const linhas = [dia('2026-09-20', 65), dia('2026-09-21', 71), dia('2026-09-22', null), dia('2026-09-24', 70), dia('2026-09-25', 80)];
    // O dia 22 (sem nota) e o 23 (sem relatório) não quebram.
    assert.deepEqual(sequenciaAtual(linhas), { dias: 3, desde: '2026-09-21' });
    assert.deepEqual(sequenciaAtual([dia('2026-09-25', 50)]), { dias: 0, desde: null });
});

test('dia da semana não depende do fuso', () => {
    assert.equal(diaDaSemana('2026-09-27'), 0); // domingo
    assert.equal(diaDaSemana('2026-09-23'), 3); // quarta
});

test('nota por dia da semana vai de segunda a domingo e pula dia sem nota', () => {
    const s = notaPorDiaDaSemana([dia('2026-09-21', 60), dia('2026-09-14', 70), dia('2026-09-27', 90), dia('2026-09-22', null)]);
    assert.deepEqual(s, [
        { dia: 1, nome: 'seg', nota: 65, dias: 2 },
        { dia: 0, nome: 'dom', nota: 90, dias: 1 },
    ]);
});

test('dia mais fraco precisa de margem e de dois dias de nota', () => {
    const base = [
        { dia: 1, nome: 'seg', nota: 70, dias: 3 }, { dia: 2, nome: 'ter', nota: 72, dias: 3 },
        { dia: 3, nome: 'qua', nota: 63, dias: 3 }, { dia: 4, nome: 'qui', nota: 71, dias: 3 },
    ];
    assert.equal(diaMaisFraco(base)?.nome, 'qua');
    assert.equal(diaMaisFraco(base)?.abaixo, 8);
    assert.equal(diaMaisFraco(base.map((s) => (s.dia === 3 ? { ...s, nota: 68 } : s))), null);
    assert.equal(diaMaisFraco(base.map((s) => (s.dia === 3 ? { ...s, dias: 1 } : s))), null);
});

test('virada: segunda metade menos a primeira', () => {
    const linhas = [dia('2026-09-13', 60), dia('2026-09-15', 62), dia('2026-09-22', 70), dia('2026-09-25', 74)];
    // Metades de (12/09, 19/09] e (19/09, 26/09]: 72 − 61 = 11.
    assert.equal(viradaDoPeriodo(linhas, '2026-09-26', 14), 11);
    assert.equal(viradaDoPeriodo(linhas.slice(1), '2026-09-26', 14), null);
});

test('MEC do período: média dos dias em que a etapa coube; nunca zero', () => {
    const m = mecDoPeriodo([
        { data_ref: '2026-09-24', aderencia_geral: '50', por_etapa: { acolhida: 100, sondagem: 40 } },
        { data_ref: '2026-09-25', aderencia_geral: 60, por_etapa: { acolhida: 80, sondagem: null } },
    ]);
    assert.equal(m.geral, 55);
    assert.equal(m.porEtapa.acolhida, 90);
    assert.equal(m.porEtapa.sondagem, 40);
    assert.equal(m.porEtapa.fechamento, null);
});

test('mudanças do MEC: a que mais subiu e a que mais caiu', () => {
    const atual = mecDoPeriodo([{ data_ref: 'x', aderencia_geral: 50, por_etapa: { acolhida: 90, sondagem: 61, solucao_completa: 33, fechamento: 58 } }]);
    const antes = mecDoPeriodo([{ data_ref: 'y', aderencia_geral: 42, por_etapa: { acolhida: 88, sondagem: 47, solucao_completa: 38 } }]);
    const m = mudancasDoMec(atual, antes);
    assert.deepEqual(m.subiu, { etapa: 'sondagem', nome: 'Sondagem', delta: 14 });
    assert.deepEqual(m.caiu, { etapa: 'solucao_completa', nome: 'Solução completa', delta: -5 });
    assert.deepEqual(mudancasDoMec(atual, atual), { subiu: null, caiu: null });
});

test('tempo curto', () => {
    assert.equal(tempoCurto(45), '45 s');
    assert.equal(tempoCurto(240), '4 min');
    assert.equal(tempoCurto(4800), '1 h 20 min');
    assert.equal(tempoCurto(7200), '2 h');
});
