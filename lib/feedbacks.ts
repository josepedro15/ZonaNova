/**
 * Os feedbacks dos clientes — elogios e reclamações — da aba Feedbacks
 * (Silas, 22/10/2026): o campo da análise e o levantamento, sem I/O.
 *
 * A análise de cada conversa devolve `feedbacks` com a fala literal do
 * cliente (lib/analise.ts confere que ela está numa linha C:). O recorte da
 * aba é o das objeções sem a restrição de negociação: a reclamação de entrega
 * mora no suporte. Fica fora a conversa que a análise viu como de colega,
 * fornecedor ou pessoal (lib/natureza.ts), e quem chama tira na consulta a
 * dispensada e a bloqueada.
 */
import { z } from 'zod';
import { naturezaSuspeita } from './natureza.ts';

export const POLARIDADES = ['positivo', 'negativo'] as const;
export type Polaridade = (typeof POLARIDADES)[number];

export const ASSUNTOS_FEEDBACK = ['entrega_frete', 'atendimento', 'produto', 'preco', 'pagamento', 'outros'] as const;
export type AssuntoFeedback = (typeof ASSUNTOS_FEEDBACK)[number];

export const ROTULO_ASSUNTO: Record<AssuntoFeedback, string> = {
    entrega_frete: 'Entrega e frete', atendimento: 'Atendimento', produto: 'Produto e qualidade',
    preco: 'Preço', pagamento: 'Pagamento', outros: 'Outros',
};

const schemaItem = z.object({
    polaridade: z.enum(POLARIDADES),
    assunto: z.enum(ASSUNTOS_FEEDBACK).catch('outros'),
    trecho: z.string().trim().min(1),
});

export type Feedback = z.infer<typeof schemaItem>;

/**
 * Item fora do contrato sai, lista fora do contrato vira [] e assunto
 * desconhecido vira "outros": como o mec_detalhe, nunca derruba a análise.
 */
export const schemaFeedbacks = z.array(z.unknown())
    .transform((itens): Feedback[] => itens.flatMap((i) => {
        const r = schemaItem.safeParse(i);
        return r.success ? [r.data] : [];
    }))
    .catch([]);

export const schemaJsonFeedbacks = {
    type: 'array',
    items: {
        type: 'object', additionalProperties: false, required: ['polaridade', 'assunto', 'trecho'],
        properties: {
            polaridade: { type: 'string', enum: [...POLARIDADES] },
            assunto: { type: 'string', enum: [...ASSUNTOS_FEEDBACK] },
            trecho: { type: 'string' },
        },
    },
} as const;

export type AnaliseComFeedbacks = {
    conversa_id: string;
    data_ref: string;
    user_id: string;
    /** O payload da análise, ou só os campos de feedback e natureza dele. */
    payload: unknown;
};

export type ItemFeedback = Feedback & { conversa_id: string; data_ref: string; user_id: string };

export type LinhaAssunto = { assunto: AssuntoFeedback; rotulo: string; positivos: number; negativos: number };

export type ResumoVendedorFeedback = {
    user_id: string;
    conversas: number;
    comElogio: number;
    comReclamacao: number;
    /** O assunto em que ele mais recebeu reclamação. */
    principal: string | null;
};

export type LevantamentoFeedbacks = {
    /** Conversas do dia lidas para feedback (com o campo na análise). */
    conversas: number;
    comElogio: number;
    comReclamacao: number;
    assuntos: LinhaAssunto[];
    /** As mais recentes primeiro. */
    reclamacoes: ItemFeedback[];
    elogios: ItemFeedback[];
    porVendedor: ResumoVendedorFeedback[];
};

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A unidade de conta é a conversa de um dia, como nas objeções. A análise que
 * ainda não tem o campo (anterior a 22/10, antes do script do histórico) fica
 * fora até do total: não foi lida para feedback.
 */
export function levantarFeedbacks({ analises, vendedores }: {
    analises: readonly AnaliseComFeedbacks[];
    vendedores: ReadonlySet<string>;
}): LevantamentoFeedbacks {
    const lidas = analises.filter((a) => vendedores.has(a.user_id) && !naturezaSuspeita(a.payload)
        && Array.isArray((a.payload as { feedbacks?: unknown } | null)?.feedbacks));
    const assuntos = new Map<AssuntoFeedback, { positivos: number; negativos: number }>();
    const porVendedor = new Map<string, { conversas: number; comElogio: number; comReclamacao: number; reclamados: Map<AssuntoFeedback, number> }>();
    const reclamacoes: ItemFeedback[] = [];
    const elogios: ItemFeedback[] = [];
    let comElogio = 0;
    let comReclamacao = 0;

    for (const a of [...lidas].sort((x, y) => y.data_ref.localeCompare(x.data_ref))) {
        const feedbacks = schemaFeedbacks.parse((a.payload as { feedbacks: unknown }).feedbacks);
        // O mesmo trecho repetido conta uma vez; fica a primeira grafia.
        const unicos = new Map<string, Feedback>();
        for (const f of feedbacks) {
            const chave = `${f.polaridade}|${normalizar(f.trecho)}`;
            if (!unicos.has(chave)) unicos.set(chave, f);
        }
        const vendedor = porVendedor.get(a.user_id) ?? { conversas: 0, comElogio: 0, comReclamacao: 0, reclamados: new Map() };
        porVendedor.set(a.user_id, vendedor);
        vendedor.conversas += 1;
        const positivos = [...unicos.values()].filter((f) => f.polaridade === 'positivo');
        const negativos = [...unicos.values()].filter((f) => f.polaridade === 'negativo');
        if (positivos.length) { comElogio += 1; vendedor.comElogio += 1; }
        if (negativos.length) { comReclamacao += 1; vendedor.comReclamacao += 1; }
        for (const assunto of new Set(positivos.map((f) => f.assunto))) {
            const linha = assuntos.get(assunto) ?? { positivos: 0, negativos: 0 };
            assuntos.set(assunto, { ...linha, positivos: linha.positivos + 1 });
        }
        for (const assunto of new Set(negativos.map((f) => f.assunto))) {
            const linha = assuntos.get(assunto) ?? { positivos: 0, negativos: 0 };
            assuntos.set(assunto, { ...linha, negativos: linha.negativos + 1 });
            vendedor.reclamados.set(assunto, (vendedor.reclamados.get(assunto) ?? 0) + 1);
        }
        const doDia = { conversa_id: a.conversa_id, data_ref: a.data_ref, user_id: a.user_id };
        reclamacoes.push(...negativos.map((f) => ({ ...f, ...doDia })));
        elogios.push(...positivos.map((f) => ({ ...f, ...doDia })));
    }

    return {
        conversas: lidas.length,
        comElogio,
        comReclamacao,
        // "Outros" por último, qualquer que seja o tamanho: não é um assunto.
        assuntos: [...assuntos.entries()].map(([assunto, l]) => ({ assunto, rotulo: ROTULO_ASSUNTO[assunto], ...l }))
            .sort((a, b) => Number(a.assunto === 'outros') - Number(b.assunto === 'outros') || b.negativos - a.negativos || b.positivos - a.positivos),
        reclamacoes,
        elogios,
        porVendedor: [...porVendedor.entries()]
            .map(([user_id, v]) => {
                const [principal] = [...v.reclamados.entries()].sort((a, b) => b[1] - a[1]);
                return { user_id, conversas: v.conversas, comElogio: v.comElogio, comReclamacao: v.comReclamacao, principal: principal ? ROTULO_ASSUNTO[principal[0]] : null };
            })
            .sort((a, b) => b.comReclamacao - a.comReclamacao || b.conversas - a.conversas),
    };
}
