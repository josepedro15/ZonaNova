#!/usr/bin/env node
// =============================================================================
// Calibração da natureza do contato (lib/natureza.ts) antes de ligar.
//
//   npm run natureza:calibracao -- [dias=7] [total=100] [saida.json] [amostra.json]
//
// Roda a análise de produção (mesmo prompt e schema, lib/pedido-analise.ts)
// em conversas reais dos últimos `dias` e compara com a lista manual
// `contatos_internos`: as conversas com um número da lista são os positivos
// (um dia por conversa); o resto da amostra sai de dias analisados de outras
// conversas, sorteados. Só LÊ o banco; grava o resultado por conversa em
// `saida.json` (fora do repositório: tem nome e trecho de conversa) e imprime
// o resumo por limiar. Com `amostra.json` (a saída de uma rodada anterior),
// reclassifica exatamente as mesmas conversas — para comparar dois prompts.
//
// Usa a service role e a OPENAI_API_KEY: roda na máquina de quem opera.
// Custo: ~US$ 0,005 por conversa no gpt-4.1-mini.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { custoEstimado, dataEmSaoPaulo, janelaDoDia, marcaRetomada, montarTranscript } from '../lib/analise.ts';
import { doutrinaMec, MODELO_PADRAO, pedidoAnalise } from '../lib/pedido-analise.ts';
import { variantesTelefone } from '../lib/painel.ts';
import { paginar } from '../lib/paginar.ts';

const [dias = '7', total = '100', saida = 'natureza-calibracao.json', amostra] = process.argv.slice(2);
const LIMIARES = [50, 60, 70, 80, 90];
const CONCORRENCIA = 5;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.OPENAI_API_KEY;
if (!url || !chave || !apiKey) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OPENAI_API_KEY — rode com --env-file=.env.local');
    process.exit(1);
}
const db = createClient(url, chave, { auth: { persistSession: false } });
const modelo = process.env.OPENAI_MODEL || MODELO_PADRAO;
const hoje = new Date();
const desde = dataEmSaoPaulo(new Date(hoje.getTime() - Number(dias) * 86_400_000));
const inicioJanela = janelaDoDia(desde).inicio.toISOString();

function embaralhar(lista) {
    const l = [...lista];
    for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
}

/** Conversas com número da lista manual, e o dia mais recente da janela em que o contato escreveu. */
async function positivos() {
    const { data: internos, error } = await db.from('contatos_internos').select('unidade_id,telefone,descricao');
    if (error) throw error;
    const casos = [];
    for (const i of internos ?? []) {
        const { data: conversas, error: e2 } = await db.from('conversas').select('id,unidade_id,cliente_nome,cliente_telefone')
            .eq('unidade_id', i.unidade_id).in('cliente_telefone', variantesTelefone(i.telefone));
        if (e2) throw e2;
        for (const c of conversas ?? []) {
            const { data: ultima } = await db.from('mensagens').select('enviada_em').eq('conversa_id', c.id).eq('direcao', 'entrada')
                .gte('enviada_em', inicioJanela).order('enviada_em', { ascending: false }).limit(1).maybeSingle();
            if (ultima) casos.push({ ...c, data_ref: dataEmSaoPaulo(new Date(ultima.enviada_em)), esperado: 'interno', descricao_lista: i.descricao });
        }
    }
    return casos;
}

/** Dias analisados de conversas fora da lista, sorteados. */
async function negativos(quantos, excluir) {
    const analises = await paginar((de, ate) => db.from('analises_conversa')
        .select('conversa_id,data_ref,tipo_conversa,conversas!inner(unidade_id,cliente_nome,cliente_telefone,bloqueada)')
        .gte('data_ref', desde).eq('conversas.bloqueada', false).order('id').range(de, ate));
    const vistos = new Set();
    const casos = [];
    for (const a of embaralhar(analises)) {
        if (excluir.has(a.conversa_id) || vistos.has(a.conversa_id)) continue;
        vistos.add(a.conversa_id);
        casos.push({ id: a.conversa_id, unidade_id: a.conversas.unidade_id, cliente_nome: a.conversas.cliente_nome, cliente_telefone: a.conversas.cliente_telefone, data_ref: a.data_ref, esperado: 'cliente', tipo_antes: a.tipo_conversa });
        if (casos.length >= quantos) break;
    }
    return casos;
}

/** O transcript que o worker montaria para o dia (app/api/cron/processar-fila, analisarItem), sem mídia. */
async function transcriptDoDia(conversaId, dataRef) {
    const { inicio, fim } = janelaDoDia(dataRef);
    const { data: mensagens, error } = await db.from('mensagens').select('direcao,tipo,conteudo,transcricao,automatica,enviada_em')
        .eq('conversa_id', conversaId).gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString()).order('enviada_em');
    if (error) throw error;
    if (!mensagens?.length || !mensagens.some((m) => m.direcao === 'entrada')) return null;
    const primeiraEntrada = mensagens.findIndex((m) => m.direcao === 'entrada');
    const recorte = primeiraEntrada > 0 && mensagens.slice(0, primeiraEntrada).every((m) => m.automatica) ? mensagens.slice(primeiraEntrada) : mensagens;
    const { data: anterior } = await db.from('mensagens').select('enviada_em').eq('conversa_id', conversaId)
        .lt('enviada_em', inicio.toISOString()).order('enviada_em', { ascending: false }).limit(1).maybeSingle();
    return [marcaRetomada(anterior?.enviada_em ?? null, inicio), montarTranscript(recorte)].filter(Boolean).join('\n');
}

async function classificar(caso, doutrina) {
    const transcript = await transcriptDoDia(caso.id, caso.data_ref);
    if (!transcript) return { ...caso, pulado: 'sem mensagem do contato no dia' };
    const { corpo, schema } = pedidoAnalise({ transcript, doutrina, itens: null, midia: false, modelo });
    const resposta = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const json = await resposta.json();
    if (!resposta.ok) return { ...caso, pulado: `OpenAI ${resposta.status}` };
    const texto = json.output_text ?? json.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
    const r = schema.zod.parse(JSON.parse(texto));
    return {
        ...caso, tipo_conversa: r.tipo_conversa, natureza: r.natureza_contato, confianca: r.confianca_natureza, evidencia: r.evidencia_natureza,
        objecoes: r.objecoes, falas: transcript.split('\n').length,
        custo: custoEstimado(modelo, json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0),
    };
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

const pct = (a, b) => (b ? `${Math.round(a / b * 100)}%` : '—');

try {
    const anterior = amostra ? JSON.parse(readFileSync(amostra, 'utf8')) : null;
    const campos = ['id', 'unidade_id', 'cliente_nome', 'cliente_telefone', 'data_ref', 'esperado', 'descricao_lista', 'tipo_antes'];
    const daAmostra = (esperado) => anterior.filter((r) => r.esperado === esperado).map((r) => Object.fromEntries(campos.map((c) => [c, r[c]])));
    const [{ data: unidades }, doutrina, pos] = await Promise.all([
        db.from('unidades').select('id,nome'), doutrinaMec(db, false), anterior ? daAmostra('interno') : positivos(),
    ]);
    const nomeDa = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
    const neg = anterior ? daAmostra('cliente') : await negativos(Math.max(0, Number(total) - pos.length), new Set(pos.map((p) => p.id)));
    console.error(`janela desde ${desde}: ${pos.length} conversas da lista, ${neg.length} sorteadas; modelo ${modelo}`);
    const resultados = (await emLotes([...pos, ...neg], (c) => classificar(c, doutrina.texto)))
        .map((r) => ({ ...r, unidade: nomeDa.get(r.unidade_id) ?? r.unidade_id }));
    writeFileSync(saida, JSON.stringify(resultados, null, 2));

    const validos = resultados.filter((r) => !r.pulado);
    const P = validos.filter((r) => r.esperado === 'interno');
    const N = validos.filter((r) => r.esperado === 'cliente');
    console.log(`\n${validos.length} classificadas (${resultados.length - validos.length} puladas) · custo US$ ${validos.reduce((s, r) => s + r.custo, 0).toFixed(3)}`);
    console.log(`positivos (lista) ${P.length} · negativos (sorteio) ${N.length}\n`);
    console.log('limiar  achou_da_lista  sugeriu_fora_da_lista  precisão*');
    for (const l of LIMIARES) {
        const sus = (r) => r.natureza !== 'cliente' && r.confianca >= l;
        const vp = P.filter(sus).length, fp = N.filter(sus).length;
        console.log(`${String(l).padStart(5)}   ${`${vp}/${P.length} (${pct(vp, P.length)})`.padEnd(16)}${`${fp}/${N.length} (${pct(fp, N.length)})`.padEnd(23)}${pct(vp, vp + fp)}`);
    }
    console.log('* precisão contra a lista; sugestão "fora da lista" pode ser contato interno que ninguém cadastrou — confira em saida.json.\n');
    const porUnidade = new Map();
    for (const r of P) {
        const u = porUnidade.get(r.unidade) ?? { n: 0, achou: 0 };
        u.n++;
        if (r.natureza !== 'cliente' && r.confianca >= 80) u.achou++;
        porUnidade.set(r.unidade, u);
    }
    for (const [u, v] of porUnidade) console.log(`lista de ${u}: ${v.achou}/${v.n} achados com ≥ 80`);
    const natureza = new Map();
    for (const r of validos) natureza.set(`${r.esperado} → ${r.natureza}`, (natureza.get(`${r.esperado} → ${r.natureza}`) ?? 0) + 1);
    console.log('\nesperado → natureza dada (qualquer confiança)');
    for (const [k, v] of [...natureza].sort()) console.log(`  ${k}: ${v}`);
    console.log(`\ndetalhe por conversa em ${saida}`);
} catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
}
