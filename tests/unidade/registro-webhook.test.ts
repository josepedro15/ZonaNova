import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDoRegistro } from '../../lib/uazapi/registro.ts';

const pdf = {
    id: '5551999990000:3EB0ABC', messageid: '3EB0ABC', chatid: '555180156125@s.whatsapp.net', fromMe: true,
    messageType: 'DocumentMessage', text: 'conteúdo que não pode ir para o registro', fileName: 'Anexo.pdf',
    messageTimestamp: 1791487800,
};

test('o registro guarda o que serve para conferir, sem o conteúdo', () => {
    const linha = linhaDoRegistro('cx-1', 'messages', pdf, 'gravada');
    assert.deepEqual(linha, {
        conexao_id: 'cx-1', evento: 'messages', wa_message_id: '5551999990000:3EB0ABC', tipo_bruto: 'DocumentMessage',
        from_me: true, chat: '555180156125@s.whatsapp.net', enviada_em: new Date(1791487800 * 1000).toISOString(),
        destino: 'gravada', motivo: null,
    });
    assert.ok(!JSON.stringify(linha).includes('conteúdo'));
});

test('o id é o mesmo que a ingestão grava em mensagens', () => {
    assert.equal(linhaDoRegistro('cx-1', null, { messageid: 'M1' }, 'descartada').wa_message_id, 'M1');
});

test('descarte leva o motivo, cortado', () => {
    const linha = linhaDoRegistro('cx-1', 'messages', { id: 'G1', chatid: '123@g.us' }, 'descartada', 'grupo'.repeat(100));
    assert.equal(linha.destino, 'descartada');
    assert.equal(linha.motivo?.length, 200);
    assert.equal(linha.from_me, false);
});
