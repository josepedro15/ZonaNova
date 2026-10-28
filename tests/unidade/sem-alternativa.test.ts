import test from 'node:test';
import assert from 'node:assert/strict';
import { citadosNaConversa, regraSemAlternativa, semCobrarAlternativa, type ProdutoSemAlternativa } from '../../lib/sem-alternativa.ts';

const LISTA: ProdutoSemAlternativa[] = [
    { produto: 'Porcelanato 120X120', observacao: 'a rede não trabalha grande formato' },
    { produto: 'tinta', observacao: null },
    { produto: 'Telha de vidro', observacao: null },
];

test('produto da lista é achado na conversa sem caixa, acento nem pedaço de palavra', () => {
    const transcript = ['C: "Vocês têm porcelanato 120x120?"', 'V: "Não trabalhamos com esse formato"'].join('\n');
    assert.deepEqual(citadosNaConversa(LISTA, transcript).map((p) => p.produto), ['Porcelanato 120X120']);
    // "tinta" não acha "tintas"; "telha" sozinha não acha "telha de vidro".
    assert.deepEqual(citadosNaConversa(LISTA, 'C: "Quero tintas spray e uma telha"'), []);
    assert.deepEqual(citadosNaConversa(LISTA, 'C: "Tem TELHA DE VIDRO?"').map((p) => p.produto), ['Telha de vidro']);
    assert.deepEqual(citadosNaConversa([], 'C: "porcelanato 120x120"'), []);
});

test('a regra só existe com produto citado e leva a observação do admin', () => {
    assert.equal(regraSemAlternativa([]), '');
    const regra = regraSemAlternativa([LISTA[0]!]);
    assert.match(regra, /"Porcelanato 120X120" \(a rede não trabalha grande formato\)/);
    assert.match(regra, /não entra em erros_vendedor/);
});

// Silas, 27/10: "não foi sugerida alternativa de produto" quando a rede não
// tem alternativa nenhuma.
test('a cobrança de alternativa ligada ao produto da lista sai; o resto fica', () => {
    const citados = [LISTA[0]!];
    const erros = [
        'Não sugeriu alternativa ao porcelanato 120x120',
        'Não ofereceu alternativas em casos de produto indisponível',
        'Não ofereceu alternativa ao rejunte',
        'Não cumprimentou o cliente',
    ];
    assert.deepEqual(semCobrarAlternativa(erros, citados), ['Não ofereceu alternativa ao rejunte', 'Não cumprimentou o cliente']);
    assert.deepEqual(semCobrarAlternativa(erros, []), erros);
});
