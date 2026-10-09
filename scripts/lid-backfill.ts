/**
 * Resolve as conversas `lid:` antigas e as une à conversa do telefone (0031).
 *
 *   node --env-file=.env.local scripts/lid-backfill.ts                    simulação: só lista
 *   node --env-file=.env.local scripts/lid-backfill.ts --saida plano.csv  simulação + lista em CSV
 *   node --env-file=.env.local scripts/lid-backfill.ts --aplicar          grava (exige a 0031)
 *   … --vendedor <uuid>                                                   um vendedor só
 *
 * Para cada vendedor, pergunta à instância dele (POST /chat/check, só
 * leitura) o número de cada LID. Com o número: se o vendedor já tem a conversa
 * do telefone, a `lid:` é unida a ela (`zn_unificar_conversa`); se não tem, a
 * `lid:` passa a ter o telefone. LID sem número fica como está. O CSV tem
 * telefones de clientes: guarde fora do repositório e apague depois.
 *
 * Depois de aplicar, reprocessar na Operação os dias listados no fim: as
 * análises desses dias foram feitas sobre metade da conversa.
 */
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { decifrar } from '../lib/crypto.ts';
import { lotesDeConsulta, planejar, telefonesDoCheck, type Acao, type ConversaLida } from '../lib/lid.ts';
import { variantesTelefone } from '../lib/painel.ts';
import { Uazapi } from '../lib/uazapi/cliente.ts';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const valorDe = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const saida = valorDe('--saida');
const soVendedor = valorDe('--vendedor');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uazUrl = process.env.UAZAPI_API_URL;
if (!url || !chave || !uazUrl) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e UAZAPI_API_URL — rode com --env-file=.env.local');
    process.exit(1);
}
const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
const uaz = new Uazapi(uazUrl, process.env.UAZAPI_ADMIN_TOKEN ?? '');
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function falhar(contexto: string, e: { message: string } | null): never {
    console.error(`${contexto}: ${e?.message}`);
    process.exit(1);
}

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const linhas: T[] = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await consulta(de, de + 999);
        if (error) falhar('leitura', error);
        linhas.push(...(data ?? []));
        if ((data ?? []).length < 1000) return linhas;
    }
}

if (aplicar) {
    const { error } = await db.from('conversas').select('cliente_lid').limit(1);
    if (error) falhar('a migração 0031 não está aplicada (conversas.cliente_lid)', error);
}

type Conexao = { id: string; user_id: string; status: string; instance_token: string };
const conexoes = await todas<Conexao>((de, ate) => db.from('conexoes_whatsapp')
    .select('id, user_id, status, instance_token').not('instance_token', 'is', null).range(de, ate));
// Mais de uma conexão por vendedor: vale a conectada.
const conexaoDe = new Map<string, Conexao>();
for (const c of conexoes) {
    const atual = conexaoDe.get(c.user_id);
    if (!atual || (atual.status !== 'conectada' && c.status === 'conectada')) conexaoDe.set(c.user_id, c);
}
const nomes = new Map((await todas<{ id: string; nome: string }>((de, ate) => db.from('profiles').select('id, nome').range(de, ate)))
    .map((p) => [p.id, p.nome]));

const conversas = await todas<ConversaLida>((de, ate) => {
    const q = db.from('conversas').select('id, user_id, cliente_telefone').order('id').range(de, ate);
    return soVendedor ? q.eq('user_id', soVendedor) : q;
});
const porVendedor = new Map<string, ConversaLida[]>();
for (const c of conversas) porVendedor.set(c.user_id, [...(porVendedor.get(c.user_id) ?? []), c]);

const acoes: Acao[] = [];
const resumo: { vendedor: string; lids: number; unificar: number; renomear: number; sem: number; obs: string }[] = [];

for (const [userId, lista] of porVendedor) {
    const lids = lista.filter((c) => c.cliente_telefone.startsWith('lid:')).map((c) => c.cliente_telefone.slice(4));
    if (!lids.length) continue;
    const telefones = new Map<string, string>();
    let obs = '';
    const conexao = conexaoDe.get(userId);
    if (!conexao) obs = 'sem instância';
    else {
        let token: string | null = null;
        try { token = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex')); } catch { obs = 'token ilegível'; }
        let falhas = 0;
        for (const lote of token ? lotesDeConsulta(lids) : []) {
            try {
                for (const [lid, tel] of telefonesDoCheck(await uaz.verificarNumeros(token!, lote))) telefones.set(lid, tel);
            } catch (e) {
                falhas++;
                if (falhas === 1) obs = `/chat/check falhou: ${String(e).slice(0, 120)}`;
            }
            await pausa(250);
        }
        if (falhas > 1) obs += ` (${falhas} lotes)`;
    }
    const plano = planejar(lista, telefones);
    acoes.push(...plano);
    resumo.push({
        vendedor: nomes.get(userId) ?? userId, lids: lids.length,
        unificar: plano.filter((a) => a.acao === 'unificar').length,
        renomear: plano.filter((a) => a.acao === 'renomear').length,
        sem: plano.filter((a) => a.acao === 'sem_resolucao').length, obs,
    });
}

console.table(resumo.sort((a, b) => b.lids - a.lids));
const total = (k: Acao['acao']) => acoes.filter((a) => a.acao === k).length;
console.log(`${aplicar ? 'APLICANDO' : 'SIMULAÇÃO'}: ${total('unificar')} unificar, ${total('renomear')} ganhar o telefone, ${total('sem_resolucao')} sem resolução`);

// Dias em que a conversa `lid:` unida tinha análise: o relatório desses dias contou a pessoa duas vezes.
const unidas = acoes.filter((a) => a.acao === 'unificar').map((a) => a.origem);
const dias = new Set<string>();
for (let i = 0; i < unidas.length; i += 200) {
    const { data, error } = await db.from('analises_conversa').select('data_ref').in('conversa_id', unidas.slice(i, i + 200));
    if (error) falhar('análises', error);
    for (const d of data ?? []) dias.add(d.data_ref as string);
}

if (saida) {
    const linhas = acoes.map((a) => [nomes.get(a.userId) ?? a.userId, a.acao, a.lid, 'telefone' in a ? a.telefone : '', a.origem, 'destino' in a ? a.destino : '']);
    writeFileSync(saida, ['vendedor,acao,lid,telefone,origem,destino', ...linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n');
    console.log(`lista em ${saida} (tem telefones de clientes: apague depois)`);
}

if (aplicar) {
    let feitas = 0, erros = 0;
    for (const a of acoes) {
        if (a.acao === 'sem_resolucao') continue;
        const { error } = a.acao === 'unificar'
            ? await db.rpc('zn_unificar_conversa', { p_origem: a.origem, p_destino: a.destino })
            : await renomear(a);
        if (error) { erros++; console.error(`${a.acao} ${a.origem} (lid ${a.lid}): ${error.message}`); } else feitas++;
    }
    console.log(`gravado: ${feitas} conversas, ${erros} erros`);
}
console.log(dias.size
    ? `reprocessar na Operação: ${[...dias].sort().join(', ')}`
    : 'nenhum dia analisado nas conversas a unir');

/**
 * A `lid:` ganha o telefone. Se a conversa do telefone apareceu depois do
 * plano (mensagem ao vivo no meio), une a ela em vez de colidir.
 */
async function renomear(a: Extract<Acao, { acao: 'renomear' }>): Promise<{ error: { message: string } | null }> {
    const { error } = await db.from('conversas').update({ cliente_telefone: a.telefone, cliente_lid: a.lid })
        .eq('id', a.origem).eq('cliente_telefone', `lid:${a.lid}`);
    if (error?.code !== '23505') return { error };
    const { data: destino, error: erroDestino } = await db.from('conversas').select('id')
        .eq('user_id', a.userId).in('cliente_telefone', variantesTelefone(a.telefone)).limit(1).maybeSingle<{ id: string }>();
    if (erroDestino || !destino) return { error: erroDestino ?? error };
    return db.rpc('zn_unificar_conversa', { p_origem: a.origem, p_destino: destino.id });
}
