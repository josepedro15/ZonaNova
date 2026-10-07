import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    decidirEnvio, etiquetaDoVendedor, faltandoParaEnviar, leadQuente, lerConfigCrm, nomeDoContato,
    notaDoCard, refExterna, telefoneDoCrm, tituloDoCard, type AnaliseCrm, type Candidato, type ConfigCrm,
} from '../../lib/crm.ts';

const quente = (extra: Partial<AnaliseCrm> = {}): AnaliseCrm => ({
    tipo_conversa: 'negociacao', status: 'em_andamento', potencial_venda: 'alto', score_oportunidade: 80, ...extra,
});

const config = (extra: Partial<ConfigCrm> = {}): ConfigCrm => ({
    unidades: '*', modo: 'simulacao', baseUrl: 'https://crm', apiKey: '', pipelineId: '', stageId: '', linha: '', ...extra,
});

const candidato = (extra: Partial<Candidato> = {}): Candidato => ({
    unidadeId: 'u1', bloqueada: false, telefone: '5554998124471', analise: quente(), ...extra,
});

test('negociação em andamento, potencial alto e nota 70 é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: 70 })), true);
});

test('nota 69 não é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: 69 })), false);
});

test('potencial médio, outro status ou outro tipo não é quente', () => {
    assert.equal(leadQuente(quente({ potencial_venda: 'medio' })), false);
    for (const status of ['venda_feita', 'lead_frio', 'sem_resposta', 'perdida', 'encerrada']) {
        assert.equal(leadQuente(quente({ status })), false, status);
    }
    assert.equal(leadQuente(quente({ tipo_conversa: 'suporte' })), false);
});

test('nota ausente não é quente', () => {
    assert.equal(leadQuente(quente({ score_oportunidade: null })), false);
});

test('celular sem o nono dígito vai ao CRM com ele', () => {
    assert.equal(telefoneDoCrm('555498124471'), '5554998124471');
    assert.equal(telefoneDoCrm('5554998124471'), '5554998124471');
});

test('fixo fica como está', () => {
    assert.equal(telefoneDoCrm('555433221100'), '555433221100');
});

test('lid, estrangeiro e lixo não têm telefone de CRM', () => {
    assert.equal(telefoneDoCrm('lid:123456789012345'), null);
    assert.equal(telefoneDoCrm('14155550123'), null);
    assert.equal(telefoneDoCrm('5554'), null);
});

test('external_ref é do ZonaNova e do telefone', () => {
    assert.equal(refExterna('5554998124471'), 'zonanova:5554998124471');
});

test('título leva a profissão quando a IA identificou', () => {
    assert.equal(tituloDoCard('Maria Souza', 'pedreira', '5554998124471'), 'Maria Souza · pedreira');
    assert.equal(tituloDoCard('Maria Souza', '  ', '5554998124471'), 'Maria Souza');
});

test('sem nome, contato e título usam o telefone', () => {
    assert.equal(nomeDoContato(null, '5554998124471'), 'Cliente 5554998124471');
    assert.equal(nomeDoContato('  ', '5554998124471'), 'Cliente 5554998124471');
    assert.equal(tituloDoCard(null, '', '5554998124471'), 'Cliente 5554998124471');
});

test('textos respeitam os limites da API', () => {
    assert.equal(nomeDoContato('x'.repeat(300), '1').length, 120);
    assert.equal(tituloDoCard('x'.repeat(300), 'y', '1').length, 200);
    assert.equal(etiquetaDoVendedor(' ' + 'v'.repeat(80) + ' ').length, 50);
});

test('nota traz vendedor, nota, resumo e próxima ação', () => {
    const nota = notaDoCard({ vendedor: 'Rafael', dataRef: '2026-10-03', score: 82, resumo: 'Quer 40m² de porcelanato.', proximaAcao: 'Mandar orçamento hoje.' });
    assert.match(nota, /03\/10\/2026/);
    assert.match(nota, /Vendedor: Rafael/);
    assert.match(nota, /82\/100/);
    assert.match(nota, /Resumo: Quer 40m² de porcelanato\./);
    assert.match(nota, /Próxima ação: Mandar orçamento hoje\./);
});

test('nota sem resumo nem próxima ação não deixa linha vazia', () => {
    const nota = notaDoCard({ vendedor: 'Rafael', dataRef: '2026-10-03', score: 82, resumo: '', proximaAcao: '' });
    assert.doesNotMatch(nota, /Resumo|Próxima ação|\n\n/);
});

test('só a palavra exata liga o envio real', () => {
    assert.equal(lerConfigCrm({ CRPRO_MODO: 'envio' }).modo, 'envio');
    assert.equal(lerConfigCrm({ CRPRO_MODO: 'Envio' }).modo, 'simulacao');
    assert.equal(lerConfigCrm({}).modo, 'simulacao');
});

test('base da API tem padrão de produção', () => {
    assert.equal(lerConfigCrm({}).baseUrl, 'https://app.crpro.com.br/api/v1');
    assert.equal(lerConfigCrm({ CRPRO_BASE_URL: 'https://dev/api/v1' }).baseUrl, 'https://dev/api/v1');
});

test('envio real lista o que falta configurar', () => {
    assert.deepEqual(faltandoParaEnviar(config()), ['CRPRO_API_KEY', 'CRPRO_PIPELINE_ID', 'CRPRO_STAGE_ID', 'CRPRO_CONNECTED_PHONE']);
    assert.deepEqual(faltandoParaEnviar(config({ apiKey: 'k', pipelineId: 'p', stageId: 's', linha: '5554' })), []);
});

test('lead quente de unidade ligada é simulado por padrão', () => {
    assert.deepEqual(decidirEnvio(candidato({ telefone: '555498124471' }), config()), { acao: 'simular', telefone: '5554998124471' });
});

test('com modo envio, o lead quente é enviado', () => {
    assert.equal(decidirEnvio(candidato(), config({ modo: 'envio' })).acao, 'enviar');
});

test('unidade fora da lista não envia', () => {
    assert.equal(decidirEnvio(candidato(), config({ unidades: '' })).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato(), config({ unidades: 'u2,u3' })).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato(), config({ unidades: 'u2, u1' })).acao, 'simular');
});

test('conversa fora da análise, sem análise ou fria não envia', () => {
    assert.equal(decidirEnvio(candidato({ bloqueada: true }), config()).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato({ analise: null }), config()).acao, 'ignorar');
    assert.equal(decidirEnvio(candidato({ analise: quente({ potencial_venda: 'baixo' }) }), config()).acao, 'ignorar');
});

test('contato sem telefone não envia', () => {
    assert.equal(decidirEnvio(candidato({ telefone: 'lid:123456789012345' }), config()).acao, 'ignorar');
});

test('conversa que a análise viu como contato interno não vai ao CRM', () => {
    assert.deepEqual(decidirEnvio(candidato({ suspeitaInterno: true }), config()), { acao: 'ignorar', motivo: 'suspeita de contato interno' });
});
