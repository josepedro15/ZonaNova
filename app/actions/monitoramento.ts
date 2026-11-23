'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataEmSaoPaulo } from '@/lib/analise';
import { MAX_MONITORAMENTOS_ATIVOS, schemaProposta, type Proposta } from '@/lib/monitoramento';

const TELAS = ['/ia', '/dashboard', '/equipe', '/unidades'];

/**
 * O clique em "Começar a monitorar" no chat. Grava com a sessão de quem
 * clicou: a RLS da 0036 só deixa o supervisor e o admin criarem para a rede e
 * o gestor para a unidade dele.
 */
export async function criarMonitoramento(proposta: Proposta): Promise<{ ok: true } | { erro: string }> {
    const lida = schemaProposta.safeParse(proposta);
    if (!lida.success) return { erro: 'A proposta veio incompleta. Peça à IA para montar de novo.' };
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada. Entre de novo.' };
    const { count } = await supabase.from('monitoramentos').select('id', { count: 'exact', head: true })
        .is('encerrado_em', null).gte('fim', dataEmSaoPaulo(new Date()));
    if ((count ?? 0) >= MAX_MONITORAMENTOS_ATIVOS) return { erro: `Já há ${MAX_MONITORAMENTOS_ATIVOS} monitoramentos abertos. Encerre um antes.` };
    const { error } = await supabase.from('monitoramentos').insert({ ...lida.data, criado_por: user.id });
    if (error) {
        console.error('criarMonitoramento', error);
        return { erro: error.code === '42501' ? 'Você não pode criar este monitoramento (só para a sua unidade).' : 'Não consegui gravar. Tente de novo.' };
    }
    for (const t of TELAS) revalidatePath(t);
    return { ok: true };
}

/** "Parar": quem criou, ou supervisor e admin (RLS da 0036). */
export async function encerrarMonitoramento(form: FormData): Promise<void> {
    const id = String(form.get('id') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from('monitoramentos').update({ encerrado_em: new Date().toISOString() }).eq('id', id).is('encerrado_em', null);
    if (error) console.error('encerrarMonitoramento', error);
    for (const t of TELAS) revalidatePath(t);
}
