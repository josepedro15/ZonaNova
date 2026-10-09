/**
 * O levantamento de objeções da aba Objeções (pedido do piloto, 09/10/2026):
 * por período ou geral, da loja do gestor ou da rede — sem I/O.
 *
 * O recorte é o do relatório do vendedor (consolidarItem, em
 * app/api/cron/processar-fila/route.ts) e do card "Objeções da semana": só
 * negociação de quem é vendedor, sem a conversa que a análise viu como de
 * colega, fornecedor ou pessoal (lib/natureza.ts), nem a dispensada ("Não é
 * atendimento") ou bloqueada — quem chama já tira essas duas na consulta.
 *
 * A unidade de conta é a negociação de um dia (conversa + dia), como no
 * relatório: a mesma objeção repetida na mesma conversa e no mesmo dia conta
 * uma vez. Na conversa com o detalhe do MEC (piloto), vale o código do
 * catálogo; nas outras, o texto livre da análise.
 */
import { naturezaSuspeita } from './natureza.ts';
import { FORA_DO_CATALOGO } from './mec.ts';

export type AnaliseComObjecoes = {
    conversa_id: string;
    data_ref: string;
    user_id: string;
    tipo_conversa: string | null;
    /** O payload da análise, ou só os campos de objeção e natureza dele. */
    payload: unknown;
};

export type CodigoDeObjecao = { conversa_id: string; data_ref: string; item_chave: string | null };

/**
 * O tema de cada objeção. A análise escreve a objeção com as palavras dela:
 * em 09/10 eram 155 textos diferentes, e "Produto indisponível", "Produto
 * não disponível" e "Produto não disponível na loja" contavam separados. O
 * tema junta pelo assunto, por palavra-chave e na ordem abaixo — a primeira
 * que casa vence ("preço maior que o concorrente" é concorrente; "não pode
 * pagar na entrega" é pagamento). É aproximado e a tela diz isso.
 */
export const TEMAS = [
    { tema: 'concorrente', rotulo: 'Concorrência', re: /concorr|outra loja|outro lugar|outro fornecedor|internet|com outro|outro orcamento|ja comprei|ja encontrou/ },
    { tema: 'frete', rotulo: 'Frete', re: /frete|taxa de entrega/ },
    { tema: 'disponibilidade', rotulo: 'Produto em falta', re: /indispon|disponivel|estoque|falta de|lote|nao trabalha com|nenhum fornecedor|nao vamos ter/ },
    { tema: 'preco', rotulo: 'Preço e desconto', re: /preco|caro|valor|desconto|barat|arredond|custo|promoc|aumento|limite de orcamento/ },
    { tema: 'pagamento', rotulo: 'Forma de pagamento', re: /pag(ar|amento|o)|parcel|cartao|boleto|pix|crediario|a vista|juros|banricompras|nota fiscal/ },
    { tema: 'prazo', rotulo: 'Prazo e entrega', re: /prazo|demora|entrega|atraso|retirada|hoje|amanha|sabado|data/ },
    { tema: 'produto', rotulo: 'Produto, qualidade e cor', re: /qualidade|durab|resist|garantia|marca|limpeza|funcion|adequ|atende|\bcor\b|acabamento|modelo|tamanho|lixa|grao/ },
] as const;

export type Tema = (typeof TEMAS)[number]['tema'] | 'outros';
export const ROTULO_TEMA: Record<Tema, string> = { ...Object.fromEntries(TEMAS.map((t) => [t.tema, t.rotulo])) as Record<(typeof TEMAS)[number]['tema'], string>, outros: 'Outros' };

export function temaDaObjecao(texto: string): Tema {
    const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return TEMAS.find((x) => x.re.test(t))?.tema ?? 'outros';
}

export type Exemplo = { conversa_id: string; data_ref: string };

export type LinhaObjecao = {
    objecao: string;
    /** Em quantas negociações (conversa + dia) apareceu. */
    total: number;
    /** As mais recentes primeiro, até `MAX_EXEMPLOS`. */
    exemplos: Exemplo[];
};

export type ResumoVendedor = { user_id: string; negociacoes: number; comObjecao: number; principal: string | null };

export type LinhaTema = { tema: Tema; rotulo: string; total: number };

export type Levantamento = {
    negociacoes: number;
    comObjecao: number;
    /** Em quantas negociações cada tema apareceu (uma vez por negociação). */
    temas: LinhaTema[];
    objecoes: LinhaObjecao[];
    porVendedor: ResumoVendedor[];
};

export const MAX_EXEMPLOS = 3;

const chaveDe = (conversaId: string, dataRef: string) => `${conversaId}|${dataRef}`;
const comMaiuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);

function textosLivres(payload: unknown): string[] {
    const bruto = payload && typeof payload === 'object' ? (payload as { objecoes?: unknown }).objecoes : undefined;
    if (!Array.isArray(bruto)) return [];
    return bruto.flatMap((o) => (typeof o === 'string' && o.trim() ? [comMaiuscula(o.trim())] : []));
}

export function levantarObjecoes({ analises, vendedores, codigos, rotulos }: {
    analises: readonly AnaliseComObjecoes[];
    vendedores: ReadonlySet<string>;
    codigos: readonly CodigoDeObjecao[];
    rotulos: ReadonlyMap<string, string>;
}): Levantamento {
    const deVenda = analises.filter((a) => a.tipo_conversa === 'negociacao' && vendedores.has(a.user_id) && !naturezaSuspeita(a.payload));
    const codigosPorDia = new Map<string, string[]>();
    for (const c of codigos) {
        if (!c.item_chave) continue;
        const rotulo = c.item_chave === FORA_DO_CATALOGO ? 'Fora do catálogo' : rotulos.get(c.item_chave) ?? c.item_chave;
        const chave = chaveDe(c.conversa_id, c.data_ref);
        codigosPorDia.set(chave, [...(codigosPorDia.get(chave) ?? []), rotulo]);
    }

    const linhas = new Map<string, LinhaObjecao>();
    const temas = new Map<Tema, number>();
    const porVendedor = new Map<string, { negociacoes: number; comObjecao: number; contagem: Map<string, LinhaObjecao> }>();
    let comObjecao = 0;
    // Mais recente primeiro: os exemplos de cada objeção saem na ordem certa.
    for (const a of [...deVenda].sort((x, y) => y.data_ref.localeCompare(x.data_ref))) {
        const doDia = codigosPorDia.get(chaveDe(a.conversa_id, a.data_ref)) ?? textosLivres(a.payload);
        const unicas = new Map(doDia.map((o) => [o.toLocaleLowerCase('pt-BR'), o]));
        const vendedor = porVendedor.get(a.user_id) ?? { negociacoes: 0, comObjecao: 0, contagem: new Map() };
        porVendedor.set(a.user_id, vendedor);
        vendedor.negociacoes += 1;
        if (!unicas.size) continue;
        comObjecao += 1;
        vendedor.comObjecao += 1;
        for (const tema of new Set([...unicas.values()].map(temaDaObjecao))) temas.set(tema, (temas.get(tema) ?? 0) + 1);
        for (const [chave, objecao] of unicas) {
            for (const mapa of [linhas, vendedor.contagem]) {
                const linha = mapa.get(chave) ?? { objecao, total: 0, exemplos: [] };
                mapa.set(chave, linha);
                linha.total += 1;
                if (linha.exemplos.length < MAX_EXEMPLOS) linha.exemplos.push({ conversa_id: a.conversa_id, data_ref: a.data_ref });
            }
        }
    }

    const ordenar = (l: Iterable<LinhaObjecao>) => [...l].sort((a, b) => b.total - a.total || a.objecao.localeCompare(b.objecao, 'pt-BR'));
    return {
        negociacoes: deVenda.length,
        comObjecao,
        // "Outros" por último, qualquer que seja o tamanho: não é um tema.
        temas: [...temas.entries()].map(([tema, total]) => ({ tema, rotulo: ROTULO_TEMA[tema], total }))
            .sort((a, b) => Number(a.tema === 'outros') - Number(b.tema === 'outros') || b.total - a.total),
        objecoes: ordenar(linhas.values()),
        porVendedor: [...porVendedor.entries()]
            .map(([user_id, v]) => ({ user_id, negociacoes: v.negociacoes, comObjecao: v.comObjecao, principal: ordenar(v.contagem.values())[0]?.objecao ?? null }))
            .sort((a, b) => b.comObjecao - a.comObjecao || b.negociacoes - a.negociacoes),
    };
}

/** Os períodos da aba. `null` em `dias` é "geral": tudo o que foi analisado. */
export const PERIODOS = {
    '7': { rotulo: '7 dias', dias: 7 },
    '30': { rotulo: '30 dias', dias: 30 },
    '90': { rotulo: '90 dias', dias: 90 },
    geral: { rotulo: 'Geral', dias: null },
} as const satisfies Record<string, { rotulo: string; dias: number | null }>;

export type Periodo = keyof typeof PERIODOS;

export function periodoDe(pedido: string | undefined): Periodo {
    return pedido && Object.hasOwn(PERIODOS, pedido) ? (pedido as Periodo) : '30';
}
