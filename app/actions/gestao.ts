'use server';

import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export async function registrarObservacao(form: FormData) {
    const vendedorId = String(form.get('vendedorId') ?? '');
    const unidadeId = String(form.get('unidadeId') ?? '');
    const texto = String(form.get('texto') ?? '').trim().slice(0, 2000);
    if (!texto || !/^[0-9a-f-]{36}$/i.test(vendedorId) || !/^[0-9a-f-]{36}$/i.test(unidadeId)) return;
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: gestor }, { data: unidades }] = await Promise.all([
        supabase.from('profiles').select('role,status').eq('id', user.id).maybeSingle<{ role: string; status: string }>(),
        supabase.from('gestor_unidades').select('unidade_id').eq('gestor_id', user.id),
    ]);
    if (!gestor || gestor.status !== 'ativo' || !['gestor','supervisor','admin'].includes(gestor.role)) return;
    if (gestor.role === 'gestor' && !(unidades ?? []).some((u) => u.unidade_id === unidadeId)) return;
    const admin = criarClienteAdmin();
    const { data: vendedor } = await admin.from('profiles').select('id').eq('id', vendedorId).eq('unidade_id', unidadeId).eq('role', 'vendedor').maybeSingle();
    if (!vendedor) return;
    await admin.from('observacoes_gestor').insert({ vendedor_id: vendedorId, gestor_id: user.id, unidade_id: unidadeId, texto });
    revalidatePath(`/equipe/${vendedorId}`);
}

export async function contestarAderencia(form: FormData) {
    const aderenciaId = String(form.get('aderenciaId') ?? '');
    const motivo = String(form.get('motivo') ?? '').trim().slice(0, 1000);
    if (!motivo || !/^[0-9a-f-]{36}$/i.test(aderenciaId)) return;
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('aderencia_contestacoes').insert({ aderencia_id: aderenciaId, contestado_por: user.id, motivo });
    revalidatePath('/equipe/mec');
}
