'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { APP_URL } from '@/lib/env';
import { schemaAprovacao, schemaCadastro, schemaLogin } from '@/lib/validators/auth';
import { podeResolver, type Papel } from '@/lib/aprovacao';

export type Resultado = { erro?: string; campo?: string; enviado?: boolean };

export async function entrar(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaLogin.safeParse({
        email: form.get('email'), senha: form.get('senha'),
    });
    if (!parse.success) {
        const p = parse.error.issues[0];
        return { erro: p.message, campo: String(p.path[0]) };
    }

    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.signInWithPassword({
        email: parse.data.email, password: parse.data.senha,
    });
    // Mensagem única de propósito: distinguir "e-mail não existe" de "senha
    // errada" transforma a tela num jeito de descobrir quem trabalha na rede.
    if (error) return { erro: 'E-mail ou senha incorretos.' };

    redirect('/dashboard');
}

export async function cadastrar(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaCadastro.safeParse({
        nome: form.get('nome'),
        email: form.get('email'),
        telefone: form.get('telefone'),
        unidadeId: form.get('unidadeId'),
        senha: form.get('senha'),
    });
    if (!parse.success) {
        const p = parse.error.issues[0];
        return { erro: p.message, campo: String(p.path[0]) };
    }
    const { nome, email, telefone, unidadeId, senha } = parse.data;

    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        // O trigger on_auth_user_created lê estes campos e cria o profile já
        // com a unidade escolhida, em status 'pendente'.
        options: { data: { nome, telefone, unidade_id: unidadeId } },
    });

    if (error) {
        // Também aqui: não confirmamos se o e-mail já existe.
        return { erro: 'Não foi possível criar a conta. Confira os dados e tente de novo.' };
    }

    redirect('/aguardando-aprovacao');
}

export async function pedirLinkDeSenha(_estado: Resultado, form: FormData): Promise<Resultado> {
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    if (!email.includes('@')) return { erro: 'E-mail inválido.' };

    const supabase = await criarClienteServidor();
    await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/nova-senha`,
    });

    // Responde igual com e-mail existente ou não, e ignora o erro de propósito:
    // diferenciar aqui transformaria a tela num jeito de descobrir quem
    // trabalha na rede.
    return { enviado: true };
}

export async function sair() {
    const supabase = await criarClienteServidor();
    await supabase.auth.signOut();
    redirect('/login');
}

/**
 * Quem resolve cadastro: carrega o aprovador pela SESSÃO dele (não por um id
 * vindo do formulário) e o candidato pelo service role.
 */
async function contextoDeAprovacao(profileId: string) {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada. Entre de novo.' } as const;

    const { data: perfil } = await supabase
        .from('profiles').select('role, status').eq('id', user.id)
        .maybeSingle<{ role: Papel; status: string }>();

    const { data: minhas } = await supabase
        .from('gestor_unidades').select('unidade_id').eq('gestor_id', user.id);

    const admin = criarClienteAdmin();
    const { data: candidato } = await admin
        .from('profiles').select('id, unidade_id, status').eq('id', profileId)
        .maybeSingle<{ id: string; unidade_id: string | null; status: string }>();

    const quem = perfil
        ? { ...perfil, unidades: (minhas ?? []).map((u) => u.unidade_id as string) }
        : null;

    return { user, quem, candidato, admin } as const;
}

/**
 * Aprovar um cadastro pendente.
 *
 * Usa o service role porque a RLS e o trigger de colunas de poder proíbem
 * mudar `role`/`status` a partir de uma sessão de utilizador — e é isso que
 * impede um gestor de se promover (tests/rls.sql). Por isso a autorização é
 * conferida AQUI, em código (lib/aprovacao.ts), e fica em eventos_admin.
 */
export async function aprovarCadastro(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaAprovacao.safeParse({
        profileId: form.get('profileId'),
        papel: form.get('papel') ?? 'vendedor',
    });
    if (!parse.success) return { erro: 'Pedido inválido.' };
    const { profileId, papel } = parse.data;

    const ctx = await contextoDeAprovacao(profileId);
    if ('erro' in ctx) return { erro: ctx.erro };
    const { user, quem, candidato, admin } = ctx;

    const recusa = podeResolver(quem, candidato, papel);
    if (recusa) return { erro: recusa };

    // `.eq('status', 'pendente')` no próprio UPDATE: dois gestores clicando ao
    // mesmo tempo passam os dois pela conferência acima, mas só um encontra a
    // linha ainda pendente. Sem isto, o segundo sobrescrevia o papel dado pelo
    // primeiro e ficavam dois registos de aprovação para a mesma pessoa.
    const { data: atualizados, error } = await admin.from('profiles').update({
        status: 'ativo',
        role: papel,
        aprovado_por: user.id,
        aprovado_em: new Date().toISOString(),
    }).eq('id', profileId).eq('status', 'pendente').select('id');

    if (error) return { erro: 'Não foi possível aprovar agora. Tente de novo.' };
    if (!atualizados?.length) return { erro: 'Esse cadastro já foi resolvido por outra pessoa.' };

    if (papel === 'gestor') {
        await admin.from('gestor_unidades')
            .upsert({ gestor_id: profileId, unidade_id: candidato!.unidade_id });
    }

    await admin.from('eventos_admin').insert({
        actor_id: user.id,
        acao: 'aprovou_cadastro',
        alvo_id: profileId,
        detalhes: { papel, unidade_id: candidato!.unidade_id },
    });

    revalidatePath('/aprovacoes');
    return { enviado: true };
}

/**
 * Recusar um cadastro. Existia só o caminho do "sim" — quem se cadastrasse
 * sem trabalhar na rede ficava pendente para sempre, na fila do gestor.
 *
 * Recusa vira `inativo`, não apagar: a conta continua em auth.users, e apagar
 * o perfil deixaria uma conta órfã que o proxy tira do app em todo login. Com
 * `inativo` o proxy desloga com mensagem clara, e fica o registo de quem
 * recusou e porquê.
 */
export async function recusarCadastro(_estado: Resultado, form: FormData): Promise<Resultado> {
    const profileId = String(form.get('profileId') ?? '');
    const motivo = String(form.get('motivo') ?? '').trim().slice(0, 300) || null;
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) return { erro: 'Pedido inválido.' };

    const ctx = await contextoDeAprovacao(profileId);
    if ('erro' in ctx) return { erro: ctx.erro };
    const { user, quem, candidato, admin } = ctx;

    const recusa = podeResolver(quem, candidato);
    if (recusa) return { erro: recusa };

    const { data: atualizados, error } = await admin.from('profiles')
        .update({ status: 'inativo' })
        .eq('id', profileId).eq('status', 'pendente').select('id');

    if (error) return { erro: 'Não foi possível recusar agora. Tente de novo.' };
    if (!atualizados?.length) return { erro: 'Esse cadastro já foi resolvido por outra pessoa.' };

    await admin.from('eventos_admin').insert({
        actor_id: user.id,
        acao: 'recusou_cadastro',
        alvo_id: profileId,
        detalhes: { unidade_id: candidato!.unidade_id, motivo },
    });

    revalidatePath('/aprovacoes');
    return { enviado: true };
}
