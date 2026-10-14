'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { dataEmSaoPaulo, diaFechado } from '@/lib/analise';
import { diaMenos } from '@/lib/derivacoes';
import {
    comResolvida, comVendaPresencial, diaDaVendaPresencial, marcaDeDesfecho, semResolvida, semVendaPresencial, type AnalisePresencial,
} from '@/lib/presencial';

/**
 * As marcas que a pessoa põe numa conversa: "Não é atendimento" (0027), que a
 * dispensa até o cliente escrever de novo; "Fechado presencialmente" (0027),
 * que conta a venda feita na loja; e "Resolvido" (0032), que encerra o
 * pós-venda sem contar venda.
 */

const UUID = /^[0-9a-f-]{36}$/i;
type Admin = ReturnType<typeof criarClienteAdmin>;
type Alvo = { id: string; user_id: string; unidade_id: string; fechada_presencial_ref: string | null; resolvida_ref: string | null };
type Analise = AnalisePresencial & { id: string; user_id: string; data_ref: string };

/** Quem marca: o vendedor dono, o gestor da unidade da conversa, supervisor e admin — ativos. */
async function quemMarca(conversaId: string): Promise<{ admin: Admin; userId: string; conversa: Alvo } | null> {
    if (!UUID.test(conversaId)) return null;
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = criarClienteAdmin();
    const [{ data: perfil }, { data: conversa }] = await Promise.all([
        admin.from('profiles').select('role,status').eq('id', user.id).maybeSingle<{ role: string; status: string }>(),
        admin.from('conversas').select('id,user_id,unidade_id,fechada_presencial_ref,resolvida_ref')
            .eq('id', conversaId).eq('bloqueada', false).maybeSingle<Alvo>(),
    ]);
    if (perfil?.status !== 'ativo' || !conversa) return null;
    if (conversa.user_id === user.id || perfil.role === 'supervisor' || perfil.role === 'admin') return { admin, userId: user.id, conversa };
    if (perfil.role !== 'gestor') return null;
    const { count } = await admin.from('gestor_unidades').select('unidade_id', { count: 'exact', head: true })
        .eq('gestor_id', user.id).eq('unidade_id', conversa.unidade_id);
    return count ? { admin, userId: user.id, conversa } : null;
}

/**
 * Refaz o relatório dos dias já fechados. O dia de hoje não: o relatório dele
 * só sai no fechamento das 00h30, que já vai ler a marca.
 */
async function refazerRelatorios(admin: Admin, dias: { user_id: string; data_ref: string }[]) {
    const agora = new Date();
    const unicos = new Map(dias.filter((d) => diaFechado(d.data_ref, agora)).map((d) => [`${d.user_id}|${d.data_ref}`, d]));
    for (const d of unicos.values()) {
        const { error } = await admin.rpc('zn_reabrir_item', { p_tipo: 'relatorio_vendedor', p_referencia: d.user_id, p_data: d.data_ref });
        if (error) throw error;
    }
}

function revalidar(conversaId: string) {
    for (const caminho of ['/dashboard', '/conversas', `/conversas/${conversaId}`, '/equipe']) revalidatePath(caminho);
}

/**
 * Para onde a pessoa volta. Da lista "Esperando você" a conversa some da tela;
 * o painel mostra o aviso com "Desfazer", senão parecia que nada aconteceu.
 */
function destino(form: FormData, conversaId: string, aviso?: 'dispensada' | 'presencial' | 'resolvida'): Route {
    if (form.get('voltar') === 'dashboard') return (aviso ? `/dashboard?aviso=${aviso}&conversa=${conversaId}` : '/dashboard') as Route;
    return `/conversas/${conversaId}` as Route;
}

/** "Não é atendimento": sai da fila, da análise e do relatório até o cliente escrever de novo. */
export async function dispensarConversa(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const { error } = await ctx.admin.from('conversas')
        .update({ dispensada_em: new Date().toISOString(), dispensada_por: ctx.userId }).eq('id', conversaId);
    if (error) throw error;
    // Os relatórios da última semana em que ela entrou saem sem ela. Mais para
    // trás é histórico: refazer pagaria o treino de novo sem ninguém olhar.
    const { data: analises, error: erroAnalises } = await ctx.admin.from('analises_conversa').select('user_id,data_ref')
        .eq('conversa_id', conversaId).gte('data_ref', diaMenos(dataEmSaoPaulo(new Date()), 7))
        .returns<{ user_id: string; data_ref: string }[]>();
    if (erroAnalises) throw erroAnalises;
    await refazerRelatorios(ctx.admin, analises ?? []);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'dispensou_conversa', alvo_id: conversaId, detalhes: {} });
    revalidar(conversaId);
    redirect(destino(form, conversaId, 'dispensada'));
}

export async function desfazerDispensa(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const { error } = await ctx.admin.from('conversas').update({ dispensada_em: null, dispensada_por: null }).eq('id', conversaId);
    if (error) throw error;
    const { data: analises, error: erroAnalises } = await ctx.admin.from('analises_conversa').select('user_id,data_ref')
        .eq('conversa_id', conversaId).gte('data_ref', diaMenos(dataEmSaoPaulo(new Date()), 7))
        .returns<{ user_id: string; data_ref: string }[]>();
    if (erroAnalises) throw erroAnalises;
    await refazerRelatorios(ctx.admin, analises ?? []);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'desfez_dispensa', alvo_id: conversaId, detalhes: {} });
    revalidar(conversaId);
    redirect(destino(form, conversaId));
}

/**
 * O dia em que a marca conta e a análise que já existe para ele.
 * `diaDaVendaPresencial`: o da última conversa no WhatsApp.
 */
async function diaDaMarca(admin: Admin, conversaId: string): Promise<{ ref: string; ultima: Analise | null }> {
    const [{ data: ultima, error: erroUltima }, { data: fala, error: erroFala }] = await Promise.all([
        admin.from('analises_conversa').select('id,user_id,data_ref,tipo_conversa,status,payload').eq('conversa_id', conversaId)
            .order('data_ref', { ascending: false }).limit(1).maybeSingle<Analise>(),
        admin.from('mensagens').select('enviada_em').eq('conversa_id', conversaId).eq('direcao', 'entrada')
            .order('enviada_em', { ascending: false }).limit(1).maybeSingle<{ enviada_em: string }>(),
    ]);
    if (erroUltima) throw erroUltima;
    if (erroFala) throw erroFala;
    const ref = diaDaVendaPresencial(ultima?.data_ref ?? null, fala ? dataEmSaoPaulo(new Date(fala.enviada_em)) : null, dataEmSaoPaulo(new Date()));
    return { ref, ultima: ultima ?? null };
}

/**
 * Grava a marca na análise do dia. Se esse dia ainda não tem análise — o
 * cliente escreveu hoje cedo, antes da rodada do meio-dia —, ela é pedida, e
 * o worker já a grava com a marca.
 */
async function marcarAnalise(admin: Admin, conversaId: string, ref: string, ultima: Analise | null, marcar: (a: Analise) => AnalisePresencial) {
    if (ultima?.data_ref === ref) {
        const { error } = await admin.from('analises_conversa').update(marcar(ultima)).eq('id', ultima.id);
        if (error) throw error;
        await refazerRelatorios(admin, [ultima]);
        return;
    }
    // Dia fechado, o worker encadeia o relatório depois da análise; hoje,
    // o fechamento das 00h30 cuida dele.
    const { error } = await admin.rpc('zn_reabrir_item', { p_tipo: 'analise_conversa', p_referencia: conversaId, p_data: ref });
    if (error) throw error;
}

/** Devolve a análise do dia marcado como a IA a deixou. */
async function desmarcarAnalise(admin: Admin, conversaId: string, ref: string | null, desmarcar: (a: Analise) => AnalisePresencial) {
    if (!ref) return;
    const { data: analise, error } = await admin.from('analises_conversa')
        .select('id,user_id,data_ref,tipo_conversa,status,payload').eq('conversa_id', conversaId).eq('data_ref', ref).maybeSingle<Analise>();
    if (error) throw error;
    if (!analise) return;
    const { tipo_conversa, status, payload } = desmarcar(analise);
    const { error: erroVolta } = await admin.from('analises_conversa').update({ tipo_conversa, status, payload }).eq('id', analise.id);
    if (erroVolta) throw erroVolta;
    await refazerRelatorios(admin, [analise]);
}

/**
 * "Fechado presencialmente": a venda conta no dia da última negociação no
 * WhatsApp. Suporte não vira venda (Silas, 14/10/2026): a tela oferece
 * "Resolvido" no lugar, e um formulário antigo aberto também não passa.
 */
export async function marcarFechadoPresencial(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const { ref, ultima } = await diaDaMarca(ctx.admin, conversaId);
    if (ultima?.data_ref === ref && marcaDeDesfecho(ultima.tipo_conversa) === 'resolvida') redirect(destino(form, conversaId));
    const { error } = await ctx.admin.from('conversas').update({
        fechada_presencial_em: new Date().toISOString(), fechada_presencial_por: ctx.userId, fechada_presencial_ref: ref,
    }).eq('id', conversaId);
    if (error) throw error;
    await marcarAnalise(ctx.admin, conversaId, ref, ultima, comVendaPresencial);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'marcou_fechado_presencial', alvo_id: conversaId, detalhes: { data_ref: ref } });
    revalidar(conversaId);
    redirect(destino(form, conversaId, 'presencial'));
}

export async function desfazerFechadoPresencial(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const ref = ctx.conversa.fechada_presencial_ref;
    const { error } = await ctx.admin.from('conversas')
        .update({ fechada_presencial_em: null, fechada_presencial_por: null, fechada_presencial_ref: null }).eq('id', conversaId);
    if (error) throw error;
    await desmarcarAnalise(ctx.admin, conversaId, ref, semVendaPresencial);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'desfez_fechado_presencial', alvo_id: conversaId, detalhes: { data_ref: ref } });
    revalidar(conversaId);
    redirect(destino(form, conversaId));
}

/**
 * "Resolvido": o pós-venda terminou (entrega reagendada e aceita, troca
 * feita). A análise do dia vira encerrada, sem venda, e a conversa sai do
 * "Esperando você" até o cliente escrever de novo.
 */
export async function marcarResolvida(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const { ref, ultima } = await diaDaMarca(ctx.admin, conversaId);
    const { error } = await ctx.admin.from('conversas').update({
        resolvida_em: new Date().toISOString(), resolvida_por: ctx.userId, resolvida_ref: ref,
    }).eq('id', conversaId);
    if (error) throw error;
    await marcarAnalise(ctx.admin, conversaId, ref, ultima, comResolvida);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'marcou_resolvida', alvo_id: conversaId, detalhes: { data_ref: ref } });
    revalidar(conversaId);
    redirect(destino(form, conversaId, 'resolvida'));
}

export async function desfazerResolvida(form: FormData) {
    const conversaId = String(form.get('conversaId') ?? '');
    const ctx = await quemMarca(conversaId);
    if (!ctx) return;
    const ref = ctx.conversa.resolvida_ref;
    const { error } = await ctx.admin.from('conversas')
        .update({ resolvida_em: null, resolvida_por: null, resolvida_ref: null }).eq('id', conversaId);
    if (error) throw error;
    await desmarcarAnalise(ctx.admin, conversaId, ref, semResolvida);
    await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'desfez_resolvida', alvo_id: conversaId, detalhes: { data_ref: ref } });
    revalidar(conversaId);
    redirect(destino(form, conversaId));
}
