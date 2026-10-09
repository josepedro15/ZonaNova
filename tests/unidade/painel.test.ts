import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desde, diasAte, juntarPorDia, numerosDoFechamento, primeiroNome, esperaDoCliente, esperaNaLista, INICIO_DA_LISTA_DE_ESPERA, esperaEmTexto, marcadaDepoisDoCliente, concluidaPelaAnalise, temposDeResposta, respostasPorBloco, msDeExpediente, TOLERANCIA_BLOCO_ABERTO_MS, ehSoConfirmacao, telefoneBonito, telefoneE164, variantesTelefone, ehCelular, linkWhatsapp, type Msg } from '../../lib/painel.ts';

const AGORA = new Date('2026-09-21T18:00:00Z');
const em = (hhmm: string) => `2026-09-21T${hhmm}:00Z`;
const cliente = (hhmm: string): Msg => ({ direcao: 'entrada', automatica: false, enviada_em: em(hhmm) });
const vendedor = (hhmm: string): Msg => ({ direcao: 'saida', automatica: false, enviada_em: em(hhmm) });
const robo = (hhmm: string): Msg => ({ direcao: 'saida', automatica: true, enviada_em: em(hhmm) });

// --- quem está esperando -----------------------------------------------------

test('cliente falou por último: espera desde essa mensagem', () => {
    assert.equal(esperaDoCliente([vendedor('14:00'), cliente('17:00')], AGORA), 60 * 60 * 1000);
});

test('vendedor respondeu por último: ninguém espera', () => {
    assert.equal(esperaDoCliente([cliente('14:00'), vendedor('14:30')], AGORA), null);
});

// O cliente mandou três mensagens seguidas. Ele espera desde a PRIMEIRA — é há
// quanto tempo está sem resposta, não desde quando parou de escrever.
test('mensagens seguidas do cliente: conta desde a primeira', () => {
    assert.equal(
        esperaDoCliente([vendedor('10:00'), cliente('15:00'), cliente('15:02'), cliente('15:05')], AGORA),
        3 * 60 * 60 * 1000,
    );
});

// O caso que mais engana: a resposta automática marca a conversa como
// respondida sem ninguém ter lido nada. Quem manda "recebemos sua mensagem"
// não respondeu ao cliente.
test('resposta automática não tira o cliente da espera', () => {
    assert.equal(esperaDoCliente([cliente('16:00'), robo('16:00')], AGORA), 2 * 60 * 60 * 1000);
});

test('conversa só com mensagens do vendedor: ninguém espera', () => {
    assert.equal(esperaDoCliente([vendedor('09:00'), vendedor('09:05')], AGORA), null);
});

test('conversa vazia: ninguém espera', () => {
    assert.equal(esperaDoCliente([], AGORA), null);
});

// --- a lista "Esperando você" ------------------------------------------------

// O piloto pediu em 06/10 para a lista começar limpa: o que ficou parado no
// histórico importado da conexão não é fila de hoje.
test('a lista começa em 06/10 à meia-noite de Brasília', () => {
    assert.equal(INICIO_DA_LISTA_DE_ESPERA.toISOString(), '2026-10-06T03:00:00.000Z');
});

test('cliente que parou de escrever antes do corte sai da lista', () => {
    const corte = new Date(em('12:00'));
    assert.equal(esperaNaLista([vendedor('09:00'), cliente('11:00')], AGORA, corte), null);
});

test('cliente que escreveu depois do corte fica na lista', () => {
    const corte = new Date(em('12:00'));
    assert.equal(esperaNaLista([vendedor('09:00'), cliente('17:00')], AGORA, corte), 60 * 60 * 1000);
});

// Escreveu ontem, voltou a cobrar hoje e ninguém respondeu: está na fila de
// hoje, e a espera conta desde ontem.
test('cliente que voltou a escrever depois do corte entra com a espera inteira', () => {
    const corte = new Date(em('12:00'));
    assert.equal(esperaNaLista([cliente('10:00'), cliente('13:00')], AGORA, corte), 8 * 60 * 60 * 1000);
});

test('mensagem exatamente no corte entra na lista', () => {
    const corte = new Date(em('12:00'));
    assert.equal(esperaNaLista([cliente('12:00')], AGORA, corte), 6 * 60 * 60 * 1000);
});

test('conversa respondida não entra na lista', () => {
    const corte = new Date(em('12:00'));
    assert.equal(esperaNaLista([cliente('13:00'), vendedor('13:10')], AGORA, corte), null);
});

// --- marcas que tiram da fila (dispensa, venda presencial) -------------------

test('marca depois da última fala do cliente tira da fila', () => {
    assert.equal(marcadaDepoisDoCliente([cliente('14:00')], em('15:00')), true);
});

test('cliente que escreve depois da marca volta para a fila', () => {
    assert.equal(marcadaDepoisDoCliente([cliente('14:00'), cliente('16:00')], em('15:00')), false);
});

test('sem marca nenhuma, nada sai da fila', () => {
    assert.equal(marcadaDepoisDoCliente([cliente('14:00')], null, undefined), false);
});

test('basta uma das marcas ser posterior', () => {
    assert.equal(marcadaDepoisDoCliente([cliente('14:00')], em('13:00'), em('14:30')), true);
});

// O banco devolve "+00:00" e milissegundos; o servidor grava com "Z".
test('compara instantes, não a grafia da data', () => {
    assert.equal(marcadaDepoisDoCliente([cliente('14:00')], '2026-09-21T14:00:00.500+00:00'), true);
    assert.equal(marcadaDepoisDoCliente([cliente('14:00')], '2026-09-21T10:59:00-03:00'), false);
});

// --- tempo e taxa de resposta (por bloco, no expediente) --------------------

// Horário de Brasília explícito: 21/09/2026 é segunda; 26/09, sábado; 27/09, domingo.
const sp = (hhmm: string, dia = '21'): string => `2026-09-${dia}T${hhmm}:00-03:00`;
const cli = (hhmm: string, dia?: string): Msg => ({ direcao: 'entrada', automatica: false, enviada_em: sp(hhmm, dia) });
const ven = (hhmm: string, dia?: string): Msg => ({ direcao: 'saida', automatica: false, enviada_em: sp(hhmm, dia) });
const bot = (hhmm: string, dia?: string): Msg => ({ direcao: 'saida', automatica: true, enviada_em: sp(hhmm, dia) });
const FIM_DO_DIA = new Date(sp('23:59'));
const MIN = 60_000;

test('expediente: seg–sex 8h–18h, sábado 8h–12h, domingo fechado', () => {
    assert.equal(msDeExpediente(new Date(sp('07:00')), new Date(sp('09:00'))), 60 * MIN);
    assert.equal(msDeExpediente(new Date(sp('17:30')), new Date(sp('08:15', '22'))), 45 * MIN, 'a noite não conta');
    assert.equal(msDeExpediente(new Date(sp('11:00', '26')), new Date(sp('09:00', '28'))), 2 * 60 * MIN, 'sábado até 12h, domingo nada');
    assert.equal(msDeExpediente(new Date(sp('19:00')), new Date(sp('22:00'))), 0);
    assert.equal(msDeExpediente(new Date(sp('10:00')), new Date(sp('09:00'))), 0, 'intervalo invertido');
});

test('um bloco do cliente respondido: um tempo', () => {
    assert.deepEqual(temposDeResposta([cli('11:00'), ven('11:10')], FIM_DO_DIA), [10 * MIN]);
});

test('dois blocos: um tempo cada, medidos da primeira mensagem do bloco', () => {
    assert.deepEqual(
        temposDeResposta([cli('09:00'), cli('09:03'), ven('09:10'), cli('11:00'), ven('11:05')], FIM_DO_DIA),
        [10 * MIN, 5 * MIN],
    );
});

// Caso Marco, 07/10: respondeu de manhã, a cliente escreveu às 14:01 e ninguém
// mais respondeu. Antes: 100% e um minuto. O bloco aberto é não respondido e
// entra com a espera até o fim do expediente.
test('bloco aberto no fim do dia: não respondido, com a espera até as 18h', () => {
    const msgs = [cli('08:44'), ven('08:45'), cli('14:01'), cli('14:53')];
    assert.deepEqual(temposDeResposta(msgs, FIM_DO_DIA), [1 * MIN, (3 * 60 + 59) * MIN]);
    assert.deepEqual(respostasPorBloco(msgs, FIM_DO_DIA), [true, false]);
});

test('bloco aberto mede só até o fim informado (o painel passa "agora")', () => {
    const msgs = [cli('14:00')];
    assert.deepEqual(temposDeResposta(msgs, new Date(sp('15:00'))), [60 * MIN]);
    assert.deepEqual(respostasPorBloco(msgs, new Date(sp('15:00'))), [false]);
});

// Quem escreveu às 17:58 não foi ignorado: o dia acabou. Abaixo da tolerância,
// o bloco aberto fica fora da conta, nem a favor nem contra.
test('bloco aberto com menos que a tolerância não conta', () => {
    assert.equal(TOLERANCIA_BLOCO_ABERTO_MS, 15 * MIN);
    assert.deepEqual(respostasPorBloco([cli('17:50')], FIM_DO_DIA), []);
    assert.deepEqual(temposDeResposta([cli('17:50')], FIM_DO_DIA), []);
    assert.deepEqual(respostasPorBloco([cli('17:40')], FIM_DO_DIA), [false]);
});

test('fora do expediente o relógio não corre', () => {
    assert.deepEqual(temposDeResposta([cli('06:30'), ven('08:05')], FIM_DO_DIA), [5 * MIN], 'antes de abrir: conta desde as 8h');
    assert.deepEqual(respostasPorBloco([cli('19:00')], FIM_DO_DIA), [], 'depois de fechar e sem resposta: não pesa');
    assert.deepEqual(respostasPorBloco([cli('10:00', '27')], new Date(sp('23:59', '27'))), [], 'domingo');
});

test('respondido fora do expediente: conta na taxa, sem tempo a medir', () => {
    assert.deepEqual(respostasPorBloco([cli('20:00'), ven('20:05')], FIM_DO_DIA), [true]);
    assert.deepEqual(temposDeResposta([cli('20:00'), ven('20:05')], FIM_DO_DIA), []);
});

test('a automática não conta como resposta, a humana seguinte sim', () => {
    assert.deepEqual(temposDeResposta([cli('09:00'), bot('09:00'), ven('09:20')], FIM_DO_DIA), [20 * MIN]);
    assert.deepEqual(respostasPorBloco([cli('09:00'), bot('09:00')], FIM_DO_DIA), [false]);
});

// Disparo em massa: o vendedor falou, o cliente nunca. Não há tempo de
// resposta nenhum a medir — e incluir isso como 0 rebaixaria a média de todos.
test('conversa sem fala do cliente não produz tempo nem bloco', () => {
    assert.deepEqual(temposDeResposta([ven('09:00'), ven('09:01')], FIM_DO_DIA), []);
    assert.deepEqual(respostasPorBloco([ven('09:00')], FIM_DO_DIA), []);
});

// Em 07/10, dois terços dos blocos "sem resposta" eram o cliente encerrando:
// "Obrigado", "Ok", 👍. Isso não pede resposta e não pode virar horas de espera.
const diz = (hhmm: string, conteudo: string | null, tipo = 'texto'): Msg => ({ ...cli(hhmm), conteudo, tipo });

test('confirmação do cliente não pede resposta', () => {
    for (const t of ['Obrigado', 'obrigadaa', 'Ok, obrigada 🙏🏼', 'Tá bem', 'Ta bemm', 'Combinado 🤝', 'Blz', '👍🏻', 'Ótimo! Muito obg pela atenção', 'certo, obrigada', 'Isso', 'ahh ok entao', '.', 'Show', 'dinada'])
        assert.equal(ehSoConfirmacao(diz('10:00', t)), true, t);
    assert.equal(ehSoConfirmacao(diz('10:00', '[reagiu com 👍]', 'outro')), true);
    assert.equal(ehSoConfirmacao(diz('10:00', '[figurinha]', 'outro')), true);
    for (const t of ['Bom dia', 'Qual o valor?', 'obrigado, vou tentar outro fornecedor.', 'Aguardo orçamento', 'Não', 'Tem na Vonder', 'ok, e o frete?'])
        assert.equal(ehSoConfirmacao(diz('10:00', t)), false, t);
    assert.equal(ehSoConfirmacao(diz('10:00', null, 'imagem')), false, 'foto ou áudio pode ser pedido');
    assert.equal(ehSoConfirmacao(cli('10:00')), false, 'sem conteúdo lido: conta como pedido, como antes');
});

test('o cliente que agradece no fim não deixa bloco aberto', () => {
    const msgs = [cli('10:00'), ven('10:05'), diz('10:06', 'Obrigado!'), diz('10:07', '👍')];
    assert.deepEqual(respostasPorBloco(msgs, FIM_DO_DIA), [true]);
    assert.deepEqual(temposDeResposta(msgs, FIM_DO_DIA), [5 * MIN]);
});

test('confirmação no meio de um pedido não o fecha nem o reabre', () => {
    const msgs = [diz('10:00', 'ok'), diz('10:30', 'Qual o valor?'), diz('10:31', 'obrigado'), ven('10:40')];
    assert.deepEqual(temposDeResposta(msgs, FIM_DO_DIA), [10 * MIN]);
});

// "Agradecemos sua mensagem. Não estamos disponíveis…" da empresa do cliente:
// não é ele falando, e não pode virar espera nem cobrança da vendedora.
test('ausência automática do cliente não é fala dele', () => {
    const ausencia = (hhmm: string): Msg => ({ direcao: 'entrada', automatica: true, enviada_em: sp(hhmm) });
    assert.deepEqual(respostasPorBloco([ven('09:00'), ausencia('09:00')], FIM_DO_DIA), []);
    assert.deepEqual(temposDeResposta([ven('09:00'), ausencia('09:00'), cli('10:00'), ven('10:05')], FIM_DO_DIA), [5 * MIN]);
    assert.equal(esperaDoCliente([ven('09:00'), ausencia('09:00')], AGORA), null);
});

// --- telefone na tela --------------------------------------------------------

test('celular com nono dígito vira (DD) 9 XXXX-XXXX', () => {
    assert.equal(telefoneBonito('5554998124471'), '(54) 9 9812-4471');
});

test('fixo de oito dígitos vira (DD) XXXX-XXXX', () => {
    assert.equal(telefoneBonito('555433334444'), '(54) 3333-4444');
});

// Número de fora do Brasil, ou lixo: melhor devolver como veio do que inventar
// uma formatação brasileira em cima de algo que não é.
test('o que não for brasileiro sai como veio', () => {
    assert.equal(telefoneBonito('12025550147'), '12025550147');
    assert.equal(telefoneBonito('abc'), 'abc');
});

// --- corte do dia ------------------------------------------------------------

// O cliente que escreveu antes do corte e foi respondido depois não pode virar
// um "tempo de resposta de hoje" de horas: a espera começou em outro dia.
test('desde() descarta o que veio antes do corte', () => {
    const msgs = [cliente('07:00'), vendedor('12:00'), cliente('13:00'), vendedor('13:05')];
    const hoje = desde(msgs, new Date(em('08:00')));
    assert.deepEqual(hoje.map((m) => m.enviada_em), [em('12:00'), em('13:00'), em('13:05')]);
    assert.deepEqual(temposDeResposta(hoje, AGORA), [5 * 60_000]);
});

test('desde() inclui a mensagem exatamente no corte', () => {
    assert.equal(desde([cliente('08:00')], new Date(em('08:00'))).length, 1);
});

// --- espera escrita ----------------------------------------------------------

// "22h37" ao lado de "14h45" se lia como horário.
test('espera nunca se parece com horário', () => {
    const min = 60_000;
    assert.equal(esperaEmTexto(30 * 1000), 'agora');
    assert.equal(esperaEmTexto(18 * min), '18min');
    assert.equal(esperaEmTexto(4 * 60 * min), '4h');
    assert.equal(esperaEmTexto((22 * 60 + 37) * min), '22h 37min');
    assert.equal(esperaEmTexto(24 * 60 * min), '1d');
    assert.equal(esperaEmTexto((27 * 60 + 5) * min), '1d 3h');
});

// --- bloqueio ----------------------------------------------------------------

test('telefone digitado sem país ganha o 55', () => {
    assert.equal(telefoneE164('(54) 9 9812-4471'), '5554998124471');
    assert.equal(telefoneE164('54 3333-4444'), '555433334444');
    assert.equal(telefoneE164('+55 54 99812-4471'), '5554998124471');
    // DDD 55 (Santa Maria) parece o país, mas 11 dígitos é DDD + número.
    assert.equal(telefoneE164('55 99812-4471'), '5555998124471');
});

test('celular casa com e sem o nono dígito', () => {
    assert.deepEqual(variantesTelefone('5554998124471'), ['5554998124471', '555498124471']);
    assert.deepEqual(variantesTelefone('555498124471'), ['555498124471', '5554998124471']);
    // Fixo não tem nono dígito.
    assert.deepEqual(variantesTelefone('555433334444'), ['555433334444']);
    assert.deepEqual(variantesTelefone('12025550147'), ['12025550147']);
    // LID é identidade própria: sem dígito a acrescentar ou tirar.
    assert.deepEqual(variantesTelefone('lid:123456789012345'), ['lid:123456789012345']);
});

test('contato @lid não é formatado como telefone', () => {
    assert.equal(telefoneBonito('lid:123456789012345'), 'Contato sem número visível');
});

// --- saudação e gráfico ------------------------------------------------------

test('primeiro nome sai capitalizado quando veio uniforme', () => {
    assert.equal(primeiroNome('jose pedro'), 'Jose');
    assert.equal(primeiroNome('JOSÉ PEDRO'), 'José');
    assert.equal(primeiroNome('  ana  '), 'Ana');
    assert.equal(primeiroNome('McArthur Silva'), 'McArthur');
    assert.equal(primeiroNome(null), '');
});

test('dias corridos até a data, com virada de mês', () => {
    assert.deepEqual(diasAte('2026-10-02', 4), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    assert.equal(diasAte('2026-09-21', 14).length, 14);
});

test('dias de várias unidades somam contagens e ponderam médias', () => {
    const linha = (data_ref: string, score: number | null, leads: number) => ({
        data_ref, score_geral: score, leads_atendidos: leads, conversoes_confirmadas: 1, oportunidades_perdidas: 0,
        tempo_medio_resposta_s: 60, taxa_resposta: 100,
    });
    const [d1, d2] = juntarPorDia([linha('2026-09-22', 80, 30), linha('2026-09-21', 50, 10), linha('2026-09-21', 90, 30)]);
    assert.equal(d1.data_ref, '2026-09-21');
    assert.equal(d1.leads_atendidos, 40);
    assert.equal(d1.conversoes_confirmadas, 2);
    assert.equal(d1.score_geral, (50 * 10 + 90 * 30) / 40);
    assert.equal(d2.score_geral, 80);
    // Unidade sem nota não puxa a média para zero.
    assert.equal(juntarPorDia([linha('2026-09-21', null, 5), linha('2026-09-21', 70, 5)])[0].score_geral, 70);
});

// --- responder ---------------------------------------------------------------

test('responder no computador abre direto o WhatsApp Web', () => {
    assert.equal(linkWhatsapp('5554998124471', false), 'https://web.whatsapp.com/send?phone=5554998124471');
});

test('responder no celular abre o app pelo wa.me', () => {
    assert.equal(linkWhatsapp('5554998124471', true), 'https://wa.me/5554998124471');
});

// Um wa.me com os dígitos de um LID abriria uma pessoa qualquer.
test('contato @lid não ganha link de WhatsApp', () => {
    assert.equal(linkWhatsapp('lid:123456789012345', false), null);
    assert.equal(linkWhatsapp('lid:123456789012345', true), null);
});

test('celular é reconhecido pelo User-Agent; na dúvida, computador', () => {
    assert.equal(ehCelular('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'), true);
    assert.equal(ehCelular('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Mobile Safari/537.36'), true);
    assert.equal(ehCelular('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), false);
    assert.equal(ehCelular('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0'), false);
    assert.equal(ehCelular(null), false);
});

// Com mais de um vendedor a média do tempo saía quebrada (734,5) e a coluna
// integer recusava o relatório da loja: o último gravado era de dias atrás.
test('fechamento: tempo inteiro, nota com 2 casas, médias ponderadas por leads', () => {
    const r = numerosDoFechamento([
        { score_geral: 18.88, leads_atendidos: 11, conversoes_confirmadas: 3, oportunidades_perdidas: 0, tempo_medio_resposta_s: 720, taxa_resposta: 90 },
        { score_geral: 23.33, leads_atendidos: 4, conversoes_confirmadas: 0, oportunidades_perdidas: 1, tempo_medio_resposta_s: 301, taxa_resposta: null },
        { score_geral: null, leads_atendidos: 0, conversoes_confirmadas: 0, oportunidades_perdidas: 0, tempo_medio_resposta_s: null, taxa_resposta: null },
    ]);
    assert.ok(Number.isInteger(r.tempo_medio_resposta_s));
    assert.equal(r.tempo_medio_resposta_s, Math.round((720 * 11 + 301 * 4) / 15));
    assert.equal(r.score_geral, Math.round(((18.88 * 11 + 23.33 * 4) / 15) * 100) / 100);
    assert.equal(r.taxa_resposta, 90);
    assert.equal(r.leads_atendidos, 15);
    assert.equal(r.conversoes_confirmadas, 3);
    assert.equal(r.oportunidades_perdidas, 1);
});

test('fechamento sem nenhum valor deixa a média vazia, não zero', () => {
    const r = numerosDoFechamento([{ score_geral: null, leads_atendidos: 2, tempo_medio_resposta_s: null }]);
    assert.equal(r.score_geral, null);
    assert.equal(r.tempo_medio_resposta_s, null);
});

// O app do WhatsApp para Windows abria pelo link do Web, mas sem ir à conversa.
test('no computador, quem escolheu o app recebe whatsapp://; no celular nada muda', () => {
    assert.equal(linkWhatsapp('5554998124471', false, true), 'whatsapp://send?phone=5554998124471');
    assert.equal(linkWhatsapp('5554998124471', true, true), 'https://wa.me/5554998124471');
    assert.equal(linkWhatsapp('lid:123456789', false, true), null);
});

// --- "obrigado", reação e a análise que deu o atendimento por terminado -----

const falou = (hhmm: string, conteudo: string, tipo = 'texto'): Msg => ({ ...cliente(hhmm), tipo, conteudo });

// Caso LECO (Thamires, 08/10): venda paga, a vendedora agradeceu e o cliente
// reagiu com ❤️. A reação não pede resposta.
test('reação ou "obrigado" depois da resposta não põem o cliente na fila', () => {
    assert.equal(esperaDoCliente([vendedor('10:55'), falou('10:59', '[reagiu com ❤️]', 'outro')], AGORA), null);
    assert.equal(esperaDoCliente([vendedor('10:55'), falou('10:56', 'Obrigado'), falou('10:57', '👍🏻')], AGORA), null);
});

test('pergunta seguida de "obrigado" continua esperando desde a pergunta', () => {
    assert.equal(esperaDoCliente([vendedor('10:00'), falou('15:00', 'Tem cimento?'), falou('15:01', 'Obrigado')], AGORA), 3 * 60 * 60 * 1000);
});

test('sem conteúdo lido, a fala do cliente conta como antes', () => {
    assert.equal(esperaDoCliente([vendedor('10:00'), cliente('17:00')], AGORA), 60 * 60 * 1000);
});

const analise = (data_ref: string, status: string, updated_at: string) => ({ data_ref, status, updated_at });

test('análise "encerrada" feita depois da última fala do cliente tira da fila', () => {
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'encerrada', em('15:00'))]), true);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'venda_feita', em('15:00'))]), true);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'perdida', em('15:00'))]), true);
});

test('análise que não leu a última fala não tira da fila', () => {
    // Das 12h, e o cliente escreveu às 14h.
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'encerrada', em('12:00'))]), false);
    // De ontem, refeita hoje à tarde: o dia dela não tem a fala de hoje.
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-20', 'encerrada', em('15:00'))]), false);
});

test('análise em andamento ou sem resposta não tira da fila; vale a mais recente', () => {
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'em_andamento', em('15:00'))]), false);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-21', 'sem_resposta', em('15:00'))]), false);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], [analise('2026-09-20', 'encerrada', em('15:00')), analise('2026-09-21', 'em_andamento', em('15:00'))]), false);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], []), false);
    assert.equal(concluidaPelaAnalise([cliente('14:00')], null), false);
});
