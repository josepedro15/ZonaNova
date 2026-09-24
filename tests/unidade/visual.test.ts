import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    caminhoSvg, comparaTempo, grifar, grifarConversa, iniciais, media,
    setaDoTom, tomDelta, tomEspera, tomFaixa, tomResposta,
} from '../../lib/visual.ts';

const MIN = 60 * 1000;

// --- tons -------------------------------------------------------------------

test('espera: até 30 min é neutra, até 2 h pede atenção, depois é risco', () => {
    assert.equal(tomEspera(12 * MIN), 'neutro');
    assert.equal(tomEspera(30 * MIN), 'neutro');
    assert.equal(tomEspera(31 * MIN), 'atencao');
    assert.equal(tomEspera(120 * MIN), 'atencao');
    assert.equal(tomEspera(121 * MIN), 'risco');
});

test('faixa: abaixo do risco, entre risco e atenção, acima', () => {
    assert.equal(tomFaixa(29, 35, 50), 'risco');
    assert.equal(tomFaixa(40, 35, 50), 'atencao');
    assert.equal(tomFaixa(50, 35, 50), 'azul');
});

test('delta: subir é bom quando maior é melhor', () => {
    assert.equal(tomDelta(4, 'maior'), 'bom');
    assert.equal(tomDelta(-4, 'maior'), 'risco');
});

// Tempo de resposta melhora caindo: a mesma queda é boa notícia.
test('delta: cair é bom quando menor é melhor', () => {
    assert.equal(tomDelta(-10, 'menor'), 'bom');
    assert.equal(tomDelta(10, 'menor'), 'risco');
});

test('delta nulo ou zero é neutro', () => {
    assert.equal(tomDelta(null, 'maior'), 'neutro');
    assert.equal(tomDelta(0, 'menor'), 'neutro');
});

test('seta acompanha o tom, não o sinal', () => {
    assert.equal(setaDoTom('bom'), '▲');
    assert.equal(setaDoTom('risco'), '▼');
    assert.equal(setaDoTom('neutro'), '=');
});

// --- comparação de tempo ------------------------------------------------------

test('tempo: o dobro ou mais vira "N× mais lenta"', () => {
    assert.equal(comparaTempo(125, 41), '3× mais lenta que sua média (41 min)');
});

test('tempo: metade ou menos vira "N× mais rápida", com a referência nomeada', () => {
    assert.equal(comparaTempo(14, 125, 'ontem'), '9× mais rápida que ontem (125 min)');
});

test('tempo: diferença pequena vira minutos', () => {
    assert.equal(comparaTempo(18, 12), '6 min mais lenta que sua média');
    assert.equal(comparaTempo(9, 12), '3 min mais rápida que sua média');
});

test('tempo: igual diz sem mudança', () => {
    assert.equal(comparaTempo(12.2, 11.8), 'sem mudança (sua média: 12 min)');
});

// --- média --------------------------------------------------------------------

test('média ignora nulos e aceita número que chega como texto do PostgREST', () => {
    assert.equal(media([10, null, '20', undefined]), 15);
});

test('média sem valor nenhum é null, nunca zero', () => {
    assert.equal(media([null, undefined, '']), null);
    assert.equal(media([]), null);
});

// --- iniciais -----------------------------------------------------------------

test('iniciais: primeiro e último nome', () => {
    assert.equal(iniciais('Marcos da Silva Teixeira'), 'MT');
    assert.equal(iniciais('Nexo'), 'NE');
});

// Sem nome, um ícone de pessoa é mais honesto que dígitos de telefone.
test('iniciais: sem nome devolve null', () => {
    assert.equal(iniciais(null), null);
    assert.equal(iniciais('   '), null);
});

// --- grifo de evidência ---------------------------------------------------------

test('grifa o trecho citado, ignorando aspas, reticências e maiúsculas', () => {
    assert.deepEqual(grifar('Bom dia! É obra nova ou repintura?', ['"é obra nova ou repintura?"']), [
        { texto: 'Bom dia! ', grifo: null },
        { texto: 'É obra nova ou repintura?', grifo: 1 },
    ]);
});

test('o número do grifo é a posição da evidência na lista', () => {
    const p = grifar('a obra tá atrasada e eu preciso pintar', ['outro trecho', 'a obra tá atrasada…']);
    assert.deepEqual(p[0], { texto: 'a obra tá atrasada', grifo: 2 });
});

// Grifar errado é pior que não grifar.
test('sem correspondência exata, não grifa nada', () => {
    assert.deepEqual(grifar('Consigo 1.310 à vista', ['consigo fazer por 1.310']), [
        { texto: 'Consigo 1.310 à vista', grifo: null },
    ]);
});

test('trecho curto demais é ignorado', () => {
    assert.deepEqual(grifar('ok, fechado', ['ok']), [{ texto: 'ok, fechado', grifo: null }]);
});

test('na conversa, cada evidência grifa só a primeira mensagem onde aparece', () => {
    const r = grifarConversa(['tem argamassa?', 'tem argamassa sim'], ['tem argamassa']);
    assert.equal(r[0].find((p) => p.grifo !== null)?.grifo, 1);
    assert.equal(r[1].every((p) => p.grifo === null), true);
});

test('grifa trecho entre aspas curvas', () => {
    assert.deepEqual(grifar('Bom dia! É obra nova ou repintura?', ['“é obra nova ou repintura?”'])[1], 
        { texto: 'É obra nova ou repintura?', grifo: 1 });
});

// --- SVG ----------------------------------------------------------------------

test('caminho SVG recomeça depois de um buraco', () => {
    assert.equal(caminhoSvg([[0, 10], [5, 20], null, [15, 5]]), 'M0 10 L5 20 M15 5');
});

// --- resposta -------------------------------------------------------------

test('resposta: até 15 min é neutra, acima de 15 pede atenção', () => {
    assert.equal(tomResposta(15), 'neutro');
    assert.equal(tomResposta(16), 'atencao');
});
