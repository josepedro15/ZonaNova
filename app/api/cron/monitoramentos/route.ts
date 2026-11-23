import Anthropic from '@anthropic-ai/sdk';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { dataEmSaoPaulo } from '@/lib/analise';
import { entradaClaude, MODELO_CLAUDE, textoDaMensagemClaude } from '@/lib/claude';
import { registrarCusto, usoPorTokens } from '@/lib/custo-ia';
import {
    casaPalavras, instrucoesConferencia, janelaDaConferencia, lerConferencia, pedidoConferencia, schemaJsonConferencia, textoDaMensagem,
    type MensagemCandidata, type Monitoramento,
} from '@/lib/monitoramento';

export const maxDuration = 300;

// O pg_net espera 60s pela resposta: o que não couber fica para a próxima
// rodada, 15 minutos depois, a partir de onde parou (`conferido_ate`).
const ORCAMENTO_MS = 40_000;
// Mensagens lidas por monitoramento numa rodada. Na rede toda, um dia de
// mensagens de saída cabe com folga.
const MAX_MENSAGENS = 8_000;
// Mensagens por pedido à IA.
const LOTE_IA = 25;

type Admin = ReturnType<typeof criarClienteAdmin>;
type Linha = MensagemCandidata & { conversas: { user_id: string; unidade_id: string; bloqueada: boolean } };

/**
 * Confere os monitoramentos abertos (lib/monitoramento.ts): lê as mensagens
 * que os vendedores mandaram desde a última rodada, separa as que têm as
 * palavras e pergunta à IA se cada uma conta. Agendado pelo pg_cron (0036).
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) return Response.json({ erro: 'não autorizado' }, { status: 401 });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ erro: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 });

    const supabase = criarClienteAdmin();
    const comeco = Date.now();
    const { data: abertos, error } = await supabase.from('monitoramentos').select('*')
        .is('encerrado_em', null).lte('inicio', dataEmSaoPaulo(new Date()))
        .order('created_at').returns<Monitoramento[]>();
    if (error) return Response.json({ erro: error.message }, { status: 500 });

    const cliente = new Anthropic({ apiKey });
    const resultado: Record<string, unknown>[] = [];
    for (const m of abertos ?? []) {
        if (Date.now() - comeco > ORCAMENTO_MS) break;
        try {
            resultado.push({ id: m.id, ...(await conferir(supabase, cliente, m, comeco)) });
        } catch (e) {
            // Um monitoramento com problema não segura os outros.
            console.error(`monitoramento ${m.id}`, e);
            resultado.push({ id: m.id, erro: e instanceof Error ? e.message : String(e) });
        }
    }
    return Response.json({ monitoramentos: resultado });
}

async function conferir(supabase: Admin, cliente: Anthropic, m: Monitoramento, comeco: number) {
    const janela = janelaDaConferencia(m, new Date());
    if (!janela) return { nada: true };

    // Mensagens do vendedor (não as automáticas), na ordem, do ponto onde parou.
    const linhas: Linha[] = [];
    for (let de = 0; de < MAX_MENSAGENS; de += 1000) {
        let consulta = supabase.from('mensagens')
            .select('id,conversa_id,enviada_em,tipo,conteudo,transcricao,midia_nome,midia_descricao,conversas!inner(user_id,unidade_id,bloqueada)')
            .eq('direcao', 'saida').eq('automatica', false)
            .gte('enviada_em', janela.de.toISOString()).lt('enviada_em', janela.ate.toISOString())
            .eq('conversas.bloqueada', false);
        if (m.unidade_id) consulta = consulta.eq('conversas.unidade_id', m.unidade_id);
        const { data, error } = await consulta.order('enviada_em').order('id').range(de, de + 999).returns<Linha[]>();
        if (error) throw error;
        linhas.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
    }
    // Leu o teto: para na última mensagem lida, e a próxima rodada continua dali.
    // Áudio ainda sem transcrição também segura o ponteiro, para ser lido de novo.
    const cheio = linhas.length >= MAX_MENSAGENS;
    const audioPendente = linhas.find((l) => l.tipo === 'audio' && !l.transcricao && Date.now() - Date.parse(l.enviada_em) < 2 * 3_600_000);
    let ate = cheio ? new Date(linhas[linhas.length - 1].enviada_em) : janela.ate;
    if (audioPendente && new Date(audioPendente.enviada_em) < ate) ate = new Date(audioPendente.enviada_em);
    const lidas = linhas.filter((l) => new Date(l.enviada_em) < ate);

    const candidatas = lidas.map((l) => ({ ...l, texto: textoDaMensagem(l) }))
        .filter((l) => l.texto && casaPalavras(l.texto, m.palavras));
    // Já julgadas numa rodada anterior (rodada que caiu no meio) não voltam à IA.
    const ja = new Set<string>();
    for (let i = 0; i < candidatas.length; i += 200) {
        const { data, error } = await supabase.from('monitoramento_marcas').select('mensagem_id')
            .eq('monitoramento_id', m.id).in('mensagem_id', candidatas.slice(i, i + 200).map((c) => c.id));
        if (error) throw error;
        for (const r of data ?? []) if (r.mensagem_id) ja.add(r.mensagem_id as string);
    }
    const novas = candidatas.filter((c) => !ja.has(c.id));

    let julgadas = 0;
    let contam = 0;
    let parouEm = null as Date | null;
    for (let i = 0; i < novas.length; i += LOTE_IA) {
        if (Date.now() - comeco > ORCAMENTO_MS + 15_000) { parouEm = new Date(novas[i].enviada_em); break; }
        const lote = novas.slice(i, i + LOTE_IA);
        const resposta = await cliente.messages.create({
            model: MODELO_CLAUDE,
            max_tokens: 4000,
            system: [{ type: 'text', text: instrucoesConferencia(m), cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: pedidoConferencia(lote) }],
            output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaJsonConferencia as unknown as Record<string, unknown> } },
        });
        await registrarCusto(supabase, 'monitoramento', usoPorTokens(MODELO_CLAUDE, entradaClaude(resposta.usage), resposta.usage.output_tokens), { referencia: m.id });
        const veredito = lerConferencia(textoDaMensagemClaude(resposta), lote.length);
        const marcas = lote.flatMap((c, n) => veredito.has(n) ? [{
            monitoramento_id: m.id, mensagem_id: c.id, conversa_id: c.conversa_id,
            user_id: c.conversas.user_id, unidade_id: c.conversas.unidade_id,
            enviada_em: c.enviada_em, conta: veredito.get(n)!, trecho: c.texto.slice(0, 300),
        }] : []);
        if (marcas.length < lote.length) {
            // A IA pulou alguma: o ponteiro não passa dela.
            const pulada = lote.find((_, n) => !veredito.has(n))!;
            parouEm = parouEm && parouEm < new Date(pulada.enviada_em) ? parouEm : new Date(pulada.enviada_em);
        }
        if (marcas.length) {
            const { error } = await supabase.from('monitoramento_marcas').upsert(marcas, { onConflict: 'monitoramento_id,mensagem_id', ignoreDuplicates: true });
            if (error) throw error;
        }
        julgadas += marcas.length;
        contam += marcas.filter((x) => x.conta).length;
    }

    const ponteiro = parouEm && parouEm < ate ? parouEm : ate;
    const { error: erroPonteiro } = await supabase.from('monitoramentos').update({ conferido_ate: ponteiro.toISOString() }).eq('id', m.id);
    if (erroPonteiro) throw erroPonteiro;
    return { lidas: lidas.length, candidatas: candidatas.length, julgadas, contam, conferido_ate: ponteiro.toISOString() };
}
