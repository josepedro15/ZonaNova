import 'server-only';
import type { criarClienteAdmin } from '@/lib/supabase/admin';
import { estaFora } from '@/lib/exclusao';

type Admin = ReturnType<typeof criarClienteAdmin>;
type Candidata = { id: string; user_id: string; unidade_id: string; cliente_telefone: string };

/**
 * Devolve às telas as conversas com estes telefones que nenhuma lista cobre
 * mais. Serve ao desbloqueio pessoal e à remoção de contato interno: tirar o
 * Depósito da lista pessoal não pode devolvê-lo ao painel enquanto ele estiver
 * na lista da loja, nem um colega conectado.
 */
export async function liberarConversas(admin: Admin, filtro: { userId?: string; unidadeId?: string }, telefones: string[]): Promise<void> {
    if (!telefones.length) return;
    let consulta = admin.from('conversas').select('id,user_id,unidade_id,cliente_telefone')
        .eq('bloqueada', true).in('cliente_telefone', telefones);
    if (filtro.userId) consulta = consulta.eq('user_id', filtro.userId);
    if (filtro.unidadeId) consulta = consulta.eq('unidade_id', filtro.unidadeId);
    const { data: candidatas, error } = await consulta.returns<Candidata[]>();
    if (error) throw error;
    if (!candidatas?.length) return;

    const usuarios = [...new Set(candidatas.map((c) => c.user_id))];
    const unidades = [...new Set(candidatas.map((c) => c.unidade_id))];
    const [pessoais, internos, conexoes] = await Promise.all([
        admin.from('contatos_bloqueados').select('user_id,telefone').in('user_id', usuarios)
            .returns<{ user_id: string; telefone: string }[]>(),
        admin.from('contatos_internos').select('unidade_id,telefone').in('unidade_id', unidades)
            .returns<{ unidade_id: string; telefone: string }[]>(),
        admin.from('conexoes_whatsapp').select('user_id,numero').not('numero', 'is', null)
            .returns<{ user_id: string; numero: string }[]>(),
    ]);
    for (const r of [pessoais, internos, conexoes]) if (r.error) throw r.error;

    const liberar = candidatas.filter((c) => !estaFora(c.cliente_telefone, {
        pessoais: (pessoais.data ?? []).filter((p) => p.user_id === c.user_id).map((p) => p.telefone),
        internos: (internos.data ?? []).filter((i) => i.unidade_id === c.unidade_id).map((i) => i.telefone),
        colegas: (conexoes.data ?? []).filter((x) => x.user_id !== c.user_id).map((x) => x.numero),
    })).map((c) => c.id);
    if (!liberar.length) return;
    const { error: erroLiberar } = await admin.from('conversas').update({ bloqueada: false }).in('id', liberar);
    if (erroLiberar) throw erroLiberar;
}
