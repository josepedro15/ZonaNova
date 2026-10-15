/**
 * Diagnóstico e recuperação de um buraco de captura já passado (0030).
 *
 *   node --env-file=.env.local scripts/captura-diagnostico.ts --vendedor <uuid> --desde <iso> [--ate <iso>]
 *       simulação: erros de entrega do webhook e o que a UAZAPI tem depois de --desde
 *   … --recuperar   reinjeta pela webhook_entrada o que falta (o worker ingere, idempotente)
 *   … --registrar   grava o buraco [--desde, --ate] em buracos_captura (exige --ate), para
 *                   o relatório do dia sair com captura_incompleta ao ser reprocessado
 *   … --chat <jid>  só leitura: lista o que a UAZAPI tem NAQUELE chat entre --desde e
 *                   --ate, com o tipo bruto, se está no banco e o que a ingestão faria.
 *                   Para mensagem que sumiu sem buraco (o PDF do Rafael ao Xexéu,
 *                   08/10): a varredura geral para na primeira página com âncora e
 *                   não chega a dias atrás.
 *
 * Caso de origem: Vitor, de 07/10/2026 10:56 até 08/10 07:35
 *   --desde 2026-10-07T10:56:00-03:00 --ate 2026-10-08T07:35:00-03:00
 *
 * A /webhook/errors da UAZAPI guarda só os últimos 20 erros, em memória: se a
 * instância reiniciou depois do buraco, a lista vem vazia e não prova nada.
 * O que o checar-conexoes faz sozinho a cada 2 horas é o mesmo
 * (lib/uazapi/vigia-captura.ts); isto é para o que aconteceu antes dele.
 */
import { createClient } from '@supabase/supabase-js';
import { decifrar } from '../lib/crypto.ts';
import { recuperarMensagens, resumoErrosWebhook } from '../lib/captura.ts';
import { comNomesConhecidos, contatosConhecidos, estaFora } from '../lib/exclusao.ts';
import { Uazapi } from '../lib/uazapi/cliente.ts';
import { normalizarMensagem, type MensagemUazapi } from '../lib/uazapi/normalizar.ts';

const args = process.argv.slice(2);
const valorDe = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
const vendedor = valorDe('--vendedor');
const desde = valorDe('--desde');
const ate = valorDe('--ate');
const reinjetar = args.includes('--recuperar');
const registrar = args.includes('--registrar');
const chat = valorDe('--chat');
const paraMs = (m: MensagemUazapi) => { const t = m.messageTimestamp ?? m.timestamp ?? 0; return t < 1e12 ? t * 1000 : t; };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uazUrl = process.env.UAZAPI_API_URL;
if (!url || !chave || !uazUrl) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e UAZAPI_API_URL — rode com --env-file=.env.local');
    process.exit(1);
}
if (!vendedor || !desde || Number.isNaN(Date.parse(desde)) || (ate && Number.isNaN(Date.parse(ate)))) {
    console.error('uso: --vendedor <uuid> --desde <iso> [--ate <iso>] [--recuperar] [--registrar] [--chat <jid>]');
    process.exit(1);
}
if (registrar && !ate) {
    console.error('--registrar precisa de --ate (o buraco gravado por aqui já nasce fechado)');
    process.exit(1);
}

const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
const uaz = new Uazapi(uazUrl, process.env.UAZAPI_ADMIN_TOKEN ?? '');
const inicio = new Date(desde);

const { data: conexao, error } = await db.from('conexoes_whatsapp')
    .select('id, user_id, unidade_id, numero, instance_token').eq('user_id', vendedor)
    .maybeSingle<{ id: string; user_id: string; unidade_id: string; numero: string | null; instance_token: string | null }>();
if (error || !conexao?.instance_token) {
    console.error(`conexão do vendedor ${vendedor}: ${error?.message ?? 'sem token'}`);
    process.exit(1);
}
const token = decifrar(Buffer.from(conexao.instance_token.replace(/^\\x/, ''), 'hex'));

if (chat) {
    // Do mais recente para trás, página por página, até passar de --desde.
    const fim = ate ? Date.parse(ate) : Infinity;
    const doChat: MensagemUazapi[] = [];
    for (let offset = 0, paginas = 0; paginas < 20; paginas++) {
        const r = await uaz.buscarMensagens(token, { limit: 100, offset, chatid: chat });
        const msgs = r.messages ?? [];
        doChat.push(...msgs);
        const maisVelha = Math.min(...msgs.map((m) => paraMs(m)));
        if (!msgs.length || !r.pagination?.hasMore || maisVelha < inicio.getTime()) break;
        offset = r.pagination.nextOffset ?? offset + msgs.length;
    }
    const janela = doChat.filter((m) => paraMs(m) >= inicio.getTime() && paraMs(m) < fim).sort((a, b) => paraMs(a) - paraMs(b));
    const { data: gravadas, error: erroGravadas } = await db.from('mensagens').select('wa_message_id,tipo')
        .in('wa_message_id', janela.map((m) => (m.id ?? m.messageid) as string).filter(Boolean));
    if (erroGravadas) { console.error(erroGravadas.message); process.exit(1); }
    const tipoGravado = new Map((gravadas ?? []).map((g) => [g.wa_message_id as string, g.tipo as string]));
    console.log(`== chat ${chat}: ${doChat.length} mensagens lidas na UAZAPI, ${janela.length} no intervalo`);
    for (const m of janela) {
        const id = (m.id ?? m.messageid) as string;
        const n = normalizarMensagem({ message: m });
        const ingestao = 'descartar' in n ? `descarta: ${n.motivo}` : n.tipo;
        const hora = new Date(paraMs(m)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        console.log(`${hora}  ${m.fromMe ? 'saída  ' : 'entrada'}  ${String(m.messageType ?? m.type ?? '-').padEnd(26)}  banco: ${tipoGravado.get(id) ?? 'FALTA'}  ingestão: ${ingestao}${m.fileName ? `  ${m.fileName}` : ''}`);
    }
    process.exit(0);
}

console.log('== erros de entrega do webhook desde', inicio.toISOString());
try {
    const erros = resumoErrosWebhook(await uaz.errosDoWebhook(token), inicio);
    if (!erros.length) console.log('nenhum (ou a UAZAPI reiniciou e perdeu a lista)');
    for (const e of erros) console.log(`${e.created}  ${e.event ?? '-'}  HTTP ${e.status_code ?? '-'}  tentativas ${e.attempts ?? '-'}  ${e.stage ?? ''}  ${e.error ?? ''}`);
} catch (e) {
    console.log('não deu para ler:', String(e));
}

const idsGravados = async (ids: string[]) => {
    const achados = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
        const { data, error: erro } = await db.from('mensagens').select('wa_message_id').in('wa_message_id', ids.slice(i, i + 100));
        if (erro) throw new Error(erro.message);
        for (const m of data ?? []) achados.add(m.wa_message_id as string);
    }
    return achados;
};

// A mesma exclusão da ingestão: o que ela descartaria não "falta" no banco.
const [pessoais, internos, colegas] = await Promise.all([
    db.from('contatos_bloqueados').select('telefone').eq('user_id', conexao.user_id),
    db.from('contatos_internos').select('telefone').eq('unidade_id', conexao.unidade_id),
    db.from('conexoes_whatsapp').select('numero').neq('id', conexao.id).not('numero', 'is', null),
]);
for (const l of [pessoais, internos, colegas]) if (l.error) { console.error(l.error.message); process.exit(1); }
const listas = {
    pessoais: (pessoais.data ?? []).map((x) => x.telefone as string),
    internos: (internos.data ?? []).map((x) => x.telefone as string),
    colegas: (colegas.data ?? []).map((x) => x.numero as string),
};
const conhecidos = await contatosConhecidos(db, conexao.user_id, [...listas.pessoais, ...listas.internos, ...listas.colegas]);
const comLids = comNomesConhecidos(listas, conhecidos);

let faltam: MensagemUazapi[] = [];
const r = await recuperarMensagens({
    buscar: (offset, limite) => uaz.buscarMensagens(token, { limit: limite, offset }),
    idsGravados,
    ingerir: async (mensagens) => { faltam = mensagens; },
    desde: inicio,
    dono: conexao.numero,
    fora: (telefone) => estaFora(telefone, comLids),
    maxPaginas: 10,
});
const noIntervalo = (m: MensagemUazapi) => {
    const t = m.messageTimestamp ?? m.timestamp ?? 0;
    const ms = t < 1e12 ? t * 1000 : t;
    return !ate || ms < Date.parse(ate);
};
console.log('\n== /message/find depois de', inicio.toISOString());
console.log(`encontradas ${r.encontradas}, faltando no banco ${r.recuperadas}, de contatos fora da análise ${r.excluidas}${r.motivo ? ` (${r.motivo})` : ''}`);
if (ate) console.log(`faltando dentro do intervalo até ${new Date(ate).toISOString()}: ${faltam.filter(noIntervalo).length}`);
if (r.motivo === 'uazapi_sem_mensagens') console.log('A UAZAPI também não tem nada: a sessão parou de receber, não foi o webhook.');
else if (r.motivo === 'so_contatos_fora') console.log('A UAZAPI só recebeu de contatos fora da análise: a captura está em dia, não há buraco.');
else if (r.recuperadas > 0) console.log('A UAZAPI tem o que o banco não tem: o webhook não entregou.');

if (reinjetar && faltam.length) {
    const recebidoEm = new Date(Date.now() - 10 * 60_000).toISOString();
    const linhas = [];
    for (let i = 0; i < faltam.length; i += 50) {
        linhas.push({ conexao_id: conexao.id, recebido_em: recebidoEm, payload: { EventType: 'recuperacao', messages: faltam.slice(i, i + 50) } });
    }
    const { error: erro } = await db.from('webhook_entrada').insert(linhas);
    if (erro) { console.error('webhook_entrada:', erro.message); process.exit(1); }
    console.log(`\n${faltam.length} mensagens em ${linhas.length} entradas na webhook_entrada; o worker ingere na próxima rodada.`);
}

if (registrar) {
    const { error: erro } = await db.from('buracos_captura').insert({
        conexao_id: conexao.id, user_id: conexao.user_id, unidade_id: conexao.unidade_id,
        inicio: inicio.toISOString(), fim: new Date(ate!).toISOString(),
        tentativas: 1, encontradas: r.encontradas, recuperadas: reinjetar ? r.recuperadas : 0, motivo: r.motivo,
    });
    if (erro) { console.error('buracos_captura:', erro.message); process.exit(1); }
    console.log('\nburaco registrado. Reprocesse o dia na Operação para o relatório sair com captura_incompleta.');
}

if (!reinjetar && !registrar) console.log('\nsimulação: nada gravado (use --recuperar e/ou --registrar).');
