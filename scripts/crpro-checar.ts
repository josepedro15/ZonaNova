/**
 * Confere a chave do CRPRO sem escrever nada: a chave abre, é da organização
 * certa (o funil configurado está lá, com a etapa), e lê cards.
 *
 *   node --env-file=.env.local scripts/crpro-checar.ts
 *
 * Não prova `contacts:write` nem `deals:write` — isso só a primeira escrita
 * prova. Confira as permissões da chave no painel do CRPRO.
 */
import { lerConfigCrm } from '../lib/crm.ts';

const config = lerConfigCrm(process.env);
if (!config.apiKey) {
    console.error('CRPRO_API_KEY ausente no ambiente');
    process.exit(1);
}

async function ler(caminho: string): Promise<unknown> {
    const r = await fetch(`${config.baseUrl}${caminho}`, {
        headers: { 'x-api-key': config.apiKey }, signal: AbortSignal.timeout(15_000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
        console.error(`GET ${caminho}: ${r.status}`, JSON.stringify(corpo));
        process.exit(1);
    }
    return corpo;
}

type Funil = { id: string; name: string; stages?: { id: string; name: string; is_default_entry_point?: boolean }[] };
const { data: funis = [] } = await ler('/pipelines') as { data?: Funil[] };
for (const f of funis) console.log(`funil ${f.name} (${f.id}): ${(f.stages ?? []).map((s) => `${s.name}${s.is_default_entry_point ? ' [entrada]' : ''}`).join(' → ')}`);

const funil = funis.find((f) => f.id === config.pipelineId);
const etapa = funil?.stages?.find((s) => s.id === config.stageId);
console.log(funil ? `OK funil configurado: ${funil.name}` : 'FALTA o funil CRPRO_PIPELINE_ID nesta organização — a chave é de outra org?');
console.log(etapa ? `OK etapa configurada: ${etapa.name}` : 'FALTA a etapa CRPRO_STAGE_ID neste funil');
if (etapa?.is_default_entry_point) console.log('ATENÇÃO a etapa ainda é de entrada: contato novo ganharia card automático');

await ler('/deals?limit=1');
console.log('OK a chave lê cards (deals:read)');
console.log(config.linha ? `linha configurada: ${config.linha}` : 'FALTA CRPRO_CONNECTED_PHONE');
