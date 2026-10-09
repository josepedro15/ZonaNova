// O transcript que o worker montaria para um dia (app/api/cron/processar-fila,
// analisarItem), sem mídia: as calibrações mandam ao modelo exatamente o que a
// produção mandaria.
import { janelaDoDia, marcaRetomada, montarTranscript } from '../lib/analise.ts';

export async function transcriptDoDia(db, conversaId, dataRef) {
    const { inicio, fim } = janelaDoDia(dataRef);
    const { data: mensagens, error } = await db.from('mensagens').select('direcao,tipo,conteudo,transcricao,automatica,enviada_em')
        .eq('conversa_id', conversaId).gte('enviada_em', inicio.toISOString()).lt('enviada_em', fim.toISOString()).order('enviada_em');
    if (error) throw error;
    if (!mensagens?.length || !mensagens.some((m) => m.direcao === 'entrada')) return null;
    const primeiraEntrada = mensagens.findIndex((m) => m.direcao === 'entrada');
    const recorte = primeiraEntrada > 0 && mensagens.slice(0, primeiraEntrada).every((m) => m.automatica) ? mensagens.slice(primeiraEntrada) : mensagens;
    const { data: anterior } = await db.from('mensagens').select('enviada_em').eq('conversa_id', conversaId)
        .lt('enviada_em', inicio.toISOString()).order('enviada_em', { ascending: false }).limit(1).maybeSingle();
    return [marcaRetomada(anterior?.enviada_em ?? null, inicio), montarTranscript(recorte)].filter(Boolean).join('\n');
}
