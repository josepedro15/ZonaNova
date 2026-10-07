'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { telefoneE164, variantesTelefone } from '@/lib/painel';
import { liberarConversas } from '@/lib/exclusao-dados';
import { DESCARTADA } from '@/lib/natureza';

const UUID = /^[0-9a-f-]{36}$/i;

/** Quem mexe na lista da unidade: o gestor dela, supervisor e admin — ativos. */
async function quemCuida(unidadeId: string) {
    if (!UUID.test(unidadeId)) return null;
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = criarClienteAdmin();
    const { data: p } = await admin.from('profiles').select('role,status').eq('id', user.id)
        .maybeSingle<{ role: string; status: string }>();
    if (p?.status !== 'ativo') return null;
    if (p.role === 'supervisor' || p.role === 'admin') return { admin, userId: user.id };
    if (p.role !== 'gestor') return null;
    const { count } = await admin.from('gestor_unidades').select('unidade_id', { count: 'exact', head: true })
        .eq('gestor_id', user.id).eq('unidade_id', unidadeId);
    return count ? { admin, userId: user.id } : null;
}

function revalidar() {
    for (const caminho of ['/perfil', '/dashboard', '/conversas', '/equipe']) revalidatePath(caminho);
}

export async function adicionarContatoInterno(form: FormData) {
    const unidadeId = String(form.get('unidadeId') ?? '');
    const telefone = telefoneE164(String(form.get('telefone') ?? '')).slice(0, 20);
    const descricao = String(form.get('descricao') ?? '').trim().slice(0, 120);
    if (telefone.length < 8 || !descricao) return;
    const ctx = await quemCuida(unidadeId);
    if (!ctx) return;
    const { error } = await ctx.admin.from('contatos_internos')
        .upsert({ unidade_id: unidadeId, telefone, descricao, criado_por: ctx.userId }, { onConflict: 'unidade_id,telefone' });
    if (error) throw error;
    // O que já chegou sai das telas e da análise, sem ser apagado.
    const { error: erroBloqueio } = await ctx.admin.from('conversas').update({ bloqueada: true })
        .eq('unidade_id', unidadeId).in('cliente_telefone', variantesTelefone(telefone));
    if (erroBloqueio) throw erroBloqueio;
    await ctx.admin.from('eventos_admin').insert({
        actor_id: ctx.userId, acao: 'adicionou_contato_interno', alvo_id: unidadeId, detalhes: { telefone, descricao },
    });
    revalidar();
}

export async function removerContatoInterno(form: FormData) {
    const id = String(form.get('id') ?? '');
    if (!UUID.test(id)) return;
    const { data: alvo } = await criarClienteAdmin().from('contatos_internos').select('unidade_id,telefone,descricao').eq('id', id)
        .maybeSingle<{ unidade_id: string; telefone: string; descricao: string }>();
    if (!alvo) return;
    const ctx = await quemCuida(alvo.unidade_id);
    if (!ctx) return;
    const { error } = await ctx.admin.from('contatos_internos').delete().eq('id', id);
    if (error) throw error;
    await liberarConversas(ctx.admin, { unidadeId: alvo.unidade_id }, variantesTelefone(alvo.telefone));
    await ctx.admin.from('eventos_admin').insert({
        actor_id: ctx.userId, acao: 'removeu_contato_interno', alvo_id: alvo.unidade_id, detalhes: { telefone: alvo.telefone, descricao: alvo.descricao },
    });
    revalidar();
}

/**
 * "É cliente": a sugestão da IA estava errada. Marca as análises da conversa
 * (a próxima análise herda a marca), e ela volta às objeções e ao relatório
 * do vendedor — que é refeito nos dias em que ficou de fora.
 */
export async function descartarSugestaoInterno(form: FormData) {
    const unidadeId = String(form.get('unidadeId') ?? '');
    const telefone = String(form.get('telefone') ?? '').trim().slice(0, 40);
    if (telefone.length < 8) return;
    const ctx = await quemCuida(unidadeId);
    if (!ctx) return;
    const { data: conversas, error } = await ctx.admin.from('conversas').select('id')
        .eq('unidade_id', unidadeId).in('cliente_telefone', variantesTelefone(telefone));
    if (error) throw error;
    if (!conversas?.length) return;
    const { data: analises, error: erroAnalises } = await ctx.admin.from('analises_conversa').select('id,user_id,data_ref,payload')
        .in('conversa_id', conversas.map((c) => c.id)).returns<{ id: string; user_id: string; data_ref: string; payload: Record<string, unknown> }[]>();
    if (erroAnalises) throw erroAnalises;
    for (const a of analises ?? []) {
        const { error: erroMarca } = await ctx.admin.from('analises_conversa').update({ payload: { ...a.payload, [DESCARTADA]: true } }).eq('id', a.id);
        if (erroMarca) throw erroMarca;
    }
    const dias = new Map((analises ?? []).map((a) => [`${a.user_id}|${a.data_ref}`, a]));
    for (const a of dias.values()) {
        const { error: erroFila } = await ctx.admin.rpc('zn_reabrir_item', { p_tipo: 'relatorio_vendedor', p_referencia: a.user_id, p_data: a.data_ref });
        if (erroFila) throw erroFila;
    }
    await ctx.admin.from('eventos_admin').insert({
        actor_id: ctx.userId, acao: 'descartou_sugestao_interno', alvo_id: unidadeId, detalhes: { telefone, analises: analises?.length ?? 0 },
    });
    revalidar();
}
