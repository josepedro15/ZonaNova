import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    cardVisivel, casaPalavras, janelaDaConferencia, lerConferencia, normalizar, pedidoConferencia, resumoDoCard, schemaProposta, textoDaMensagem,
} from '../../lib/monitoramento.ts';

const msg = (over: Partial<Parameters<typeof textoDaMensagem>[0]>) => ({ tipo: 'texto', conteudo: null, transcricao: null, midia_nome: null, midia_descricao: null, ...over });

test('normalizar tira acento, caixa e pontuação', () => {
    assert.equal(normalizar('Ofertas de NATAL!!  Promoção'), 'ofertas de natal promocao');
});

test('casaPalavras acha começo de palavra, sem acento', () => {
    assert.ok(casaPalavras('Segue o encarte NATALINO com as ofertas', ['natal']));
    assert.ok(casaPalavras('promoção de fim de ano', ['promocao de fim']));
    assert.ok(!casaPalavras('vou te mandar o orçamento', ['natal', 'black friday']));
    // Dentro de outra palavra não conta ("bonatal"); palavra de 1 letra é ignorada.
    assert.ok(!casaPalavras('bonatal', ['natal']));
    assert.ok(!casaPalavras('a casa', ['a']));
});

test('textoDaMensagem junta arquivo, áudio e legenda', () => {
    assert.equal(textoDaMensagem(msg({ tipo: 'documento', midia_nome: 'Ofertas Natal.pdf', conteudo: 'olha só' })), '[documento: Ofertas Natal.pdf] olha só');
    assert.equal(textoDaMensagem(msg({ tipo: 'audio', transcricao: 'temos ofertas de natal' })), '[áudio] temos ofertas de natal');
    assert.equal(textoDaMensagem(msg({ tipo: 'audio' })), '[áudio sem transcrição]');
    assert.equal(textoDaMensagem(msg({ conteudo: '  oi  ' })), 'oi');
});

test('a proposta exige período válido e no máximo 92 dias', () => {
    const base = { titulo: 'Ações de Natal', criterio: 'O vendedor mandou o encarte de Natal', palavras: ['natal'], inicio: '2026-12-01', fim: '2026-12-24', unidade_id: null };
    assert.ok(schemaProposta.safeParse(base).success);
    assert.ok(!schemaProposta.safeParse({ ...base, fim: '2026-11-30' }).success);
    assert.ok(!schemaProposta.safeParse({ ...base, fim: '2027-03-15' }).success);
    assert.ok(!schemaProposta.safeParse({ ...base, palavras: [] }).success);
    assert.ok(!schemaProposta.safeParse({ ...base, unidade_id: 'loja-1' }).success);
});

test('a janela do cron vai do início (ou de onde parou) até agora, sem passar do fim', () => {
    const m = { inicio: '2026-12-01', fim: '2026-12-24', conferido_ate: null, encerrado_em: null };
    assert.equal(janelaDaConferencia(m, new Date('2026-11-30T12:00:00-03:00')), null);
    const primeira = janelaDaConferencia(m, new Date('2026-12-02T10:00:00-03:00'))!;
    assert.equal(primeira.de.toISOString(), new Date('2026-12-01T00:00:00-03:00').toISOString());
    assert.equal(primeira.ate.toISOString(), new Date('2026-12-02T10:00:00-03:00').toISOString());
    const seguinte = janelaDaConferencia({ ...m, conferido_ate: '2026-12-02T13:00:00.000Z' }, new Date('2026-12-02T10:15:00-03:00'))!;
    assert.equal(seguinte.de.toISOString(), '2026-12-02T13:00:00.000Z');
    const depois = janelaDaConferencia({ ...m, conferido_ate: '2026-12-20T00:00:00.000Z' }, new Date('2027-01-10T10:00:00-03:00'))!;
    assert.equal(depois.ate.toISOString(), new Date('2026-12-25T00:00:00-03:00').toISOString());
    assert.equal(janelaDaConferencia({ ...m, conferido_ate: new Date('2026-12-25T00:00:00-03:00').toISOString() }, new Date('2027-01-10T10:00:00-03:00')), null);
    assert.equal(janelaDaConferencia({ ...m, encerrado_em: '2026-12-05T00:00:00Z' }, new Date('2026-12-06T10:00:00-03:00')), null);
});

test('o card aparece do início até 3 dias depois do fim', () => {
    const m = { inicio: '2026-12-01', fim: '2026-12-24', encerrado_em: null };
    assert.ok(!cardVisivel(m, '2026-11-30'));
    assert.ok(cardVisivel(m, '2026-12-01'));
    assert.ok(cardVisivel(m, '2026-12-27'));
    assert.ok(!cardVisivel(m, '2026-12-28'));
    assert.ok(!cardVisivel({ ...m, encerrado_em: '2026-12-10T00:00:00Z' }, '2026-12-11'));
});

test('a resposta da IA vale pela posição; fora do formato não marca nada', () => {
    const r = lerConferencia(JSON.stringify({ itens: [{ n: 1, conta: true }, { n: 3, conta: false }, { n: 9, conta: true }, { n: 1, conta: false }] }), 3);
    assert.deepEqual([...r], [[0, true], [2, false]]);
    assert.equal(lerConferencia('não é json', 3).size, 0);
    assert.equal(lerConferencia(JSON.stringify({ itens: [{ n: 1 }] }), 3).size, 0);
});

test('o pedido numera as mensagens e as manda como texto entre aspas', () => {
    assert.equal(pedidoConferencia([{ texto: 'oi "cliente"' }, { texto: 'segue o encarte' }]), '[1] "oi \\"cliente\\""\n[2] "segue o encarte"');
});

test('o card soma por vendedor e lista quem falta, potencial alto primeiro', () => {
    const cliente = (id: string, user: string, potencial: string | null, ultima: string) =>
        ({ conversa_id: id, user_id: user, cliente_nome: `Cliente ${id}`, cliente_telefone: '5551999990000', ultima_mensagem_em: ultima, potencial_venda: potencial });
    const base = [
        cliente('c1', 'ana', 'baixo', '2026-12-01T10:00:00Z'),
        cliente('c2', 'ana', 'alto', '2026-11-20T10:00:00Z'),
        cliente('c3', 'bia', 'medio', '2026-11-25T10:00:00Z'),
        cliente('c4', 'bia', 'alto', '2026-11-28T10:00:00Z'),
    ];
    const marcas = [
        { conversa_id: 'c1', user_id: 'ana', enviada_em: '2026-12-02T10:00:00Z', trecho: 'encarte' },
        { conversa_id: 'c1', user_id: 'ana', enviada_em: '2026-12-03T10:00:00Z', trecho: 'de novo' },
        { conversa_id: 'c3', user_id: 'bia', enviada_em: '2026-12-02T10:00:00Z', trecho: 'encarte' },
        { conversa_id: 'x9', user_id: 'bia', enviada_em: '2026-12-02T10:00:00Z', trecho: 'fora da base' },
    ];
    const r = resumoDoCard(base, marcas, new Map([['ana', 'Ana'], ['bia', 'Bia']]));
    assert.equal(r.base, 4);
    assert.equal(r.receberam, 2);
    assert.equal(r.pct, 50);
    assert.equal(r.foraDaBase, 1);
    assert.deepEqual(r.porVendedor.map((v) => [v.nome, v.receberam, v.base, v.pct]), [['Ana', 1, 2, 50], ['Bia', 1, 2, 50]]);
    assert.deepEqual(r.falta.map((f) => f.conversa_id), ['c4', 'c2']);
    assert.equal(r.falta[0].vendedor, 'Bia');
    assert.equal(resumoDoCard([], [], new Map()).pct, null);
});
