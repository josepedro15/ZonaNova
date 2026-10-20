#!/usr/bin/env node
// =============================================================================
// Calibração da análise por conversa contra um gabarito lido à mão.
//
//   npm run analise:calibracao -- gabarito.json [saida.json] [rodadas=1]
//
// O gabarito (fora do repositório: tem nome e trecho de conversa) é uma lista
// de { conversa_id, data_ref, categoria, esperado, motivo, antes? }, com
// `esperado` podendo ter:
//   natureza: 'cliente' | 'interno'   — interno = sai das contas (lib/natureza.ts)
//   tipo: [...] / status: [...]       — valores aceitos
//   status_nao: [...]                 — valores proibidos
//   objecao_nao / erros_nao: regex    — nada em objecoes / erros_vendedor casa com ela
// `antes` (opcional) é o que estava gravado: o resumo mostra antes × agora.
//
// Roda a análise de produção (mesmo prompt, schema e pós-processamento —
// lib/pedido-analise.ts) no transcript do dia, sem mídia e sem o detalhe do
// MEC, mas com o sinal do contato (lib/natureza.ts: cadastro de interno em
// qualquer loja da rede, cargo no nome); SEM_SINAL=1 roda sem ele. Só LÊ o
// banco. Usa a service role e a OPENAI_API_KEY; ~US$ 0,005 por conversa no
// gpt-4.1-mini.
//
// ANALISE_PROVEDOR=anthropic roda no Claude Haiku 5.5 (lib/claude.ts), com a
// ANTHROPIC_API_KEY e o esforço de ANTHROPIC_EFFORT (low, o padrão, ou
// medium); ~US$ 0,002 por conversa. É o teste lado a lado do estudo de 11/10
// (docs/13-estudo-modelo-gpt41mini-vs-haiku55.md).
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { custoEstimado } from '../lib/analise.ts';
import { analiseNoClaude, entradaClaude, esforcoClaude, MODELO_CLAUDE, textoDaMensagemClaude } from '../lib/claude.ts';
import { cadastrosNaRede, naturezaSuspeita, sinalDoContato } from '../lib/natureza.ts';
import { doutrinaMec, MODELO_PADRAO, pedidoAnalise, pedidoAnaliseClaude } from '../lib/pedido-analise.ts';
import { transcriptDoDia } from './transcript-do-dia.mjs';

const [arquivo, saida = 'analise-calibracao.json', rodadas = '1'] = process.argv.slice(2);
const CONCORRENCIA = 6;
const CATEGORIAS = {
    0: 'controles (estavam certos)',
    1: 'papéis invertidos / quem é o contato',
    2: 'pós-venda tratado como venda',
    3: 'venda não contada',
    4: 'vários pedidos no dia',
    5: 'fala do vendedor como objeção',
    6: 'erros_vendedor de checklist',
    7: 'critério de status',
    8: 'sem sinal de negociação',
};

if (!arquivo) {
    console.error('uso: analise:calibracao -- gabarito.json [saida.json] [rodadas]');
    process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const claude = analiseNoClaude();
const nomeDaChave = claude ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
const apiKey = process.env[nomeDaChave];
if (!url || !chave || !apiKey) {
    console.error(`faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ${nomeDaChave} — rode com --env-file=.env.local`);
    process.exit(1);
}
const db = createClient(url, chave, { auth: { persistSession: false } });
const esforco = esforcoClaude();
const modelo = claude ? MODELO_CLAUDE : process.env.OPENAI_MODEL || MODELO_PADRAO;
const anthropic = claude ? new Anthropic({ apiKey }) : null;

/** As expectativas que falharam, em texto; [] = passou. */
function conferir(r, esperado) {
    const falhas = [];
    const interno = naturezaSuspeita(r) !== null;
    if (esperado.natureza && (esperado.natureza === 'interno') !== interno) falhas.push(`natureza ${r.natureza_contato}/${r.confianca_natureza}`);
    // Contato interno reconhecido sai de todas as contas: o status dele não pesa.
    if (esperado.natureza === 'interno' && interno) return falhas;
    if (esperado.tipo && !esperado.tipo.includes(r.tipo_conversa)) falhas.push(`tipo ${r.tipo_conversa}`);
    if (esperado.status && !esperado.status.includes(r.status)) falhas.push(`status ${r.status}`);
    if (esperado.status_nao?.includes(r.status)) falhas.push(`status ${r.status}`);
    for (const [campo, lista] of [['objecao_nao', r.objecoes], ['erros_nao', r.erros_vendedor]]) {
        if (!esperado[campo]) continue;
        const re = new RegExp(esperado[campo], 'i');
        const achou = (lista ?? []).filter((t) => re.test(t));
        if (achou.length) falhas.push(`${campo === 'objecao_nao' ? 'objeção' : 'erro'} "${achou[0]}"`);
    }
    return falhas;
}

/** O mesmo sinal do worker (cadastro na rede, cargo no nome). SEM_SINAL=1 mede só a IA. */
async function sinalDaConversa(conversaId) {
    if (process.env.SEM_SINAL) return null;
    const { data: c, error } = await db.from('conversas').select('cliente_nome,cliente_telefone').eq('id', conversaId).single();
    if (error) throw error;
    return sinalDoContato({ nome: c.cliente_nome, cadastros: await cadastrosNaRede(db, c.cliente_telefone) });
}

async function analisar(caso, doutrina) {
    const transcript = await transcriptDoDia(db, caso.conversa_id, caso.data_ref);
    if (!transcript) return { pulado: 'sem mensagem do contato no dia' };
    const contato = await sinalDaConversa(caso.conversa_id);
    if (claude) return analisarNoClaude(transcript, doutrina, contato);
    const { corpo, schema } = pedidoAnalise({ transcript, doutrina, itens: null, midia: false, modelo, contato });
    const resposta = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const json = await resposta.json();
    if (!resposta.ok) return { pulado: `OpenAI ${resposta.status}` };
    const texto = json.output_text ?? json.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
    const r = schema.zod.parse(JSON.parse(texto));
    return { r, custo: custoEstimado(modelo, json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0) };
}

/** O mesmo pedido do worker no Claude (lib/openai-analise.ts). Recusa e corte viram item pulado. */
async function analisarNoClaude(transcript, doutrina, contato) {
    const { corpo, schema } = pedidoAnaliseClaude({ transcript, doutrina, itens: null, midia: false, contato, esforco });
    let mensagem;
    try {
        mensagem = await anthropic.messages.create(corpo);
    } catch (e) {
        return { pulado: `Claude ${e?.status ?? e?.message ?? e}` };
    }
    let texto;
    try {
        texto = textoDaMensagemClaude(mensagem);
    } catch (e) {
        return { pulado: e.message };
    }
    const custo = custoEstimado(modelo, entradaClaude(mensagem.usage), mensagem.usage.output_tokens);
    // Fora do contrato (ex.: o MEC sem as 7 etapas) é falha do Claude, não da
    // calibração: conta como pulado, com o custo, em vez de parar tudo.
    try {
        return { r: schema.zod.parse(JSON.parse(texto)), custo };
    } catch (e) {
        return { pulado: `fora do schema: ${(e.message ?? String(e)).slice(0, 120)}`, custo };
    }
}

async function emLotes(itens, fn) {
    const saidas = [];
    for (let i = 0; i < itens.length; i += CONCORRENCIA) {
        saidas.push(...await Promise.all(itens.slice(i, i + CONCORRENCIA).map(fn)));
        process.stderr.write(`\r${saidas.length}/${itens.length}`);
    }
    process.stderr.write('\n');
    return saidas;
}

try {
    const gabarito = JSON.parse(readFileSync(arquivo, 'utf8'));
    const doutrina = await doutrinaMec(db, false);
    const resultados = [];
    let custo = 0;
    for (let rodada = 1; rodada <= Number(rodadas); rodada++) {
        console.error(`rodada ${rodada}: ${gabarito.length} conversas, modelo ${modelo}${claude ? ` (effort ${esforco})` : ''}`);
        const feitas = await emLotes(gabarito, (c) => analisar(c, doutrina.texto));
        feitas.forEach((f, i) => {
            const caso = gabarito[i];
            custo += f.custo ?? 0;
            resultados.push({
                rodada, conversa_id: caso.conversa_id, categoria: caso.categoria, motivo: caso.motivo, esperado: caso.esperado,
                ...(f.pulado ? { pulado: f.pulado } : {
                    falhas: conferir(f.r, caso.esperado),
                    falhas_antes: caso.antes ? conferir(caso.antes, caso.esperado) : null,
                    obtido: {
                        quem_pede: f.r.quem_pede, natureza: `${f.r.natureza_contato}/${f.r.confianca_natureza}`, tipo: f.r.tipo_conversa, status: f.r.status,
                        score: f.r.score_atendimento, evidencia_natureza: f.r.evidencia_natureza, objecoes: f.r.objecoes,
                        erros_vendedor: f.r.erros_vendedor, resumo: f.r.resumo, assuntos: f.r.assuntos_do_dia,
                    },
                }),
            });
        });
    }
    writeFileSync(saida, JSON.stringify(resultados, null, 2));

    const validos = resultados.filter((r) => !r.pulado);
    console.log(`\n${validos.length} análises (${resultados.length - validos.length} puladas) · custo US$ ${custo.toFixed(3)}\n`);
    console.log('categoria'.padEnd(40), 'antes'.padStart(7), 'agora'.padStart(7));
    let totAntes = 0, totAgora = 0, nAntes = 0;
    for (const [cat, nome] of Object.entries(CATEGORIAS)) {
        const daqui = validos.filter((r) => String(r.categoria) === cat);
        if (!daqui.length) continue;
        const agora = daqui.filter((r) => !r.falhas.length).length;
        const comAntes = daqui.filter((r) => r.falhas_antes);
        const antes = comAntes.filter((r) => !r.falhas_antes.length).length;
        totAgora += agora; totAntes += antes; nAntes += comAntes.length;
        console.log(`${cat} ${nome}`.padEnd(40), `${antes}/${comAntes.length}`.padStart(7), `${agora}/${daqui.length}`.padStart(7));
    }
    console.log('total'.padEnd(40), `${totAntes}/${nAntes}`.padStart(7), `${totAgora}/${validos.length}`.padStart(7));
    console.log('\nfalhas:');
    for (const r of validos.filter((v) => v.falhas.length)) console.log(`  [${r.categoria}] r${r.rodada} ${r.conversa_id.slice(0, 8)} ${r.motivo} → ${r.falhas.join('; ')}`);
    console.log(`\ndetalhe em ${saida}`);
} catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
}
