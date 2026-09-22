'use server';
import{revalidatePath}from'next/cache';import{criarClienteServidor}from'@/lib/supabase/server';import{criarClienteAdmin}from'@/lib/supabase/admin';import{dataValida,janelaDoDia}from'@/lib/analise';import{conversasComMensagemNoDia}from'@/lib/fechamento';import{desligarWhatsappDe}from'@/lib/desligar';
async function operador(){const s=await criarClienteServidor();const{data:{user}}=await s.auth.getUser();if(!user)return null;const{data:p}=await s.from('profiles').select('role,status').eq('id',user.id).maybeSingle<{role:string;status:string}>();if(!p||p.status!=='ativo'||!['admin','supervisor'].includes(p.role))return null;return{user,admin:criarClienteAdmin(),role:p.role}}
export async function repetirItem(form:FormData){const id=String(form.get('id')??'');const ctx=await operador();if(!ctx||!/^[0-9a-f-]{36}$/i.test(id))return;await ctx.admin.from('fila_processamento').update({status:'pendente',tentativas:0,ultimo_erro:null,processado_em:null,proxima_tentativa_em:new Date().toISOString()}).eq('id',id);await ctx.admin.from('eventos_admin').insert({actor_id:ctx.user.id,acao:'repetiu_item_fila',alvo_id:id});revalidatePath('/admin')}
// Só admin: apaga as análises do dia da rede inteira e paga todas de novo.
export async function reprocessarDia(form:FormData){const dataRef=String(form.get('data')??'');const ctx=await operador();if(!ctx||ctx.role!=='admin'||!dataValida(dataRef))return;const{inicio,fim}=janelaDoDia(dataRef);const ids=await conversasComMensagemNoDia(ctx.admin,inicio,fim);if(ids.length){await ctx.admin.from('fila_processamento').delete().eq('data_ref',dataRef).neq('tipo','transcricao');await ctx.admin.from('aderencia_conversa').delete().eq('data_ref',dataRef);await ctx.admin.from('aderencia_diaria').delete().eq('data_ref',dataRef);await ctx.admin.from('analises_conversa').delete().eq('data_ref',dataRef);await ctx.admin.from('relatorios_diarios').delete().eq('data_ref',dataRef);await ctx.admin.from('relatorios_unidade').delete().eq('data_ref',dataRef);await ctx.admin.from('relatorios_rede').delete().eq('data_ref',dataRef);await ctx.admin.from('fila_processamento').insert(ids.map(id=>({tipo:'analise_conversa',referencia_id:id,data_ref:dataRef})));}await ctx.admin.from('eventos_admin').insert({actor_id:ctx.user.id,acao:'reprocessou_dia',detalhes:{data_ref:dataRef,conversas:ids.length}});revalidatePath('/admin')}
export async function alterarPessoa(form:FormData){
    const profileId=String(form.get('profileId')??'');const role=String(form.get('role')??'');const status=String(form.get('status')??'');const unidadeId=String(form.get('unidadeId')??'')||null;
    const ctx=await operador();
    if(!ctx||ctx.role!=='admin'||!/^[0-9a-f-]{36}$/i.test(profileId)||(unidadeId!==null&&!/^[0-9a-f-]{36}$/i.test(unidadeId))||!['vendedor','gestor','supervisor','admin'].includes(role)||!['ativo','inativo','pendente'].includes(status))return;
    const{data:antes}=await ctx.admin.from('profiles').select('role,status,unidade_id').eq('id',profileId).maybeSingle<{role:string;status:string;unidade_id:string|null}>();
    if(!antes)return;
    // Só segue para os efeitos colaterais se a mudança em si entrou: um
    // vendedor sem unidade, por exemplo, é recusado pelo check da tabela, e
    // antes disso já se tinha apagado o gestor_unidades e registrado no log uma
    // mudança que não aconteceu.
    const{error}=await ctx.admin.from('profiles').update({role,status,unidade_id:unidadeId}).eq('id',profileId);
    if(error){console.error('alterarPessoa',error);return;}
    // gestor_unidades é o que a RLS usa para o gestor enxergar. Sem ajustar,
    // o gestor movido seguia lendo a unidade antiga, e o ex-gestor seguia
    // lendo a equipe que não é mais dele. Só sai a unidade que o perfil
    // deixou: as outras que ele gerencia continuam.
    if(role!=='gestor')await ctx.admin.from('gestor_unidades').delete().eq('gestor_id',profileId);
    else{if(antes.unidade_id&&antes.unidade_id!==unidadeId)await ctx.admin.from('gestor_unidades').delete().eq('gestor_id',profileId).eq('unidade_id',antes.unidade_id);if(unidadeId)await ctx.admin.from('gestor_unidades').upsert({gestor_id:profileId,unidade_id:unidadeId});}
    // A conexão carimba a unidade das conversas novas. Conversas antigas não
    // mudam: o histórico pertence a onde aconteceu.
    if(unidadeId&&antes.unidade_id!==unidadeId)await ctx.admin.from('conexoes_whatsapp').update({unidade_id:unidadeId,updated_at:new Date().toISOString()}).eq('user_id',profileId);
    // Quem deixa de estar ativo sai do monitoramento na hora: o WhatsApp dele
    // é desligado na UAZAPI. A ingestão também descarta o que ainda chegar
    // (lib/uazapi/ingestao.ts), para o caso de a UAZAPI estar fora agora.
    let desligou:boolean|null=null;
    if(status!=='ativo'&&antes.status==='ativo'){try{await desligarWhatsappDe(profileId,ctx.user.id);desligou=true}catch(e){console.error('alterarPessoa: desligar WhatsApp',e);desligou=false}}
    await ctx.admin.from('eventos_admin').insert({actor_id:ctx.user.id,acao:'alterou_pessoa',alvo_id:profileId,detalhes:{role,status,unidade_id:unidadeId,antes,...(desligou===null?{}:{whatsapp_desligado:desligou})}});
    revalidatePath('/admin/unidades')}
export async function avaliarDescoberta(form:FormData){const id=String(form.get('id')??'');const status=String(form.get('status')??'');const nota=String(form.get('nota')??'').trim().slice(0,1000)||null;const ctx=await operador();if(!ctx||!/^[0-9a-f-]{36}$/i.test(id)||!['em_analise','aprovada','descartada'].includes(status))return;await ctx.admin.from('descobertas').update({status,nota_avaliacao:nota,avaliada_por:ctx.user.id,avaliada_em:new Date().toISOString()}).eq('id',id);revalidatePath('/descobertas')}
export async function criarUnidade(form:FormData){const nome=String(form.get('nome')??'').trim().slice(0,120);const cidade=String(form.get('cidade')??'').trim().slice(0,120)||null;const uf=String(form.get('uf')??'').trim().toUpperCase().slice(0,2)||null;const ctx=await operador();if(!ctx||ctx.role!=='admin'||!nome|| (uf!==null&&!/^[A-Z]{2}$/.test(uf)))return;const{data}=await ctx.admin.from('unidades').insert({nome,cidade,uf}).select('id').single();await ctx.admin.from('eventos_admin').insert({actor_id:ctx.user.id,acao:'criou_unidade',alvo_id:data?.id,detalhes:{nome,cidade,uf}});revalidatePath('/admin/unidades')}
export async function revisarContestacao(form:FormData){const id=String(form.get('id')??'');const veredito=String(form.get('veredito')??'');const ctx=await operador();if(!ctx||!/^[0-9a-f-]{36}$/i.test(id)||!['procedente','improcedente'].includes(veredito)||!['supervisor','admin'].includes(ctx.role))return;await ctx.admin.from('aderencia_contestacoes').update({veredito,revisado_por:ctx.user.id,revisado_em:new Date().toISOString()}).eq('id',id).eq('veredito','pendente');await ctx.admin.from('eventos_admin').insert({actor_id:ctx.user.id,acao:'revisou_contestacao',alvo_id:id,detalhes:{veredito}});revalidatePath('/mec')}
