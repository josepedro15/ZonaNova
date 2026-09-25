#!/usr/bin/env node
// =============================================================================
// Calibração do MEC estruturado (spec 2026-09-24 §8). Três comandos:
//
//   npm run mec:calibracao -- unidade-piloto
//       unidades por volume de negociação nos últimos 14 dias (a primeira é a piloto)
//   npm run mec:calibracao -- exportar <unidade_id> [quantas=20] > calibracao.csv
//       planilha com a marcação da IA e colunas vazias para o gestor
//   npm run mec:calibracao -- comparar calibracao.csv
//       concordância IA × gestor por coluna e geral (critério: ≥ 85%)
//
// Usa a service role: roda na máquina de quem opera, nunca numa tela.
// =============================================================================
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { concordancia } from '../lib/mec.ts';
import { paginar } from '../lib/paginar.ts';

const [comando, ...args] = process.argv.slice(2);
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zona-nova.vercel.app';
let db;

function iniciarDb() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) {
        console.error('faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY — rode com --env-file=.env.local');
        process.exit(1);
    }
    return createClient(url, chave, { auth: { persistSession: false } });
}
const SEP = ';';
const hoje = new Date();
const diasAtras = (n) => new Date(hoje.getTime() - n * 86_400_000).toISOString().slice(0, 10);

async function unidadePiloto() {
    db = iniciarDb();
    const data = await paginar((de, ate) =>
        db.from('analises_conversa').select('unidade_id')
            .eq('tipo_conversa', 'negociacao').gte('data_ref', diasAtras(14))
            .order('id').range(de, ate)
    );
    const contagem = new Map();
    for (const a of data) contagem.set(a.unidade_id, (contagem.get(a.unidade_id) ?? 0) + 1);
    const { data: unidades } = await db.from('unidades').select('id,nome');
    const nome = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
    for (const [id, n] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${id}\t${nome.get(id) ?? ''}`);
}

async function exportar(unidadeId, quantas = 20) {
    if (!unidadeId) throw new Error('uso: exportar <unidade_id> [quantas]');
    db = iniciarDb();
    const obs = await paginar((de, ate) =>
        db.from('mec_observacoes')
            .select('conversa_id,data_ref,sinal,item_chave,valor').eq('unidade_id', unidadeId)
            .in('sinal', ['sondagem_item', 'objecao', 'fechamento']).order('data_ref', { ascending: false })
            .order('id').range(de, ate),
        20_000
    );
    const porConversa = new Map();
    for (const o of obs) {
        const k = `${o.conversa_id}|${o.data_ref}`;
        if (!porConversa.has(k)) porConversa.set(k, []);
        porConversa.get(k).push(o);
    }
    const escolhidas = [...porConversa.entries()].slice(0, Number(quantas));
    const informacoes = [...new Set(obs.filter((o) => o.sinal === 'sondagem_item').map((o) => o.item_chave))].sort();
    const cab = ['conversa_id', 'data_ref', 'link', ...informacoes.flatMap((c) => [`ia_${c}`, `gestor_${c}`]), 'ia_objecoes', 'gestor_objecoes', 'ia_fechamento', 'gestor_fechamento'];
    console.log(cab.join(SEP));
    for (const [k, linhas] of escolhidas) {
        const [conversaId, dataRef] = k.split('|');
        const item = (c) => (linhas.find((l) => l.sinal === 'sondagem_item' && l.item_chave === c)?.valor ? 'sim' : 'nao');
        const objecoes = linhas.filter((l) => l.sinal === 'objecao').map((l) => l.item_chave).join('|');
        const f = linhas.find((l) => l.sinal === 'fechamento');
        const fechamento = f?.valor ? (f.item_chave ?? 'outra') : 'nenhum';
        console.log([conversaId, dataRef, `${appUrl}/conversas/${conversaId}`, ...informacoes.flatMap((c) => [item(c), '']), objecoes, '', fechamento, ''].join(SEP));
    }
    console.error(`${escolhidas.length} conversas exportadas. O gestor preenche as colunas gestor_* com sim/nao, códigos separados por | ou nenhum.`);
}

function comparar(arquivo) {
    if (!arquivo) throw new Error('uso: comparar <arquivo.csv>');
    const [cab, ...linhas] = readFileSync(arquivo, 'utf8').trim().split(/\r?\n/).map((l) => l.split(SEP));
    const pares = cab.map((c, i) => [c, i]).filter(([c]) => c.startsWith('ia_'))
        .map(([c, i]) => ({ campo: c.slice(3), ia: i, humano: cab.indexOf(`gestor_${c.slice(3)}`) }));
    const todos = [];
    for (const p of pares) {
        const valores = linhas.map((l) => ({ ia: l[p.ia] ?? '', humano: l[p.humano] ?? '' }));
        todos.push(...valores);
        const c = concordancia(valores);
        console.log(`${String(c ?? '—').padStart(4)}%  ${p.campo}`);
    }
    const geral = concordancia(todos);
    console.log(`\nGeral: ${geral ?? '—'}% — ${geral !== null && geral >= 85 ? 'PASSOU (≥ 85%)' : 'NÃO PASSOU: ajuste o prompt antes de ligar para a rede'}`);
}

try {
    if (comando === 'unidade-piloto') await unidadePiloto();
    else if (comando === 'exportar') await exportar(args[0], args[1]);
    else if (comando === 'comparar') comparar(args[0]);
    else { console.error('comandos: unidade-piloto | exportar <unidade_id> [quantas] | comparar <arquivo.csv>'); process.exit(1); }
} catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
}
