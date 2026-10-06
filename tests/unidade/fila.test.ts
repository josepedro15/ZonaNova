import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aposFalha, aposFalhaDoItem, proximaTentativa, MAX_TENTATIVAS } from '../../lib/fila.ts';

const T0 = new Date('2026-09-15T12:00:00Z');
const minutosDepois = (d: Date) => (d.getTime() - T0.getTime()) / 60_000;

test('o backoff cresce e nunca é menor que o intervalo do cron', () => {
    assert.equal(minutosDepois(proximaTentativa(1, T0)), 5);
    assert.equal(minutosDepois(proximaTentativa(2, T0)), 20);
    assert.equal(minutosDepois(proximaTentativa(3, T0)), 45);
});

test('as três primeiras falhas reagendam', () => {
    for (const anteriores of [0, 1, 2]) {
        const d = aposFalha(anteriores, T0);
        assert.equal(d.status, 'pendente', `tentativa ${anteriores + 1}`);
        assert.equal(d.tentativas, anteriores + 1);
    }
});

// O doc 3 §3.4: "tentativas 1, 2, 3. Na 4ª, falhou definitivo."
test('a quarta falha desiste', () => {
    const d = aposFalha(MAX_TENTATIVAS, T0);
    assert.equal(d.status, 'falhou');
    assert.equal(d.tentativas, 4);
});

test('item que desistiu não volta a ser reagendado', () => {
    assert.equal(aposFalha(9, T0).status, 'falhou');
});

// Em 06/10 a consolidação de 03/10 desandou até o max_output_tokens e, na
// repetição, saiu normal dez vezes seguidas: no relatório o corte não se repete.
test('relatório com resposta incompleta da OpenAI tenta de novo', () => {
    const d = aposFalhaDoItem('relatorio_vendedor', true, 0, T0);
    assert.equal(d.status, 'pendente');
    assert.equal(d.tentativas, 1);
});

test('relatório com resposta incompleta também desiste na quarta falha', () => {
    assert.equal(aposFalhaDoItem('relatorio_vendedor', true, MAX_TENTATIVAS, T0).status, 'falhou');
});

// Na análise, a resposta incompleta vem da conversa grande demais: repetir dá o
// mesmo corte e paga de novo.
test('análise com resposta incompleta desiste na hora', () => {
    const d = aposFalhaDoItem('analise_conversa', true, 0, T0);
    assert.equal(d.status, 'falhou');
    assert.equal(d.tentativas, 1);
});

test('falha comum segue o backoff em qualquer tipo', () => {
    assert.equal(aposFalhaDoItem('analise_conversa', false, 0, T0).status, 'pendente');
    assert.equal(aposFalhaDoItem('relatorio_vendedor', false, 0, T0).status, 'pendente');
});
