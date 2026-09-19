#!/usr/bin/env node
// =============================================================================
// Promove uma conta a supervisor (ou admin). Uso:
//
//   node --env-file=.env.local scripts/promover.mjs pessoa@zonanova.com.br
//   node --env-file=.env.local scripts/promover.mjs pessoa@zonanova.com.br admin
//
// Resolve o problema do ovo e da galinha: todo cadastro nasce vendedor e
// pendente, e só quem já é gestor aprova. O primeiro supervisor não tem quem o
// aprove. Por isso existe ISTO, e não uma tela: um script que exige a chave de
// service role na máquina de quem o roda. Um botão "virar supervisor" na
// interface seria a escalada de privilégio que o tests/rls.sql existe para
// impedir.
//
// A pessoa precisa se cadastrar pelo app primeiro — o script não cria conta,
// só promove uma que já existe. Fica registrado em eventos_admin.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

const [email, papel = 'supervisor'] = process.argv.slice(2);

if (!email || !['supervisor', 'admin'].includes(papel)) {
    console.error('uso: node --env-file=.env.local scripts/promover.mjs <email> [supervisor|admin]');
    process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
    console.error('faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY — rode com --env-file=.env.local');
    process.exit(1);
}

const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: perfil, error } = await db
    .from('profiles').select('id, nome, role, status, unidade_id')
    .eq('email', email.trim().toLowerCase()).maybeSingle();

if (error) { console.error(error.message); process.exit(1); }
if (!perfil) {
    console.error(`nenhum cadastro com o e-mail ${email}. A pessoa precisa se cadastrar no app primeiro.`);
    process.exit(1);
}

if (perfil.role === papel && perfil.status === 'ativo') {
    console.log(`${perfil.nome} já é ${papel} ativo. Nada a fazer.`);
    process.exit(0);
}

const { error: erroUpdate } = await db.from('profiles').update({
    role: papel,
    status: 'ativo',
    aprovado_em: new Date().toISOString(),
}).eq('id', perfil.id);

if (erroUpdate) { console.error(erroUpdate.message); process.exit(1); }

await db.from('eventos_admin').insert({
    actor_id: null,
    acao: 'promovido_por_script',
    alvo_id: perfil.id,
    detalhes: { de: { role: perfil.role, status: perfil.status }, para: { role: papel, status: 'ativo' } },
});

console.log(`${perfil.nome} agora é ${papel} ativo.`);
