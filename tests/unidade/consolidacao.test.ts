import test from 'node:test';
import assert from 'node:assert/strict';
import {
    entradaConsolidacao, finalizarConsolidado, INSTRUCOES_CONSOLIDACAO, limparTexto, MAX_ITENS_LISTA, pedidoConsolidacao,
    schemaConsolidado, schemaJsonConsolidado, semAtividadeDeSaida, type RespostaConsolidacao,
} from '../../lib/consolidacao.ts';

/** Todas as chaves `maxLength` do schema, com o caminho de cada uma. */
function limitesDeTexto(no: unknown, caminho = '$'): string[] {
    if (!no || typeof no !== 'object') return [];
    return Object.entries(no).flatMap(([chave, valor]) =>
        chave === 'maxLength' ? [caminho] : limitesDeTexto(valor, `${caminho}.${chave}`));
}

/** Todo objeto do schema estrito precisa listar todas as chaves em `required`. */
function objetosIncompletos(no: unknown, caminho = '$'): string[] {
    if (!no || typeof no !== 'object') return [];
    const n = no as { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
    const aqui = n.type === 'object' && (n.additionalProperties !== false || Object.keys(n.properties ?? {}).some((k) => !n.required?.includes(k))) ? [caminho] : [];
    return [...aqui, ...Object.entries(no).flatMap(([k, v]) => objetosIncompletos(v, `${caminho}.${k}`))];
}

const vazia: RespostaConsolidacao = { resumo: 'r', melhorias: [], elogio: 'e', desafio: 'd', padroes_sucesso: [], padroes_falha: [], objecoes_frequentes: [], alertas: [] };

// Com `maxLength` no schema estrito, a OpenAI para de escrever no limite e a
// frase chega cortada no meio da palavra ("…o que ger"), sem erro nenhum.
test('o schema da consolidação não corta texto no meio', () => {
    assert.deepEqual(limitesDeTexto(schemaJsonConsolidado), []);
});

test('o schema JSON é aceito no modo estrito (todo objeto fechado e com todas as chaves obrigatórias)', () => {
    assert.deepEqual(objetosIncompletos(schemaJsonConsolidado), []);
});

test('resumo de duas frases acima de 320 caracteres é aceito inteiro', () => {
    const resumo = 'Você demonstra cordialidade e agilidade em responder dúvidas e confirmar pedidos, porém falha em aprofundar a sondagem para entender as necessidades da obra e em oferecer soluções completas com complementares, condições e fechamento. Em vários atendimentos, faltou resposta direta a perguntas do cliente, o que gerou espera.';
    assert.ok(resumo.length > 320);
    const resultado = schemaConsolidado.parse({ ...vazia, resumo, elogio: 'e'.repeat(260), desafio: 'd'.repeat(260) });
    assert.equal(resultado.resumo, resumo);
});

// Três melhorias obrigatórias faziam o modelo completar com conselho de manual.
test('melhorias vão de zero a três', () => {
    const item = { texto: 'x', analise: 1, base: 'b' };
    assert.equal(schemaJsonConsolidado.properties.melhorias.maxItems, 3);
    assert.ok(!('minItems' in schemaJsonConsolidado.properties.melhorias));
    assert.doesNotThrow(() => schemaConsolidado.parse(vazia));
    assert.doesNotThrow(() => schemaConsolidado.parse({ ...vazia, melhorias: [item] }));
    assert.throws(() => schemaConsolidado.parse({ ...vazia, melhorias: [item, item, item, item] }));
});

// Sem teto nas listas, o modelo repetia itens até cortar a resposta.
test('toda lista do relatório tem teto de itens', () => {
    for (const [campo, def] of Object.entries(schemaJsonConsolidado.properties)) {
        if ((def as { type: string }).type === 'array') assert.ok((def as { maxItems?: number }).maxItems && (def as { maxItems: number }).maxItems <= MAX_ITENS_LISTA, campo);
    }
});

test('melhoria, padrão de falha e alerta exigem número da análise e o texto de onde saíram', () => {
    for (const campo of ['melhorias', 'padroes_falha', 'alertas'] as const) {
        assert.deepEqual([...schemaJsonConsolidado.properties[campo].items.required], ['texto', 'analise', 'base'], campo);
    }
    assert.deepEqual([...schemaJsonConsolidado.properties.objecoes_frequentes.items.required], ['texto', 'analises']);
});

// 11 de 12 relatórios de 07/10 traziam a regra de formato como conselho.
test('a instrução não tem frase que vire conselho ao vendedor', () => {
    assert.doesNotMatch(INSTRUCOES_CONSOLIDACAO, /pela metade|termine sempre|nunca deixe/i);
    // Exemplos citados viravam texto do relatório; nenhum entre aspas além dos nomes de campo.
    const citados = [...INSTRUCOES_CONSOLIDACAO.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const c of citados) assert.match(c, /^[a-z_]+$/, c);
});

test('a instrução pede singular, segunda pessoa, alerta como fato e lastro nas análises', () => {
    assert.match(INSTRUCOES_CONSOLIDACAO, /um único vendedor/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /segunda pessoa do singular/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /singular do começo ao fim/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /nunca como ordem nem proibição/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /Problema que nenhuma análise apontou em "erros_vendedor" não vira crítica/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /pelo menos duas análises diferentes/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /O que o vendedor informou não é objeção/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /sem juntar outro assunto que a base não menciona/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /Resumo e desafio seguem a regra da fonte/);
});

test('as análises chegam numeradas de 1 em diante e o pedido usa o schema estrito', () => {
    const entrada = JSON.parse(entradaConsolidacao([{ resumo: 'a' }, { resumo: 'b' }], { score_geral: 50 }));
    assert.deepEqual(entrada.analises.map((a: { analise: number }) => a.analise), [1, 2]);
    assert.equal(entrada.metricas.score_geral, 50);
    const pedido = pedidoConsolidacao([], {}, 'm');
    assert.equal(pedido.instructions, INSTRUCOES_CONSOLIDACAO);
    assert.equal(pedido.text.format.strict, true);
    assert.equal(pedido.text.format.schema, schemaJsonConsolidado);
});

test('dia com buraco de captura: a IA recebe os intervalos sem registro e a regra de não ler silêncio como abandono', () => {
    const captura = { intervalos: [{ de: '2026-10-07T13:56:00.000Z', ate: '2026-10-08T03:00:00.000Z', expediente_ms: 25_440_000 }] };
    const entrada = JSON.parse(entradaConsolidacao([{ resumo: 'a' }], {}, captura));
    assert.deepEqual(entrada.captura, {
        aviso: 'Falha técnica: nestes intervalos nenhuma mensagem do vendedor foi registrada, nas duas direções.',
        sem_registro: [{ de: '07/10 10:56', ate: '07/10 24:00' }],
    });
    const pedido = pedidoConsolidacao([{ resumo: 'a' }], {}, 'm', captura);
    assert.equal(JSON.parse(pedido.input[0].content[0].text).captura.sem_registro.length, 1);
    assert.match(INSTRUCOES_CONSOLIDACAO, /"captura"/);
    assert.match(INSTRUCOES_CONSOLIDACAO, /não é abandono, demora nem falta de retorno/);
    // Sem buraco, a entrada não muda.
    assert.equal('captura' in JSON.parse(entradaConsolidacao([], {})), false);
});

test('limparTexto tira a regra de formato copiada pelo modelo (casos de 07/10)', () => {
    const casos: [string, string][] = [
        ['Nunca deixe um texto pela metade.', ''],
        ['Não deixe um texto pela metade.', ''],
        ['Vendedor mantém cordialidade e responde prontamente, confirmando pedidos quando possível, nunca deixe um texto pela metade.',
            'Vendedor mantém cordialidade e responde prontamente, confirmando pedidos quando possível.'],
        ['Nunca deixe um texto pela metade: conduza a conversa até o fechamento com sondagem.', 'Conduza a conversa até o fechamento com sondagem.'],
        ['Nunca deixe um texto pela metade, responda sempre para manter o cliente engajado.', 'Responda sempre para manter o cliente engajado.'],
        ['Contorne objeções de preço para evitar perdas de venda.  "Nunca deixe um texto pela metade."  ', 'Contorne objeções de preço para evitar perdas de venda.'],
        ['Aumentar a sondagem e conduzir para fechamento, evitando deixar textos pela metade.', 'Aumentar a sondagem e conduzir para fechamento.'],
        ['Termine sempre a frase.', ''],
        ['Ofereça produtos complementares e informe condições de entrega.  ', 'Ofereça produtos complementares e informe condições de entrega.'],
        ['Texto comum, sem nada para tirar.', 'Texto comum, sem nada para tirar.'],
    ];
    for (const [entrada, esperado] of casos) assert.equal(limparTexto(entrada), esperado, entrada);
});

const analises = [
    { erros_vendedor: ['Não sondou mais detalhes da obra ou uso dos produtos', 'Não confirmou prazo de entrega na conversa'], objecoes: ['Indecisão sobre cor da tinta'], evidencias: [{ trecho: 't', conclusao: 'Cliente quer retirar o pedido amanhã.' }] },
    { erros_vendedor: [], objecoes: ['Cor da tinta'], evidencias: [{ trecho: 't', conclusao: 'Cliente pediu preço e ficou sem resposta.' }] },
    { erros_vendedor: ['não respondeu ao cliente'], objecoes: [], evidencias: [] },
];
const ids = ['c1', 'c2', 'c3'];

test('crítica sem lastro na análise citada não entra no relatório', () => {
    const r = finalizarConsolidado({
        ...vazia,
        melhorias: [
            { texto: 'Pergunte sobre a obra antes de passar preço.', analise: 1, base: 'Não sondou mais detalhes da obra ou uso dos produtos' },
            // Conselho de manual: nenhuma análise falou de complementares.
            { texto: 'Ofereça produtos complementares.', analise: 1, base: 'Não ofereceu complementares' },
            // Erro que existe, mas citado na análise errada.
            { texto: 'Responda todo cliente.', analise: 2, base: 'não respondeu ao cliente' },
        ],
        padroes_falha: [
            { texto: 'Prazo de entrega não confirmado.', analise: 1, base: 'não confirmou prazo de entrega na conversa.' },
            { texto: 'Não conduziu para fechamento.', analise: 9, base: 'não respondeu ao cliente' },
        ],
        alertas: [
            { texto: 'Cliente que pediu preço ficou sem resposta.', analise: 2, base: 'Cliente pediu preço e ficou sem resposta.' },
            { texto: 'Condições de entrega e pagamento não informadas.', analise: 2, base: 'Condições de entrega e pagamento' },
        ],
    }, analises, ids);
    assert.deepEqual(r.melhorias, ['Pergunte sobre a obra antes de passar preço.']);
    assert.deepEqual(r.padroes_falha, ['Prazo de entrega não confirmado.']);
    assert.deepEqual(r.alertas, ['Cliente que pediu preço ficou sem resposta.']);
    assert.deepEqual(r.lastro.melhorias, [{ conversa_id: 'c1', base: 'Não sondou mais detalhes da obra ou uso dos produtos' }]);
    assert.equal(r.lastro.alertas[0].conversa_id, 'c2');
    assert.equal(r.lastro.descartados, 4);
});

// Ana Paula, 07/10 (rodada manual): base certa, texto com assunto a mais.
test('texto que pendura conselho de manual que a base não menciona sai', () => {
    const fontes = [{ erros_vendedor: ['não ofereceu complementares', 'não conduziu para fechamento ou oferta de complementares'], evidencias: [] }];
    const r = finalizarConsolidado({
        ...vazia,
        melhorias: [
            { texto: 'Ofereça produtos complementares e informe condições de entrega e pagamento.', analise: 1, base: 'não ofereceu complementares' },
            { texto: 'Conduza para fechamento, perguntando diretamente ou limitando opções.', analise: 1, base: 'não conduziu para fechamento ou oferta de complementares' },
            { texto: 'Ofereça os produtos complementares da obra.', analise: 1, base: 'não ofereceu complementares' },
        ],
    }, fontes);
    assert.deepEqual(r.melhorias, ['Ofereça os produtos complementares da obra.']);
    assert.equal(r.lastro.descartados, 2);
});

// Keli, 07/10 (rodada manual): seis erros, nenhum sobre complementares.
test('frase do resumo ou do desafio com conselho de manual sem erro nenhum que o sustente sai', () => {
    const fontes = [{ erros_vendedor: ['Não sondou detalhes da obra'] }, { erros_vendedor: ['não conduziu para fechamento'] }];
    const r = finalizarConsolidado({
        ...vazia,
        resumo: 'Você respondeu rápido e enviou fotos. No entanto, não sondou a obra e não ofereceu complementares ou condições de venda.',
        desafio: 'Conduza a conversa para o fechamento depois de sondar a obra.',
    }, fontes);
    assert.equal(r.resumo, 'Você respondeu rápido e enviou fotos.');
    // "fechamento" tem lastro na segunda análise: o desafio fica.
    assert.equal(r.desafio, 'Conduza a conversa para o fechamento depois de sondar a obra.');
    const semFechamento = finalizarConsolidado({ ...vazia, desafio: 'Conduza a conversa para o fechamento.' }, [fontes[0]]);
    assert.equal(semFechamento.desafio, '');
});

test('trecho literal de um erro também sustenta a crítica', () => {
    const r = finalizarConsolidado({ ...vazia, melhorias: [{ texto: 'Pergunte sobre a obra.', analise: 1, base: 'sondou mais detalhes da obra' }] }, analises);
    assert.deepEqual(r.melhorias, ['Pergunte sobre a obra.']);
    assert.equal(r.lastro.melhorias[0].conversa_id, null);
});

test('objeção de uma conversa só não é frequente', () => {
    const r = finalizarConsolidado({
        ...vazia,
        objecoes_frequentes: [
            { texto: 'Indecisão sobre a cor da tinta.', analises: [1, 2] },
            { texto: 'Indecisão sobre a cor da tinta, de novo.', analises: [1, 1] },
            // A análise 3 não tem objeção do cliente: não conta como segunda.
            { texto: 'Prazo de entrega.', analises: [1, 3] },
        ],
    }, analises, ids);
    assert.deepEqual(r.objecoes_frequentes, ['Indecisão sobre a cor da tinta.']);
    assert.deepEqual(r.lastro.objecoes_frequentes, [{ conversa_ids: ['c1', 'c2'] }]);
    assert.equal(r.lastro.descartados, 2);
});

test('a regra de formato sai de todo texto do relatório, e item que fica vazio cai', () => {
    const r = finalizarConsolidado({
        ...vazia,
        resumo: 'Você respondeu rápido. Nunca deixe um texto pela metade.',
        elogio: 'Cordialidade constante, nunca deixe um texto pela metade.',
        desafio: 'Nunca deixe um texto pela metade: sonde a obra antes do preço.',
        padroes_sucesso: ['Cumprimento cordial.', 'Nunca deixe um texto pela metade.'],
        alertas: [{ texto: 'Nunca deixe um texto pela metade.', analise: 3, base: 'não respondeu ao cliente' }],
    }, analises, ids);
    assert.equal(r.resumo, 'Você respondeu rápido.');
    assert.equal(r.elogio, 'Cordialidade constante.');
    assert.equal(r.desafio, 'Sonde a obra antes do preço.');
    assert.deepEqual(r.padroes_sucesso, ['Cumprimento cordial.']);
    assert.deepEqual(r.alertas, []);
});

test('item repetido entra uma vez só', () => {
    const item = { texto: 'Pergunte sobre a obra.', analise: 1, base: 'Não sondou mais detalhes da obra ou uso dos produtos' };
    const r = finalizarConsolidado({ ...vazia, melhorias: [item, { ...item, texto: 'pergunte sobre a obra' }] }, analises);
    assert.deepEqual(r.melhorias, ['Pergunte sobre a obra.']);
});

test('dia sem mensagem de saída do vendedor (automática não conta) fica sem atividade', () => {
    assert.equal(semAtividadeDeSaida([]), true);
    assert.equal(semAtividadeDeSaida([{ direcao: 'entrada', automatica: false }, { direcao: 'entrada', automatica: false }]), true);
    assert.equal(semAtividadeDeSaida([{ direcao: 'entrada', automatica: false }, { direcao: 'saida', automatica: true }]), true);
    assert.equal(semAtividadeDeSaida([{ direcao: 'entrada', automatica: false }, { direcao: 'saida', automatica: false }]), false);
});
