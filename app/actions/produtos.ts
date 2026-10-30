'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f-]{36}$/i;

/** Quem mexe na lista de produtos sem alternativa: admin e, desde 30/10, supervisor — ativos. */
async function quemCuida() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = criarClienteAdmin();
    const { data: p } = await admin.from('profiles').select('role,status').eq('id', user.id)
        .maybeSingle<{ role: string; status: string }>();
    return p?.status === 'ativo' && (p.role === 'admin' || p.role === 'supervisor') ? { admin, userId: user.id } : null;
}

export async function adicionarProdutoSemAlternativa(form: FormData) {
    const produto = String(form.get('produto') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const observacao = String(form.get('observacao') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    if (produto.length < 2) return;
    const ctx = await quemCuida();
    if (!ctx) return;
    const { error } = await ctx.admin.from('produtos_sem_alternativa').insert({ produto, observacao, criado_por: ctx.userId });
    // Já na lista (o índice ignora maiúsculas): nada a fazer.
    if (error && error.code !== '23505') throw error;
    if (!error) {
        await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'adicionou_produto_sem_alternativa', detalhes: { produto, observacao } });
    }
    revalidatePath('/admin/produtos');
}

export async function removerProdutoSemAlternativa(form: FormData) {
    const id = String(form.get('id') ?? '');
    if (!UUID.test(id)) return;
    const ctx = await quemCuida();
    if (!ctx) return;
    const { data: alvo, error } = await ctx.admin.from('produtos_sem_alternativa').delete().eq('id', id)
        .select('produto').maybeSingle<{ produto: string }>();
    if (error) throw error;
    if (alvo) await ctx.admin.from('eventos_admin').insert({ actor_id: ctx.userId, acao: 'removeu_produto_sem_alternativa', detalhes: { produto: alvo.produto } });
    revalidatePath('/admin/produtos');
}
