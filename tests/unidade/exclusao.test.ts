import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comNomesConhecidos, estaFora, nomesDoContato } from '../../lib/exclusao.ts';
import { normalizarMensagem, type MensagemNormalizada } from '../../lib/uazapi/normalizar.ts';

const VAZIAS = { pessoais: [], internos: [], colegas: [] };

test('ninguém nas listas: contato entra na análise', () => {
    assert.equal(estaFora('5554998124471', VAZIAS), false);
});

test('lista pessoal do vendedor tira o contato', () => {
    assert.equal(estaFora('5554998124471', { ...VAZIAS, pessoais: ['5554998124471'] }), true);
});

// O Depósito cadastrado pelo gestor vale para todos os vendedores da loja.
test('lista interna da loja tira o contato', () => {
    assert.equal(estaFora('5554932100001', { ...VAZIAS, internos: ['5554932100001'] }), true);
});

test('número de colega conectado é conversa de trabalho', () => {
    assert.equal(estaFora('5554991112222', { ...VAZIAS, colegas: ['5554991112222'] }), true);
});

// O JID chega sem o nono dígito; o gestor digitou com ele.
test('casa com e sem o nono dígito, nos dois sentidos', () => {
    assert.equal(estaFora('555498124471', { ...VAZIAS, internos: ['5554998124471'] }), true);
    assert.equal(estaFora('5554998124471', { ...VAZIAS, colegas: ['555498124471'] }), true);
});

test('contato @lid só casa com o próprio identificador', () => {
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['lid:123456789012345'] }), true);
    assert.equal(estaFora('lid:123456789012345', { ...VAZIAS, pessoais: ['123456789012345'] }), false);
});

// --- o mesmo contato pelo LID ---------------------------------------------------

// O Marco, 09/10: o Rafael bloqueado pelo telefone e o colega conectado
// chegavam também só pelo LID (history, reinjeção, webhook sem `chat`).
const RAFAEL_PESSOAL = '5551999991025';
const RAFAEL_CONECTADO = '5551999997768';
const LID_PESSOAL = '168500000002955';
const LID_CONECTADO = '176800000006429';
const LISTAS_DO_MARCO = { pessoais: [RAFAEL_PESSOAL, RAFAEL_CONECTADO], internos: [], colegas: [RAFAEL_CONECTADO] };
/** O que as conversas do Marco ligam (conversas.cliente_lid, 0031). */
const CONHECIDOS = [
    { telefone: RAFAEL_PESSOAL, lid: LID_PESSOAL },
    { telefone: RAFAEL_CONECTADO, lid: LID_CONECTADO },
];

const soPeloLid = (lid: string): MensagemNormalizada => {
    const m = normalizarMensagem({ message: { id: 'MSG1', chatid: `${lid}@lid`, messageType: 'conversation', text: 'oi', messageTimestamp: 1789436742 } });
    assert.ok(!('descartar' in m));
    return m as MensagemNormalizada;
};

/** Como a ingestão decide: algum nome do contato em alguma lista. */
const ingestaoDescarta = (m: MensagemNormalizada, listas: typeof VAZIAS | typeof LISTAS_DO_MARCO, conhecidos = CONHECIDOS) =>
    nomesDoContato({ telefone: m.clienteTelefone, lid: m.clienteLid }, conhecidos).some((n) => estaFora(n, listas));

test('mensagem só pelo LID de contato bloqueado pelo telefone é descartada', () => {
    const m = soPeloLid(LID_PESSOAL);
    assert.equal(m.clienteTelefone, `lid:${LID_PESSOAL}`);
    assert.equal(estaFora(m.clienteTelefone, LISTAS_DO_MARCO), false, 'sem o LID, a regra deixava passar');
    assert.equal(ingestaoDescarta(m, LISTAS_DO_MARCO), true);
    assert.equal(estaFora(m.clienteTelefone, comNomesConhecidos(LISTAS_DO_MARCO, CONHECIDOS)), true);
});

test('colega conectado que chega pelo LID é conversa de trabalho', () => {
    const m = soPeloLid(LID_CONECTADO);
    const listas = { ...VAZIAS, colegas: [RAFAEL_CONECTADO] };
    assert.equal(ingestaoDescarta(m, listas), true);
    assert.equal(estaFora(m.clienteTelefone, comNomesConhecidos(listas, CONHECIDOS)), true);
});

test('conversa gravada sem o nono dígito liga o LID ao bloqueio digitado com ele', () => {
    const m = soPeloLid(LID_PESSOAL);
    const conhecidos = [{ telefone: '555199991025', lid: LID_PESSOAL }];
    assert.equal(ingestaoDescarta(m, LISTAS_DO_MARCO, conhecidos), true);
    assert.equal(estaFora(m.clienteTelefone, comNomesConhecidos(LISTAS_DO_MARCO, conhecidos)), true);
});

// Bloqueado pelo botão de uma conversa `lid:`, que depois ganhou o telefone.
test('bloqueio da conversa lid: barra o contato que chega pelo número', () => {
    const listas = { ...VAZIAS, pessoais: [`lid:${LID_PESSOAL}`] };
    // Com o LID na própria mensagem, nem precisa de conversa que ligue.
    assert.equal(nomesDoContato({ telefone: RAFAEL_PESSOAL, lid: LID_PESSOAL }, []).some((n) => estaFora(n, listas)), true);
    // Só com o número: quem liga é a conversa.
    assert.equal(nomesDoContato({ telefone: RAFAEL_PESSOAL, lid: null }, CONHECIDOS).some((n) => estaFora(n, listas)), true);
    assert.equal(estaFora(RAFAEL_PESSOAL, comNomesConhecidos(listas, CONHECIDOS)), true);
});

test('LID que nenhuma conversa liga a um bloqueado continua na análise', () => {
    const cliente = soPeloLid('199900000001234');
    assert.equal(ingestaoDescarta(cliente, LISTAS_DO_MARCO), false);
    assert.equal(estaFora(cliente.clienteTelefone, comNomesConhecidos(LISTAS_DO_MARCO, CONHECIDOS)), false);
    // Nem a ligação de um contato contamina outro.
    assert.equal(ingestaoDescarta(soPeloLid(LID_PESSOAL), { ...VAZIAS, pessoais: [RAFAEL_CONECTADO] }), false);
});
