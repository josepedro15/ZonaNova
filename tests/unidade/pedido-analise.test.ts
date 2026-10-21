import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedidoAnalise, pedidoAnaliseClaude, REGRA_ERROS, REGRA_ESCALAS, REGRA_OBJECOES, REGRA_PROXIMA, REGRA_STATUS, REGRA_SUPORTE, REGRA_TIPO } from '../../lib/pedido-analise.ts';
import { naturezaSuspeita, REGRA_NATUREZA } from '../../lib/natureza.ts';

const instrucoes = () => pedidoAnalise({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' }).corpo.instructions;

test('o prompt leva todas as regras', () => {
    const texto = instrucoes();
    for (const regra of [REGRA_ESCALAS, REGRA_NATUREZA, REGRA_STATUS, REGRA_TIPO, REGRA_SUPORTE, REGRA_OBJECOES, REGRA_ERROS, REGRA_PROXIMA]) assert.ok(texto.includes(regra));
    const claude = pedidoAnaliseClaude({ transcript: 'C: "oi"', doutrina: 'MEC', itens: null }).corpo.system[0].text;
    assert.ok(claude.includes(REGRA_PROXIMA));
});

// Silas, 20/10: "envie a chave Pix" depois de o vendedor mandar o e-mail do financeiro.
test('a sugestão é o próximo passo e o e-mail do financeiro é a chave Pix', () => {
    assert.match(REGRA_PROXIMA, /Nunca peça nem conte o que já foi feito/);
    assert.match(REGRA_PROXIMA, /V: "financeiro@zonanova.com.br" = chave Pix enviada/);
});

// Auditoria de 07/10: o vendedor pedindo ao estoque saía cliente, o
// comprovante depois do Pix ficava de fora e frase do vendedor virava objeção.
test('as regras cobrem os erros da auditoria de 07/10', () => {
    assert.match(REGRA_NATUREZA, /Posso vender 20\?/);
    assert.match(REGRA_NATUREZA, /entrega tua de Fulano/);
    assert.match(REGRA_STATUS, /separa no nome/);
    assert.match(REGRA_STATUS, /Aguardo comprovante/);
    assert.match(REGRA_STATUS, /QUALQUER assunto é compra_nova_fechada/);
    assert.match(REGRA_STATUS, /sem_resposta SOMENTE/);
    assert.match(REGRA_OBJECOES, /frase do vendedor/);
    assert.match(REGRA_ERROS, /procure X em TODAS as falas V:/);
    assert.match(instrucoes(), /Áudio transcrito numa linha V: é fala do vendedor/);
});

// Silas, 14/10: atraso de entrega com nova data aceita pelo cliente ficava
// em andamento, e a vendedora fechava "presencialmente" para tirar da fila.
test('pós-venda com solução aceita é encerrada, não venda', () => {
    assert.match(REGRA_STATUS, /nova data e o cliente aceita ou agradece, mesmo que a entrega ainda vá acontecer/);
    assert.match(REGRA_STATUS, /= encerrada, não em_andamento nem venda_feita/);
    assert.match(REGRA_STATUS, /Pós-venda nunca é venda_feita/);
});

// Silas, 15/10: o cliente que combina e diz que passa para pegar, e o que
// reclama do preço e fecha com "tá blz", saíam em aberto (Rafael).
test('vir buscar e aceitar depois de reclamar do preço são venda', () => {
    assert.match(REGRA_STATUS, /diz que vai passar na loja para pegar/);
    assert.match(REGRA_STATUS, /Reclamar do preço depois do pedido não desfaz a compra/);
    assert.match(REGRA_STATUS, /C: "Tá blz" = compra_nova_fechada/);
    assert.match(REGRA_STATUS, /Pedir orçamento para mostrar ao chefe sem dizer que vem buscar ainda é compra_nova_em_aberto/);
    // Calibração de 15/10: "amanhã passo aí… mas se for te aviso" virava venda.
    assert.match(REGRA_STATUS, /dúvida sobre VIR ou COMPRAR abre: "se eu for te aviso"/);
    assert.match(REGRA_STATUS, /Escolher retirar na loja no lugar da entrega também fecha/);
    assert.match(REGRA_STATUS, /Condição dita DEPOIS de prometer vir desfaz a promessa/);
});

// Silas, 16/10: "vou pegar no CD" fecha como "vou buscar na loja", mesmo
// sem o vendedor responder por escrito; buscar no concorrente não.
test('buscar no CD ou no depósito é venda; em loja de fora, perdida', () => {
    assert.match(REGRA_STATUS, /Buscar no CD, no depósito ou em outra filial da rede vale o mesmo que buscar na loja/);
    assert.match(REGRA_STATUS, /C: "vou pegar no CD amanhã cedo" = compra_nova_fechada/);
    assert.match(REGRA_STATUS, /Comprar ou buscar em OUTRA loja que não é da rede/);
});

test('a resposta sai conferida contra a conversa (ajustarResultado)', () => {
    const { schema } = pedidoAnalise({ transcript: 'C: "separa no nome"\nV: "Já está no pacote"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' });
    const resposta = {
        quem_pede: 'contato_pede_a_loja', assuntos_do_dia: [{ assunto: 'pedido', situacao: 'compra_nova_fechada' }],
        natureza_contato: 'cliente', confianca_natureza: 90, evidencia_natureza: '', tipo_conversa: 'negociacao', status: 'em_andamento',
        sentiment: 60, score_atendimento: 70, score_oportunidade: 50, score_risco: 30, estagio_funil: 'f', potencial_venda: 'medio', urgencia: 3,
        resumo: 'r', destaque: 'd', proxima_acao: 'p', script_sugerido: 's', objecoes: [], tecnicas_usadas: [], erros_vendedor: [], tags: [],
        evidencias: [{ trecho: 't', conclusao: 'c' }], perfil_cliente: 'nao_identificado', profissao_cliente: '',
        mec: ['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']
            .map((etapa) => ({ etapa, aplicavel: true, aplicado: 'sim', justificativa: 'j', evidencias: [], itens: [] })),
    };
    assert.equal(schema.zod.parse(resposta).status, 'venda_feita');

    // Com o sinal do contato (cadastro na rede), a natureza é a do cadastro, e
    // a compra fechada da IA não vira venda: contato interno não vende.
    const comSinal = pedidoAnalise({ transcript: 'C: "separa no nome"\nV: "Já está no pacote"', doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini',
        contato: { natureza: 'colega_ou_loja', confianca: 95, evidencia: 'Cadastrado como contato interno em Capão da Canoa: "estoque"' } });
    const r = comSinal.schema.zod.parse(resposta);
    assert.equal(r.natureza_contato, 'colega_ou_loja');
    assert.equal(r.status, 'em_andamento');
    assert.equal(naturezaSuspeita(r), 'colega_ou_loja');

    // Sem sinal de fora, a oferta com preço e estoque do contato vale como sinal.
    const oferta = pedidoAnalise({ transcript: `C: ${JSON.stringify('LM URBANO CINZA\nR$32,56M²\nEstoque 273,60m2')}`, doutrina: 'MEC', itens: null, modelo: 'gpt-4.1-mini' });
    assert.equal(oferta.schema.zod.parse(resposta).natureza_contato, 'fornecedor_ou_parceiro');
});

// O caso do piloto (08/10): cliente perguntando pela entrega ou pelo crediário
// tirava nota baixa do vendedor por falta de fechamento.
test('suporte cobre entrega, crediário e pagamento e não cobra fechamento', () => {
    for (const termo of ['entrega', 'crediário', 'boleto', 'pagamento']) assert.ok(REGRA_SUPORTE.includes(termo), termo);
    assert.match(REGRA_SUPORTE, /Fechamento, sondagem, oferta e preço não se aplicam a suporte/);
});

test('as faixas de 0 a 100 continuam sendo a escala do suporte', () => {
    assert.match(REGRA_SUPORTE, /70–100/);
    assert.match(REGRA_ESCALAS, /suporte tem as suas/);
});

// Claude Haiku 5.5 (16/10): o mesmo prompt e as mesmas conferências, no
// formato que a Messages API aceita.
test('o pedido ao Claude leva as mesmas regras, sem temperatura e com cache', () => {
    const args = { transcript: 'C: "separa no nome"\nV: "Já está no pacote"', doutrina: 'MEC', itens: null };
    const { corpo } = pedidoAnaliseClaude({ ...args, esforco: 'medium' });
    assert.equal(corpo.model, 'claude-haiku-5-5');
    assert.ok(!('temperature' in corpo));
    assert.equal(corpo.system[0].text, pedidoAnalise({ ...args, modelo: 'gpt-4.1-mini' }).corpo.instructions);
    assert.deepEqual(corpo.system[0].cache_control, { type: 'ephemeral' });
    assert.equal(corpo.messages.at(-1)?.role, 'user');
    assert.equal(corpo.output_config.effort, 'medium');
    assert.ok(!JSON.stringify(corpo.output_config.format.schema).includes('"maximum"'));
    // As 7 etapas do MEC são chaves obrigatórias, não uma lista de tamanho livre.
    const mec = (corpo.output_config.format.schema.properties as Record<string, { type: string; required: string[] }>).mec;
    assert.equal(mec.type, 'object');
    assert.deepEqual(mec.required, ['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']);
    assert.equal(pedidoAnaliseClaude(args).corpo.output_config.effort, 'low');
});

test('a resposta do Claude volta aos limites e passa pelas mesmas conferências', () => {
    const { schema } = pedidoAnaliseClaude({ transcript: 'C: "separa no nome"\nV: "Já está no pacote"', doutrina: 'MEC', itens: null });
    const resposta = {
        quem_pede: 'contato_pede_a_loja', assuntos_do_dia: [{ assunto: 'pedido', situacao: 'compra_nova_fechada' }],
        natureza_contato: 'cliente', confianca_natureza: 90, evidencia_natureza: 'separa no nome',
        tipo_conversa: 'negociacao', status: 'venda_feita', sentiment: 70, score_atendimento: 130, score_oportunidade: 100, score_risco: -5,
        estagio_funil: 'fechamento', potencial_venda: 'alto', urgencia: 9, resumo: 'r', destaque: 'd', proxima_acao: 'p', script_sugerido: 's',
        objecoes: [], tecnicas_usadas: [], erros_vendedor: [], tags: [], perfil_cliente: 'nao_identificado', profissao_cliente: '',
        evidencias: [1, 2, 3, 4, 5, 6].map((n) => ({ trecho: `separa no nome ${n}`, conclusao: 'pedido' })),
        mec: ['acolhida', 'sondagem', 'solucao_completa', 'contorno_objecoes', 'estrategia_preco', 'fechamento', 'acompanhamento']
            .map((etapa) => ({ etapa, aplicavel: true, aplicado: 'sim', justificativa: 'j', evidencias: [], itens: [] })),
    };
    // O Claude devolve o MEC por etapa; volta a ser a lista de 7, na ordem.
    const porEtapa = Object.fromEntries(resposta.mec.map(({ etapa, ...resto }) => [etapa, resto]));
    const r = schema.zod.parse({ ...resposta, mec: porEtapa });
    assert.deepEqual(r.mec.map((e) => e.etapa), resposta.mec.map((e) => e.etapa));
    assert.equal(r.score_atendimento, 100);
    assert.equal(r.score_risco, 0);
    assert.equal(r.urgencia, 5);
    assert.equal(r.evidencias.length, 5);
    assert.equal(r.status, 'venda_feita');
    // Sem as 7 etapas do MEC não há o que ajustar: a resposta é recusada.
    assert.throws(() => schema.zod.parse({ ...resposta, mec: resposta.mec.slice(0, 6) }));
});
