import test from 'node:test';
import assert from 'node:assert/strict';
import { custoEstimado, dataEmSaoPaulo, hashTranscript, janelaDoDia, montarTranscript, schemaAnalise } from '../../lib/analise.ts';

test('o dia comercial usa São Paulo na virada do UTC', () => {
    assert.equal(dataEmSaoPaulo(new Date('2026-09-22T01:30:00Z')), '2026-09-21');
    const { inicio, fim } = janelaDoDia('2026-09-21');
    assert.equal(inicio.toISOString(), '2026-09-21T03:00:00.000Z');
    assert.equal(fim.toISOString(), '2026-09-22T03:00:00.000Z');
});

test('transcript distingue ator, automática, áudio e mídia não lida', () => {
    const texto = montarTranscript([
        { direcao: 'saida', tipo: 'texto', conteudo: 'Recebemos', transcricao: null, automatica: true, enviada_em: '2026-09-21T10:00:00Z' },
        { direcao: 'entrada', tipo: 'imagem', conteudo: null, transcricao: null, automatica: false, enviada_em: '2026-09-21T10:01:00Z' },
        { direcao: 'entrada', tipo: 'audio', conteudo: null, transcricao: 'Preciso hoje', automatica: false, enviada_em: '2026-09-21T10:02:00Z' },
    ]);
    assert.match(texto, /^V: \[automática\] Recebemos/m);
    assert.match(texto, /C: \[Mídia: imagem\]/);
    assert.match(texto, /Transcrição: "Preciso hoje"/);
});

test('hash do transcript é estável e custo do modelo é reproduzível', () => {
    assert.equal(hashTranscript('abc'), hashTranscript('abc'));
    assert.notEqual(hashTranscript('abc'), hashTranscript('abd'));
    assert.equal(custoEstimado('gpt-4.1-mini-2025-04-14', 1_000_000, 1_000_000), 2);
    assert.equal(custoEstimado('modelo-desconhecido', 1000, 1000), 0);
});

test('schema recusa análise sem as sete etapas do MEC', () => {
    const base = {
        tipo_conversa: 'negociacao', status: 'em_andamento', sentiment: 50,
        score_atendimento: 70, score_oportunidade: 80, score_risco: 20,
        estagio_funil: 'meio', potencial_venda: 'alto', urgencia: 3,
        resumo: 'Resumo', destaque: 'Destaque', proxima_acao: 'Retornar', script_sugerido: 'Mensagem',
        objecoes: [], tecnicas_usadas: [], erros_vendedor: [], tags: [],
        evidencias: [{ trecho: 'preciso hoje', conclusao: 'urgência' }], mec: [],
    };
    assert.equal(schemaAnalise.safeParse(base).success, false);
});
