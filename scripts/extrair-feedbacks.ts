/**
 * Extrai os feedbacks (aba Feedbacks, Silas 22/10) das análises feitas antes
 * do campo existir, sem refazer a análise: nota, MEC e status ficam como estão.
 *
 *   node --env-file=.env.local scripts/extrair-feedbacks.ts               simulação: conta e estima o custo
 *   node --env-file=.env.local scripts/extrair-feedbacks.ts --amostra 20  simulação + chama o Claude em 20 e mostra o que achou
 *   node --env-file=.env.local scripts/extrair-feedbacks.ts --gravar      grava em todas
 *   … --desde 2026-07-01                                                  só a partir desse dia
 *
 * Lê as análises sem a chave `feedbacks`, de vendedor, com cliente (sem a
 * conversa de colega ou fornecedor, bloqueada ou dispensada), e só dos dias
 * já fechados: a de hoje o worker refaz com o campo. Para cada uma, remonta o
 * transcript do dia como o worker (scripts/transcript-do-dia.mjs, sem mídia),
 * pede só os feedbacks ao Claude Haiku 5.5 (pedidoFeedbacksClaude) e grava
 * `payload.feedbacks`. Pula o que já tem o campo: pode rodar de novo.
 *
 * Rode depois do deploy do campo na análise, senão o worker grava análises
 * novas sem ele enquanto o script anda.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { custoEstimado, dataEmSaoPaulo } from '../lib/analise.ts';
import { entradaClaude, MODELO_CLAUDE, textoDaMensagemClaude } from '../lib/claude.ts';
import { naturezaSuspeita } from '../lib/natureza.ts';
import { pedidoFeedbacksClaude } from '../lib/pedido-analise.ts';
import { transcriptDoDia } from './transcript-do-dia.mjs';

const args = process.argv.slice(2);
const gravar = args.includes('--gravar');
const valorDe = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const desde = valorDe('--desde');
const amostra = Number(valorDe('--amostra') ?? 0);
const CONCORRENCIA = 6;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave || ((gravar || amostra) && !process.env.ANTHROPIC_API_KEY)) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (e ANTHROPIC_API_KEY com --gravar ou --amostra) — rode com --env-file=.env.local');
    process.exit(1);
}
const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

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

type Linha = { id: string; conversa_id: string; data_ref: string; user_id: string; natureza_contato: string | null; confianca_natureza: string | null; natureza_descartada: string | null };

const { data: vendedores, error: erroVendedores } = await db.from('profiles').select('id').eq('role', 'vendedor');
if (erroVendedores) falhar('vendedores', erroVendedores);
const ehVendedor = new Set((vendedores ?? []).map((v) => v.id as string));
const hoje = dataEmSaoPaulo(new Date());

const linhas = await todas<Linha>((de, ate) => {
    let q = db.from('analises_conversa')
        .select('id,conversa_id,data_ref,user_id,natureza_contato:payload->>natureza_contato,confianca_natureza:payload->>confianca_natureza,natureza_descartada:payload->>natureza_descartada,conversas!inner(bloqueada,dispensada_em)')
        .is('payload->feedbacks', null).eq('conversas.bloqueada', false).is('conversas.dispensada_em', null)
        .lt('data_ref', hoje).order('id').range(de, ate);
    if (desde) q = q.gte('data_ref', desde);
    return q.returns<Linha[]>();
});
const alvos = linhas.filter((l) => ehVendedor.has(l.user_id) && !naturezaSuspeita(l));
console.log(`${linhas.length} análises sem feedbacks${desde ? ` desde ${desde}` : ''}; ${alvos.length} de vendedor com cliente.`);

async function emLotes<T, R>(itens: readonly T[], fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const saidas: R[] = [];
    for (let i = 0; i < itens.length; i += CONCORRENCIA) {
        saidas.push(...await Promise.all(itens.slice(i, i + CONCORRENCIA).map((item, j) => fn(item, i + j))));
        if (itens.length > 50 && (i / CONCORRENCIA) % 10 === 0) console.log(`  ${Math.min(i + CONCORRENCIA, itens.length)}/${itens.length}`);
    }
    return saidas;
}

const anthropic = gravar || amostra ? new Anthropic() : null;

/** Chama o Claude; recusa, corte ou resposta fora do schema voltam como `pulado`. */
async function extrair(transcript: string) {
    const { corpo, schema } = pedidoFeedbacksClaude({ transcript });
    try {
        const mensagem = await anthropic!.messages.create(corpo);
        const custo = custoEstimado(MODELO_CLAUDE, entradaClaude(mensagem.usage), mensagem.usage.output_tokens);
        try {
            return { feedbacks: schema.parse(JSON.parse(textoDaMensagemClaude(mensagem))).feedbacks, custo };
        } catch (e) {
            return { pulado: `fora do schema: ${String((e as Error).message ?? e).slice(0, 120)}`, custo };
        }
    } catch (e) {
        return { pulado: `Claude ${(e as { status?: number }).status ?? (e as Error).message ?? e}`, custo: 0 };
    }
}

if (!gravar) {
    // Estimativa pelo tamanho do transcript: ~3,5 caracteres por token, mais o
    // prompt (~900) na entrada; ~400 de saída com o raciocínio do effort low.
    let estimado = 0;
    let semMensagens = 0;
    const transcripts = await emLotes(alvos, async (l) => {
        const t: string | null = await transcriptDoDia(db, l.conversa_id, l.data_ref);
        if (!t) semMensagens += 1;
        else estimado += custoEstimado(MODELO_CLAUDE, Math.ceil(t.length / 3.5) + 900, 400);
        return t;
    });
    console.log(`Simulação: ${alvos.length - semMensagens} com transcript (${semMensagens} sem mensagens do cliente). Custo estimado: US$ ${estimado.toFixed(2)}.`);
    if (amostra) {
        let custo = 0;
        const escolhidos = alvos.map((l, i) => ({ l, t: transcripts[i] })).filter((x) => x.t).slice(0, amostra);
        const resultados = await emLotes(escolhidos, async ({ l, t }) => ({ l, r: await extrair(t!) }));
        for (const { l, r } of resultados) {
            custo += r.custo;
            if ('pulado' in r) { console.log(`- ${l.data_ref} ${l.conversa_id}: pulado (${r.pulado})`); continue; }
            console.log(`- ${l.data_ref} ${l.conversa_id}: ${r.feedbacks.length ? r.feedbacks.map((f) => `[${f.polaridade}/${f.assunto}] "${f.trecho}"`).join(' ') : 'nenhum'}`);
        }
        console.log(`Amostra de ${escolhidos.length}: US$ ${custo.toFixed(4)} (nada gravado).`);
    }
    console.log('Nada foi gravado. Para gravar: --gravar');
    process.exit(0);
}

let gravadas = 0;
let custo = 0;
const pulados: string[] = [];
await emLotes(alvos, async (l) => {
    const t: string | null = await transcriptDoDia(db, l.conversa_id, l.data_ref);
    // Sem fala do cliente no dia não há feedback: grava [] para não voltar.
    const r = t ? await extrair(t) : { feedbacks: [], custo: 0 };
    custo += r.custo;
    if ('pulado' in r) { pulados.push(`${l.data_ref} ${l.conversa_id}: ${r.pulado}`); return; }
    const { data: atual, error } = await db.from('analises_conversa').select('payload').eq('id', l.id).maybeSingle<{ payload: Record<string, unknown> }>();
    if (error || !atual) { pulados.push(`${l.data_ref} ${l.conversa_id}: leitura ${error?.message ?? 'sumiu'}`); return; }
    // Só se ninguém gravou o campo nesse meio-tempo: o worker reescreve o
    // payload inteiro, e este update não pode desfazer uma análise nova.
    const { error: erroGravar, count } = await db.from('analises_conversa').update({ payload: { ...atual.payload, feedbacks: r.feedbacks } }, { count: 'exact' })
        .eq('id', l.id).is('payload->feedbacks', null);
    if (erroGravar) { pulados.push(`${l.data_ref} ${l.conversa_id}: gravar ${erroGravar.message}`); return; }
    if (count) gravadas += 1;
});
console.log(`Gravadas ${gravadas} de ${alvos.length}. Custo: US$ ${custo.toFixed(2)}.`);
if (pulados.length) console.log(`Puladas (${pulados.length}), rode de novo para tentar:\n${pulados.map((p) => `- ${p}`).join('\n')}`);
