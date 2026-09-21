import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mensagensDoEvento, normalizarMensagem, statusDeConexao, soDigitos, paraData,
    type EventoUazapi, type MensagemNormalizada,
} from '../../lib/uazapi/normalizar.ts';

const ok = (r: ReturnType<typeof normalizarMensagem>): MensagemNormalizada => {
    assert.ok(!('descartar' in r), `esperava mensagem, veio descarte: ${JSON.stringify(r)}`);
    return r as MensagemNormalizada;
};
const motivo = (r: ReturnType<typeof normalizarMensagem>): string => {
    assert.ok('descartar' in r, 'esperava descarte, veio mensagem');
    return (r as { motivo: string }).motivo;
};

const base = (m: Partial<NonNullable<EventoUazapi['message']>> = {}): EventoUazapi => ({
    message: {
        id: 'MSG1', chatid: '5554999998888@s.whatsapp.net',
        messageType: 'conversation', text: 'oi', messageTimestamp: 1789436742, ...m,
    },
});

test('extrai o telefone do jid', () => {
    assert.equal(soDigitos('5554999998888@s.whatsapp.net'), '5554999998888');
    assert.equal(soDigitos('5554999998888:12@s.whatsapp.net'), '5554999998888');
});

test('timestamp em segundos e em milissegundos dão a mesma data', () => {
    assert.equal(paraData(1789436742).toISOString(), paraData(1789436742000).toISOString());
});

test('mensagem de cliente vira entrada', () => {
    const m = ok(normalizarMensagem(base()));
    assert.equal(m.direcao, 'entrada');
    assert.equal(m.clienteTelefone, '5554999998888');
    assert.equal(m.conteudo, 'oi');
    assert.equal(m.tipo, 'texto');
    assert.equal(m.automatica, false);
});

test('mensagem do vendedor vira saida', () => {
    assert.equal(ok(normalizarMensagem(base({ fromMe: true }))).direcao, 'saida');
});

// O doc 3 §3.2 manda descartar isto na entrada. Sem estes três, o relatório do
// vendedor enche de ruído e a média dele despenca por dado que não é dele.
test('descarta grupo, status e broadcast', () => {
    assert.equal(motivo(normalizarMensagem(base({ chatid: '12345@g.us' }))), 'grupo');
    assert.equal(motivo(normalizarMensagem(base({ isGroup: true }))), 'grupo');
    assert.equal(motivo(normalizarMensagem(base({ chatid: 'status@broadcast' }))), 'status/broadcast');
});

test('descarta mensagem sem id — idempotência depende dele', () => {
    assert.match(motivo(normalizarMensagem(base({ id: undefined }))), /id/);
});

test('aceita os apelidos de id, texto e mídia que a UAZAPI alterna', () => {
    const m = ok(normalizarMensagem({
        message: {
            messageid: 'MSG2', sender: '5554999998888@s.whatsapp.net',
            type: 'imageMessage', caption: 'foto da laje', file: 'https://x/y.jpg',
            timestamp: 1789436742000,
        },
    }));
    assert.equal(m.waMessageId, 'MSG2');
    assert.equal(m.tipo, 'imagem');
    assert.equal(m.conteudo, 'foto da laje');
    assert.equal(m.midiaUrl, 'https://x/y.jpg');
});

test('áudio é reconhecido em todas as grafias (vai para a fila de transcrição)', () => {
    for (const t of ['audioMessage', 'audio', 'ptt', 'AUDIO_MESSAGE']) {
        assert.equal(ok(normalizarMensagem(base({ messageType: t }))).tipo, 'audio', t);
    }
});

test('tipo desconhecido vira "outro", não quebra a ingestão', () => {
    assert.equal(ok(normalizarMensagem(base({ messageType: 'stickerMessage' }))).tipo, 'outro');
});

test('mensagem disparada pela API é marcada automatica', () => {
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, fromApi: true }))).automatica, true);
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, wasSentByApi: true }))).automatica, true);
});

test('extrai todas as mensagens de um lote de histórico', () => {
    const messages = [{ id: '1' }, { id: '2' }];
    assert.deepEqual(mensagensDoEvento({ EventType: 'history', event: 'messages', messages }), messages);
    assert.deepEqual(mensagensDoEvento(base()), [base().message]);
});

test('texto vazio vira null, não string vazia', () => {
    assert.equal(ok(normalizarMensagem(base({ text: '' }))).conteudo, null);
});

test('status de conexão mapeia para o vocabulário do banco', () => {
    assert.equal(statusDeConexao({ instance: { status: 'connected' } }), 'conectada');
    assert.equal(statusDeConexao({ status: 'disconnected' }), 'caida');
    assert.equal(statusDeConexao({ status: 'qrcode' }), 'aguardando_qr');
    assert.equal(statusDeConexao({ status: 'sei lá' }), null);
});
