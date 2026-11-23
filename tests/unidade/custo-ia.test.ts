import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarCusto, usoDaTranscricao, usoPorTokens } from '../../lib/custo-ia.ts';
import { custoEstimado } from '../../lib/analise.ts';

const perto = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('transcrição por tokens separa áudio, pista de vocabulário e saída', () => {
    const uso = usoDaTranscricao('gpt-4o-mini-transcribe', {
        type: 'tokens', input_tokens: 1_100_000, output_tokens: 200_000,
        input_token_details: { audio_tokens: 1_000_000, text_tokens: 100_000 },
    });
    perto(uso.custo, 3 + 0.125 + 1);
    assert.equal(uso.entrada, 1_100_000);
    assert.equal(uso.saida, 200_000);
    assert.equal(uso.segundos, null);
});

test('transcrição sem o detalhe conta toda a entrada como áudio', () => {
    perto(usoDaTranscricao('gpt-4o-mini-transcribe', { input_tokens: 1_000_000, output_tokens: 0 }).custo, 3);
});

test('whisper-1 cobra por minuto', () => {
    const uso = usoDaTranscricao('whisper-1', { type: 'duration', seconds: 90 });
    perto(uso.custo, 0.009);
    assert.equal(uso.segundos, 90);
});

test('transcrição sem usage ou de modelo desconhecido grava a chamada sem custo', () => {
    assert.equal(usoDaTranscricao('gpt-4o-mini-transcribe', undefined).custo, 0);
    assert.equal(usoDaTranscricao('outro', { input_tokens: 10, output_tokens: 10 }).custo, 0);
});

test('mídia no gpt-4.1-nano tem preço', () => {
    perto(custoEstimado('gpt-4.1-nano-2025-04-14', 1_000_000, 1_000_000), 0.5);
    perto(usoPorTokens('gpt-4.1-mini-2025-04-14', 1_000_000, 0).custo, 0.4);
});

function bancoFalso(erro: { message: string } | null = null, lanca = false) {
    const linhas: Record<string, unknown>[] = [];
    const tabelas: string[] = [];
    return {
        linhas, tabelas,
        from(tabela: 'custos_ia') {
            tabelas.push(tabela);
            return { insert: async (linha: Record<string, unknown>) => { if (lanca) throw new Error('rede'); linhas.push(linha); return { error: erro }; } };
        },
    };
}

test('registra uma linha por chamada em custos_ia', async () => {
    const banco = bancoFalso();
    await registrarCusto(banco, 'relatorio', usoPorTokens('gpt-4.1-mini-2025-04-14', 1000, 100), { referencia: 'u1', dataRef: '2026-10-27' });
    assert.deepEqual(banco.tabelas, ['custos_ia']);
    assert.equal(banco.linhas.length, 1);
    assert.equal(banco.linhas[0]!.etapa, 'relatorio');
    assert.equal(banco.linhas[0]!.referencia, 'u1');
    assert.equal(banco.linhas[0]!.data_ref, '2026-10-27');
    perto(banco.linhas[0]!.custo as number, (1000 * 0.4 + 100 * 1.6) / 1_000_000);
});

test('falha ao gravar o custo não derruba o item', async () => {
    const erroOriginal = console.error;
    console.error = () => {};
    try {
        await registrarCusto(bancoFalso({ message: 'relation "custos_ia" does not exist' }), 'midia', usoPorTokens('x', 1, 1));
        await registrarCusto(bancoFalso(null, true), 'midia', usoPorTokens('x', 1, 1));
    } finally {
        console.error = erroOriginal;
    }
});
