import { criarClienteAdmin } from '@/lib/supabase/admin';
import { cronAutorizado } from '@/lib/cron';
import { decifrar } from '@/lib/crypto';
import { Uazapi, ehNossa } from '@/lib/uazapi/cliente';
import { mudancasDaChecagem } from '@/lib/conexao';
import { vigiarCaptura, type BuracoAberto, type ConexaoVigiada } from '@/lib/uazapi/vigia-captura';

export const maxDuration = 300;

// Uma a uma, cada ping levando ~1s, as últimas conexões não cabiam nos 60s e
// nunca eram conferidas. Oito de cada vez: poucas o bastante para não
// sobrecarregar a UAZAPI, que é compartilhada.
const EM_PARALELO = 8;

/**
 * Corrige o status das conexões batendo o estado real na UAZAPI (doc 4 §4.4).
 *
 * Existe porque webhook de desconexão se perde — a instância cai, o evento não
 * chega, e o vendedor passa o dia achando que está sendo analisado enquanto o
 * número está fora. Ping não se perde. Roda de 2 em 2 horas.
 *
 * Só escreve quando o status MUDOU: assim o `ultimo_evento_em` continua
 * significando "quando algo aconteceu", e não "quando o cron passou".
 *
 * `connected` não prova que as mensagens chegam: em 07/10 o Vitor passou um
 * dia conectado sem nada gravado. Por isso cada conexão no ar também tem a
 * captura vigiada (lib/uazapi/vigia-captura.ts): silêncio de expediente
 * enquanto a unidade conversa abre um buraco, alerta o gestor e dispara a
 * recuperação pela UAZAPI.
 */
export async function GET(req: Request) {
    if (!cronAutorizado(req)) {
        return Response.json({ erro: 'não autorizado' }, { status: 401 });
    }

    const url = process.env.UAZAPI_API_URL;
    const admin = process.env.UAZAPI_ADMIN_TOKEN;
    if (!url || !admin) {
        return Response.json({ erro: 'UAZAPI não configurada' }, { status: 500 });
    }

    const uaz = new Uazapi(url, admin);
    const supabase = criarClienteAdmin();

    type Linha = ConexaoVigiada & { status: string; instance_token: string };
    const [{ data: conexoes, error }, { data: abertos, error: erroAbertos }] = await Promise.all([
        supabase.from('conexoes_whatsapp')
            .select('id, user_id, unidade_id, status, instance_token, numero, ultima_mensagem_em')
            .not('instance_token', 'is', null)
            .returns<Linha[]>(),
        supabase.from('buracos_captura').select('id, conexao_id, inicio, tentativas, encontradas, recuperadas')
            .is('fim', null).returns<(BuracoAberto & { conexao_id: string })[]>(),
    ]);

    if (error) return Response.json({ erro: error.message }, { status: 500 });
    if (erroAbertos) return Response.json({ erro: erroAbertos.message }, { status: 500 });

    const agora = new Date();
    const buracoAberto = new Map((abertos ?? []).map((b) => [b.conexao_id, b]));
    // A comparação é com a unidade inteira, conectada ou não: mensagem gravada
    // de um colega é prova de que a loja estava conversando.
    const outrasDaUnidade = (c: Linha) => (conexoes ?? [])
        .filter((o) => o.unidade_id === c.unidade_id && o.id !== c.id)
        .map((o) => (o.ultima_mensagem_em ? new Date(o.ultima_mensagem_em) : null));

    let conferidas = 0, corrigidas = 0, numerados = 0, ilegiveis = 0, alheias = 0;
    const captura = { abertos: 0, recuperando: 0, fechados: 0 };

    const conferir = async (c: Linha) => {
        let token: string;
        try {
            token = decifrar(Buffer.from(c.instance_token.replace(/^\\x/, ''), 'hex'));
        } catch {
            ilegiveis++;
            return;
        }

        try {
            const i = await uaz.status(token);
            conferidas++;

            // O servidor é compartilhado: se a instância deixou de ser nossa,
            // não se mexe nela nem se conclui nada sobre ela.
            if (!ehNossa(i)) { alheias++; return; }

            const mudancas = mudancasDaChecagem({ status: c.status, numero: c.numero }, i);
            if (mudancas) {
                const agora = new Date().toISOString();
                await supabase.from('conexoes_whatsapp').update({
                    ...mudancas,
                    // Só mudança de STATUS é "algo aconteceu". Gravar o número
                    // que a UAZAPI acabou de revelar não é evento: mexer no
                    // relógio por causa disso faria o painel do gestor mostrar
                    // atividade onde não houve nenhuma.
                    ...(mudancas.status ? { ultimo_evento_em: agora } : {}),
                    updated_at: agora,
                }).eq('id', c.id);
                if (mudancas.status) corrigidas++;
                if (mudancas.numero) numerados++;
            }

            if (i.status === 'connected') {
                const desfecho = await vigiarCaptura(supabase, uaz, token, c, outrasDaUnidade(c), buracoAberto.get(c.id), agora);
                if (desfecho === 'aberto') captura.abertos++;
                if (desfecho === 'recuperando') captura.recuperando++;
                if (desfecho === 'fechado') captura.fechados++;
            }
        } catch (e) {
            console.error(`checar-conexoes: ${c.id}`, e);
        }
    };

    const fila = [...(conexoes ?? [])];
    await Promise.all(Array.from({ length: EM_PARALELO }, async () => {
        for (let c = fila.shift(); c; c = fila.shift()) await conferir(c);
    }));

    return Response.json({
        total: conexoes?.length ?? 0, conferidas, corrigidas, numerados, ilegiveis, alheias, captura,
    });
}
