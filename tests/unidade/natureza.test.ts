import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparSugestoes, aplicarSinal, CONFIANCA_CADASTRO, CONFIANCA_NOME, LIMIAR_NATUREZA, naturezaDaDescricao, naturezaSuspeita, REGRA_NATUREZA, sinalDaOferta, sinalDoContato, sinalDoNome, type LinhaSugestao } from '../../lib/natureza.ts';
import { schemaJsonAnalise } from '../../lib/analise.ts';
import { pedidoAnalise } from '../../lib/pedido-analise.ts';

test('suspeita só com natureza diferente de cliente e confiança no limiar', () => {
    assert.equal(naturezaSuspeita({ natureza_contato: 'fornecedor_ou_parceiro', confianca_natureza: LIMIAR_NATUREZA }), 'fornecedor_ou_parceiro');
    assert.equal(naturezaSuspeita({ natureza_contato: 'colega_ou_loja', confianca_natureza: '92' }), 'colega_ou_loja');
    assert.equal(naturezaSuspeita({ natureza_contato: 'pessoal', confianca_natureza: LIMIAR_NATUREZA - 1 }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'cliente', confianca_natureza: 100 }), null);
});

test('payload antigo, estranho ou vazio continua sendo cliente', () => {
    assert.equal(naturezaSuspeita({ resumo: 'análise de antes do campo' }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'agencia', confianca_natureza: 99 }), null);
    assert.equal(naturezaSuspeita({ natureza_contato: 'pessoal', confianca_natureza: null }), null);
    assert.equal(naturezaSuspeita(null), null);
    assert.equal(naturezaSuspeita('texto'), null);
});

test('uma sugestão por número da loja, com o motivo do dia mais recente', () => {
    const l = (telefone: string, data_ref: string, natureza: string, confianca: number, evidencia = '', unidade_id = 'u1'): LinhaSugestao =>
        ({ unidade_id, telefone, nome: ' Agência X ', data_ref, payload: { natureza_contato: natureza, confianca_natureza: confianca, evidencia_natureza: evidencia } });
    const r = agruparSugestoes([
        l('5551999990000', '2026-10-01', 'fornecedor_ou_parceiro', 85, 'boleto da campanha'),
        l('5551999990000', '2026-10-05', 'fornecedor_ou_parceiro', 95, ' relatório do Meta Ads '),
        // Outro vendedor, mesmo número e dia: conta um dia só.
        l('5551999990000', '2026-10-05', 'fornecedor_ou_parceiro', 90),
        l('5551999990000', '2026-10-06', 'cliente', 99),
        l('5551888880000', '2026-10-04', 'colega_ou_loja', 70),
        l('5551999990000', '2026-10-03', 'pessoal', 88, '', 'u2'),
    ]);
    assert.deepEqual(r, [
        { unidade_id: 'u1', telefone: '5551999990000', nome: 'Agência X', natureza: 'fornecedor_ou_parceiro', confianca: 95, evidencia: 'relatório do Meta Ads', ultimo_dia: '2026-10-05', dias: 2 },
        { unidade_id: 'u2', telefone: '5551999990000', nome: 'Agência X', natureza: 'pessoal', confianca: 88, evidencia: '', ultimo_dia: '2026-10-03', dias: 1 },
    ]);
});

test('o pedido da análise leva a regra e o campo da natureza', () => {
    const { corpo, schema } = pedidoAnalise({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' });
    assert.ok(corpo.instructions.includes(REGRA_NATUREZA));
    assert.ok(schemaJsonAnalise.required.includes('natureza_contato'));
    assert.equal(schema.json, schemaJsonAnalise);
});

// O gestor disse "É cliente": a conversa volta para as contas e não é mais sugerida.
test('sugestão descartada pelo gestor deixa de ser suspeita', () => {
    const p = { natureza_contato: 'colega_ou_loja', confianca_natureza: 95 };
    assert.equal(naturezaSuspeita(p), 'colega_ou_loja');
    assert.equal(naturezaSuspeita({ ...p, natureza_descartada: true }), null);
    assert.equal(naturezaSuspeita({ ...p, natureza_descartada: 'true' }), null);
});

// Auditoria de 07/10: motorista, comprador e marketing saíam cliente, mesmo com
// o cargo no nome ou o número já cadastrado como interno em outra loja.
test('cargo ou setor no nome é sinal de colega; nome de pessoa ou de empresa de cliente, não', () => {
    for (const nome of ['Silas MKT Redemac Zona Nova', 'Bongo 84', 'Bongo67 Evandro', 'Dinael(montanha)Motora Cd', 'TIAGO GAMA MOTORISTA', 'Crediário Redemac Zona Nova Center', 'Recursos Humanos', 'Pablo Compras']) {
        assert.equal(sinalDoNome(nome)?.natureza, 'colega_ou_loja', nome);
    }
    assert.equal(sinalDoNome('Adenilza Representante')?.natureza, 'fornecedor_ou_parceiro');
    assert.equal(sinalDoNome('Silas MKT')?.confianca, CONFIANCA_NOME);
    assert.match(sinalDoNome('Silas MKT')!.evidencia, /Silas MKT/);
    for (const nome of ['Mateus Xavier', 'Depósito São José', 'Construtora Cdz', 'Bongo', 'Marcelo Entregas', 'Mercado', '', null, undefined]) {
        assert.equal(sinalDoNome(nome), null, String(nome));
    }
});

test('a descrição do cadastro diz a natureza; sem pista, colega', () => {
    assert.equal(naturezaDaDescricao('jana — Pessoal'), 'pessoal');
    assert.equal(naturezaDaDescricao('lidiane part'), 'pessoal');
    assert.equal(naturezaDaDescricao('Heitor Machado 5 — Fornecedor ou parceiro'), 'fornecedor_ou_parceiro');
    assert.equal(naturezaDaDescricao('MATHEUS COMPRAS'), 'colega_ou_loja');
    assert.equal(naturezaDaDescricao('Partners'), 'colega_ou_loja');
});

test('o cadastro em qualquer loja da rede vence o nome', () => {
    const s = sinalDoContato({ nome: 'Bongo 84', cadastros: [{ unidade: 'Venda Externa', descricao: 'MATHEUS COMPRAS' }] });
    assert.deepEqual(s, { natureza: 'colega_ou_loja', confianca: CONFIANCA_CADASTRO, evidencia: 'Cadastrado como contato interno em Venda Externa: "MATHEUS COMPRAS"' });
    assert.equal(sinalDoContato({ nome: 'Bongo 84', cadastros: [] })?.confianca, CONFIANCA_NOME);
    assert.equal(sinalDoContato({ nome: 'Sergio', cadastros: [] }), null);
});

test('a representante que manda tabela com preço e estoque dela é fornecedora', () => {
    const t = ['C: "Bom dia"', `C: ${JSON.stringify('Porcelanato Esmaltado\nLM URBANO CINZA AC 120X120 R\nR$32,56M² \nEstoque 273,60m2')}`].join('\n');
    const s = sinalDaOferta(t);
    assert.equal(s?.natureza, 'fornecedor_ou_parceiro');
    assert.match(s!.evidencia, /Estoque 273,60m2/);
    // Cliente perguntando o estoque da loja, ou o vendedor mandando preço e estoque, não é oferta.
    assert.equal(sinalDaOferta('C: "Tem estoque? Quanto fica?"\nV: "R$ 32,56 o m², estoque 273m²"'), null);
    assert.equal(sinalDaOferta('C: [automática] "Promoção R$ 10, estoque 5 unidades"'), null);
});

test('o sinal troca a natureza da IA, sem mexer em tipo nem status', () => {
    const r = { natureza_contato: 'cliente' as const, confianca_natureza: 90, evidencia_natureza: '', tipo_conversa: 'negociacao', status: 'venda_feita' };
    const sinal = { natureza: 'colega_ou_loja' as const, confianca: CONFIANCA_CADASTRO, evidencia: 'cadastro' };
    assert.deepEqual(aplicarSinal(r, sinal), { ...r, natureza_contato: 'colega_ou_loja', confianca_natureza: CONFIANCA_CADASTRO, evidencia_natureza: 'cadastro' });
    assert.equal(aplicarSinal(r, null), r);
    // A IA já viu, com confiança, alguém de fora: fica a leitura dela.
    const fornecedor = { ...r, natureza_contato: 'fornecedor_ou_parceiro' as const, confianca_natureza: LIMIAR_NATUREZA };
    assert.equal(aplicarSinal(fornecedor, sinal), fornecedor);
    // ...mas com confiança baixa, o sinal vence.
    assert.equal(aplicarSinal({ ...fornecedor, confianca_natureza: 60 }, sinal).natureza_contato, 'colega_ou_loja');
});
