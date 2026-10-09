import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mensagensDoEvento, normalizarMensagem, statusDeConexao, soDigitos, paraData, ehRespostaAutomatica,
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
    const m = ok(normalizarMensagem(base({ messageType: 'pollCreationMessage', text: undefined })));
    assert.equal(m.tipo, 'outro');
    assert.equal(m.conteudo, null);
});

// Cliente que encerra com figurinha: sem a marca, a IA via só "[Mídia: outro]".
test('figurinha, reação, contato, álbum e localização ganham marca legível', () => {
    const conteudo = (m: Partial<NonNullable<EventoUazapi['message']>>) => ok(normalizarMensagem(base({ text: undefined, ...m }))).conteudo;
    assert.equal(conteudo({ messageType: 'stickerMessage' }), '[figurinha]');
    assert.equal(conteudo({ messageType: 'StickerMessage', caption: '' }), '[figurinha]');
    assert.equal(conteudo({ messageType: 'reactionMessage', text: '👍' }), '[reagiu com 👍]');
    assert.equal(conteudo({ messageType: 'reactionMessage' }), '[reação]');
    assert.equal(conteudo({ messageType: 'contactMessage', content: 'BEGIN:VCARD\nVERSION:3.0\nFN:Lidiane Vendedora\nTEL:+55 51 9627-5340\nEND:VCARD' }), '[contato compartilhado: Lidiane Vendedora]');
    assert.equal(conteudo({ messageType: 'contactMessage' }), '[contato compartilhado]');
    assert.equal(conteudo({ messageType: 'locationMessage' }), '[localização]');
    assert.equal(conteudo({ messageType: 'albumMessage', content: 'Album: 7 images' }), '[álbum com 7 fotos]');
    // O nome do tipo pode não vir; o álbum e o cartão de contato se reconhecem pelo texto.
    assert.equal(conteudo({ messageType: 'algoNovo', content: 'Album: 2 images' }), '[álbum com 2 fotos]');
    assert.equal(conteudo({ messageType: 'algoNovo', content: 'Lidiane Vendedora Acabamento Capão\nPhone: +55 51 9627-5340\nX-Wa-Biz-Name: Lidiane' }), '[contato compartilhado: Lidiane Vendedora Acabamento Capão]');
    assert.equal(ok(normalizarMensagem(base({ messageType: 'stickerMessage' }))).tipo, 'outro', 'sem migração: o tipo no banco continua outro');
});

test('texto comum não ganha marca', () => {
    assert.equal(ok(normalizarMensagem(base({ messageType: 'conversation', text: 'Album: 2 images' }))).conteudo, 'Album: 2 images');
});

test('mensagem disparada pela API é marcada automatica', () => {
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, fromApi: true }))).automatica, true);
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, wasSentByApi: true }))).automatica, true);
});

// Textos reais (07/10): a saudação e a ausência do WhatsApp Business saem do
// aparelho, não da API — `fromApi` vem falso e só o texto as denuncia.
const AUTOMATICAS = [
    '*Olá!* Você entrou em contato com o televendas da Redemac Zona Nova - Capão da Canoa! 📲\n\nAgradecemos sua mensagem, assim que possível daremos retorno.',
    'Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.',
    'Agradecemos sua mensagem. Horário das nossas lojas 07:30 ao 12:00 / 13:00 ás 17:30 de Segunda a Sexta feira.',
    'Prezado Condômino, Recebemos sua mensagem e retornaremos o mais breve possível! Horários de atendimento da administração',
    'Olá! No momento estou fora do horário de atendimento. Assim que retornar, responderei sua mensagem. Obrigada pela compreensão.',
    'O Crediário Redemac Zona Nova Xangri-lá agradece sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.',
    'CKS Incorporações agradece seu contato. Retornaremos em breve.',
    '📩 Olá! Agradecemos por entrar em contato com a Contamec. No momento, nossa equipe está em atendimento, mas em breve retornaremos a sua mensagem.',
    'RB Garden recebeu sua mensagem! 🪴 Em breve retornaremos o contato.',
    'Olá, seja bem-vindo a Haeser Engenharia! Retornaremos seu contato o mais breve possível.',
    '✅ Atendimento concluído, mensagem automática! Favor não responder!',
    '*Holme Barbearia agradece seu contato!* No momento estou ocupado. Envie sua mensagem que, assim que possível, retornarei.',
];

// O que gente escreve, inclusive com as mesmas palavras soltas.
const HUMANAS = [
    'Bom dia', '*Vitória*\nBoa tarde, tudo bem!?', 'Nós que agradecemos', 'nós que agradecemos!!',
    'Agradecemos pela parceria e confiança ao longo deste ano.', 'O financeiro entrou em contato',
    'Tu ja entrou em contato com o nosso crediario?', 'Segue o recibo da venda. Agradecemos!',
    'Tranquilo, assim que ele tirar o material eu te envio quanto deu e o crediário automaticamente vai te enviar uma NF',
    '⚠️ AVISO IMPORTANTE: Atualização Manual do Sistema ⚠️ Tivemos um pequeno problema técnico no nosso atualizador automático de sistema.',
    'Desculpa eu não estava na loja ontem', 'Já te envio o orçamento.',
];

test('resposta automática do WhatsApp Business é reconhecida pelo texto', () => {
    for (const texto of AUTOMATICAS) assert.equal(ehRespostaAutomatica(texto), true, texto);
});

test('o que gente escreve não vira automática', () => {
    for (const texto of HUMANAS) assert.equal(ehRespostaAutomatica(texto), false, texto);
    assert.equal(ehRespostaAutomatica(null), false);
});

test('a saudação do vendedor e a ausência do cliente chegam marcadas', () => {
    const [saudacao, ausencia] = AUTOMATICAS;
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, text: saudacao }))).automatica, true);
    assert.equal(ok(normalizarMensagem(base({ text: ausencia }))).automatica, true, 'do lado do cliente também');
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, text: 'Bom dia' }))).automatica, false);
});

// 07/10: 124 mídias gravadas com o objeto do WhatsApp em texto no `conteudo`
// ({"URL":…,"mediaKey":…}), a maioria vinda do `history`.
test('mídia que chega serializada em texto vira mídia, não conteúdo', () => {
    const doc = JSON.stringify({ URL: 'https://mmg.whatsapp.net/x', mediaKey: 'k', mimetype: 'application/pdf', fileName: 'Anexo.pdf', title: 'Anexo.pdf' });
    const foto = JSON.stringify({ URL: 'https://mmg.whatsapp.net/y', directPath: '/v/t62', mimetype: 'image/jpeg', caption: 'esse aqui' });
    const d = ok(normalizarMensagem(base({ messageType: 'documentMessage', text: '', content: doc })));
    assert.equal(d.conteudo, null);
    assert.equal(d.midiaNome, 'Anexo.pdf');
    assert.equal(ok(normalizarMensagem(base({ messageType: 'imageMessage', text: foto }))).conteudo, 'esse aqui', 'fica só a legenda');
    assert.equal(ok(normalizarMensagem(base({ messageType: 'audioMessage', text: '', content: JSON.stringify({ URL: 'u', PTT: true }) }))).conteudo, null);
    assert.equal(ok(normalizarMensagem(base({ text: '{"preço": 10}' }))).conteudo, '{"preço": 10}', 'texto com chaves continua texto');
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

// Em mensagem enviada, o pushName é o do próprio vendedor. Se fosse gravado,
// cada resposta dele renomearia o cliente na conversa.
test('mensagem enviada não carrega nome de cliente', () => {
    assert.equal(ok(normalizarMensagem(base({ fromMe: true, senderName: 'Vendedor', pushName: 'Vendedor' }))).clienteNome, null);
    assert.equal(ok(normalizarMensagem(base({ senderName: 'Cliente' }))).clienteNome, 'Cliente');
});

test('canal do WhatsApp é descartado', () => {
    assert.equal(motivo(normalizarMensagem(base({ chatid: '120363000000000000@newsletter' }))), 'canal');
});

// LID não é telefone: guardado com prefixo para a tela não inventar número.
test('contato @lid vira lid:<dígitos>', () => {
    assert.equal(ok(normalizarMensagem(base({ chatid: '123456789012345@lid' }))).clienteTelefone, 'lid:123456789012345');
});

// Na mídia, a UAZAPI manda em `content` o objeto da mensagem do WhatsApp. O
// nome do documento ("orçamento.pdf") é o que a análise consegue usar de graça.
test('documento traz o nome do arquivo; o objeto da mídia não vira texto', () => {
    const m = ok(normalizarMensagem(base({
        messageType: 'documentMessage', text: '',
        content: { fileName: 'orçamento dos cromados.pdf', mimetype: 'application/pdf' },
    })));
    assert.equal(m.tipo, 'documento');
    assert.equal(m.midiaNome, 'orçamento dos cromados.pdf');
    assert.equal(m.conteudo, null);
});

test('nome do arquivo também pelos apelidos, limpo e curto', () => {
    assert.equal(ok(normalizarMensagem(base({ messageType: 'document', fileName: ' a\nb.pdf ' }))).midiaNome, 'a b.pdf');
    assert.equal(ok(normalizarMensagem(base({ messageType: 'document', content: { title: 'Pedido 77' } }))).midiaNome, 'Pedido 77');
    const longo = ok(normalizarMensagem(base({ messageType: 'document', fileName: `${'x'.repeat(200)}.pdf` }))).midiaNome!;
    assert.equal(longo.length, 121);
});

test('legenda da mídia ainda é o texto; imagem não tem nome de arquivo', () => {
    const m = ok(normalizarMensagem(base({ messageType: 'imageMessage', text: undefined, content: { caption: 'foto da laje', fileName: 'IMG-1.jpg' } })));
    assert.equal(m.conteudo, 'foto da laje');
    assert.equal(m.midiaNome, null);
    assert.equal(ok(normalizarMensagem(base())).midiaNome, null);
});
