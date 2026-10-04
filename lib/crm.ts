/**
 * Lead quente → CRM CRPRO (plano 2026-10-04). Só regra, sem I/O: o worker
 * busca os dados, pergunta aqui o que fazer e chama o cliente do CRPRO.
 */
import { detalheLigado } from './mec.ts';
import { semTelefone, variantesTelefone } from './painel.ts';

/** Combinado em 04/10/2026; a mesma nota que o plano do piloto propôs. */
export const NOTA_MINIMA = 70;

export type AnaliseCrm = {
    tipo_conversa: string | null;
    status: string | null;
    potencial_venda: string | null;
    score_oportunidade: number | null;
};

/**
 * Negociação em andamento, potencial alto e nota de oportunidade ≥ 70 na
 * análise do dia. Venda feita já não precisa do CRM; fria vai para o
 * "Retomar contato", não para cá.
 */
export function leadQuente(a: AnaliseCrm): boolean {
    return a.tipo_conversa === 'negociacao'
        && a.status === 'em_andamento'
        && a.potencial_venda === 'alto'
        && (a.score_oportunidade ?? 0) >= NOTA_MINIMA;
}

/**
 * O telefone que vai ao CRM e que trava o card repetido: brasileiro, com o
 * nono dígito quando é celular — o JID antigo chega sem ele, e a trava não
 * pode ver dois clientes onde há um. `lid:` não é telefone: o CRPRO recusaria
 * e não haveria para quem ligar.
 */
export function telefoneDoCrm(telefone: string): string | null {
    if (semTelefone(telefone)) return null;
    const d = telefone.replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(d)) return null;
    return variantesTelefone(d).find((v) => v.length === 13) ?? d;
}

export const refExterna = (telefone: string) => `zonanova:${telefone}`;

export function nomeDoContato(nome: string | null, telefone: string): string {
    return (nome?.trim() || `Cliente ${telefone}`).slice(0, 120);
}

/** A profissão no título: é o que o Silas queria ver no nome do contato. */
export function tituloDoCard(nome: string | null, profissao: string, telefone: string): string {
    // O título tem 200 de limite; o nome do contato, 120. Cortar antes daqui
    // cortaria o título no limite do contato.
    const quem = nome?.trim() || `Cliente ${telefone}`;
    const oficio = profissao.trim();
    return (oficio ? `${quem} · ${oficio}` : quem).slice(0, 200);
}

export function etiquetaDoVendedor(nome: string): string {
    return nome.trim().slice(0, 50);
}

export type ResumoLead = { vendedor: string; dataRef: string; score: number; resumo: string; proximaAcao: string };

/** A nota interna do contato: o porquê do card, para o vendedor não abrir o ZonaNova. */
export function notaDoCard(r: ResumoLead): string {
    const [ano, mes, dia] = r.dataRef.split('-');
    return [
        `Lead quente identificado pelo ZonaNova na conversa de ${dia}/${mes}/${ano}.`,
        `Vendedor: ${r.vendedor}`,
        `Oportunidade: ${r.score}/100 · potencial alto`,
        r.resumo.trim() && `Resumo: ${r.resumo.trim()}`,
        r.proximaAcao.trim() && `Próxima ação: ${r.proximaAcao.trim()}`,
    ].filter(Boolean).join('\n');
}

export type ConfigCrm = {
    unidades: string;
    modo: 'simulacao' | 'envio';
    baseUrl: string;
    apiKey: string;
    pipelineId: string;
    stageId: string;
    linha: string;
};

export function lerConfigCrm(env: Record<string, string | undefined>): ConfigCrm {
    return {
        unidades: env.CRPRO_UNIDADES ?? '',
        // Só a palavra exata liga o envio real: variável errada ou ausente simula.
        modo: env.CRPRO_MODO === 'envio' ? 'envio' : 'simulacao',
        baseUrl: env.CRPRO_BASE_URL || 'https://app.crpro.com.br/api/v1',
        apiKey: env.CRPRO_API_KEY ?? '',
        pipelineId: env.CRPRO_PIPELINE_ID ?? '',
        stageId: env.CRPRO_STAGE_ID ?? '',
        linha: env.CRPRO_CONNECTED_PHONE ?? '',
    };
}

/** O que falta para o envio real. Vazio = pode enviar. */
export function faltandoParaEnviar(c: ConfigCrm): string[] {
    return ([
        ['CRPRO_API_KEY', c.apiKey],
        ['CRPRO_PIPELINE_ID', c.pipelineId],
        ['CRPRO_STAGE_ID', c.stageId],
        ['CRPRO_CONNECTED_PHONE', c.linha],
    ] as const).filter(([, valor]) => !valor).map(([nome]) => nome);
}

export type Candidato = { unidadeId: string; bloqueada: boolean; telefone: string; analise: AnaliseCrm | null };

export type Decisao = { acao: 'ignorar'; motivo: string } | { acao: 'simular' | 'enviar'; telefone: string };

const ignorar = (motivo: string): Decisao => ({ acao: 'ignorar', motivo });

/**
 * Vale no enfileiramento e de novo na hora de enviar: entre um e outro a
 * conversa pode ter saído da análise (contato interno, colega conectado).
 */
export function decidirEnvio(c: Candidato, config: ConfigCrm): Decisao {
    // Mesma lista do piloto do MEC: vazio desliga, * liga todas, ou ids por vírgula.
    if (!detalheLigado(c.unidadeId, config.unidades)) return ignorar('unidade fora do envio ao CRM');
    if (c.bloqueada) return ignorar('conversa fora da análise');
    if (!c.analise || !leadQuente(c.analise)) return ignorar('não é lead quente');
    const telefone = telefoneDoCrm(c.telefone);
    if (!telefone) return ignorar('contato sem telefone brasileiro');
    return { acao: config.modo === 'envio' ? 'enviar' : 'simular', telefone };
}
