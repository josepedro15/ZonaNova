import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ITENS_LISTA, schemaConsolidado, schemaJsonConsolidado } from '../../lib/consolidacao.ts';

/** Todas as chaves `maxLength` do schema, com o caminho de cada uma. */
function limitesDeTexto(no: unknown, caminho = '$'): string[] {
    if (!no || typeof no !== 'object') return [];
    return Object.entries(no).flatMap(([chave, valor]) =>
        chave === 'maxLength' ? [caminho] : limitesDeTexto(valor, `${caminho}.${chave}`));
}

// Com `maxLength` no schema estrito, a OpenAI para de escrever no limite e a
// frase chega cortada no meio da palavra ("…o que ger"), sem erro nenhum.
test('o schema da consolidação não corta texto no meio', () => {
    assert.deepEqual(limitesDeTexto(schemaJsonConsolidado), []);
});

test('resumo de duas frases acima de 320 caracteres é aceito inteiro', () => {
    const resumo = 'O vendedor demonstra cordialidade e agilidade em responder dúvidas e confirmar pedidos, porém falha em aprofundar a sondagem para entender as necessidades da obra e em oferecer soluções completas com complementares, condições e fechamento. Em vários atendimentos, faltou resposta direta a perguntas do cliente, o que gerou espera.';
    assert.ok(resumo.length > 320);
    const melhoria = 'Antes de passar o preço, pergunte o tamanho da obra, a etapa em que ela está e quem vai executar, para montar a solução completa com os complementares que o cliente ainda não pediu.';
    assert.ok(melhoria.length > 180);
    const resultado = schemaConsolidado.parse({
        resumo, melhorias: [melhoria, 'b', 'c'], elogio: 'e'.repeat(260), desafio: 'd'.repeat(260),
        padroes_sucesso: [], padroes_falha: [], objecoes_frequentes: [], alertas: [],
    });
    assert.equal(resultado.resumo, resumo);
    assert.equal(resultado.melhorias[0], melhoria);
});

test('a consolidação continua exigindo exatamente três melhorias', () => {
    const base = { resumo: 'r', elogio: 'e', desafio: 'd', padroes_sucesso: [], padroes_falha: [], objecoes_frequentes: [], alertas: [] };
    assert.throws(() => schemaConsolidado.parse({ ...base, melhorias: ['a', 'b'] }));
});

// Sem teto nas listas, o modelo repetia itens até cortar a resposta.
test('toda lista do relatório tem teto de itens', () => {
    for (const [campo, def] of Object.entries(schemaJsonConsolidado.properties)) {
        if ((def as { type: string }).type === 'array') assert.ok((def as { maxItems?: number }).maxItems && (def as { maxItems: number }).maxItems <= MAX_ITENS_LISTA, campo);
    }
});
