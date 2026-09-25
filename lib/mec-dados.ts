import 'server-only';
import type { contextoApp } from '@/lib/contexto-app';
import { etapaProvisoria, type ItemPlaybook, type TipoItem } from '@/lib/mec';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];

export type DadosPlaybook = { id: string; itens: ItemPlaybook[]; rotulos: Map<string, string>; provisorias: Set<string> };

/** Playbook por id, ou o vigente quando `id` é null. `null` quando não existe. */
export async function carregarPlaybook(supabase: Supabase, id: string | null): Promise<DadosPlaybook | null> {
    let consulta = supabase.from('playbooks').select('id');
    consulta = id ? consulta.eq('id', id) : consulta.is('vigente_ate', null);
    const { data: pb } = await consulta.maybeSingle<{ id: string }>();
    if (!pb) return null;
    const { data: etapas } = await supabase.from('playbook_etapas').select('id,chave,descricao').eq('playbook_id', pb.id)
        .returns<{ id: string; chave: string; descricao: string | null }[]>();
    const ids = (etapas ?? []).map((e) => e.id);
    const { data: itens } = ids.length
        ? await supabase.from('playbook_itens').select('etapa_id,chave,tipo,rotulo').in('etapa_id', ids).order('ordem')
            .returns<{ etapa_id: string; chave: string; tipo: TipoItem; rotulo: string }[]>()
        : { data: [] as { etapa_id: string; chave: string; tipo: TipoItem; rotulo: string }[] };
    const chaveDaEtapa = new Map((etapas ?? []).map((e) => [e.id, e.chave]));
    const lista: ItemPlaybook[] = (itens ?? []).map((i) => ({ chave: i.chave, tipo: i.tipo, rotulo: i.rotulo, etapa: chaveDaEtapa.get(i.etapa_id) ?? '' }));
    return {
        id: pb.id,
        itens: lista,
        rotulos: new Map(lista.map((i) => [i.chave, i.rotulo])),
        provisorias: new Set((etapas ?? []).filter((e) => etapaProvisoria(e.descricao)).map((e) => e.chave)),
    };
}
