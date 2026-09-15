'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { APP_URL } from '@/lib/env';
import { schemaAprovacao, schemaCadastro, schemaLogin } from '@/lib/validators/auth';

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
 * Aprovar um cadastro pendente.
 *
 * Usa o service role porque a RLS e o trigger de colunas de poder proíbem
 * mudar `role`/`status` a partir de uma sessão de utilizador — e é isso que
 * impede um gestor de se promover (tests/rls.sql). Por isso a autorização é
 * conferida AQUI, em código, e a ação fica registada em eventos_admin.
 */
export async function aprovarCadastro(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaAprovacao.safeParse({
        profileId: form.get('profileId'),
        papel: form.get('papel') ?? 'vendedor',
    });
    if (!parse.success) return { erro: 'Pedido inválido.' };
    const { profileId, papel } = parse.data;

    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: 'Sessão expirada. Entre de novo.' };

    const { data: quemAprova } = await supabase
        .from('profiles').select('role, status').eq('id', user.id).maybeSingle();

    if (!quemAprova || quemAprova.status !== 'ativo'
        || !['gestor', 'supervisor', 'admin'].includes(quemAprova.role)) {
        return { erro: 'Você não tem permissão para aprovar cadastros.' };
    }

    const admin = criarClienteAdmin();
    const { data: candidato } = await admin
        .from('profiles').select('id, unidade_id, status').eq('id', profileId).maybeSingle();

    if (!candidato) return { erro: 'Cadastro não encontrado.' };
    if (candidato.status !== 'pendente') return { erro: 'Esse cadastro já foi resolvido.' };
    if (!candidato.unidade_id) return { erro: 'O cadastro não tem unidade. Peça para a pessoa escolher.' };

    // Um gestor só aprova para as unidades dele. O supervisor aprova em qualquer.
    if (quemAprova.role === 'gestor') {
        const { data: minhas } = await supabase
            .from('gestor_unidades').select('unidade_id').eq('gestor_id', user.id);
        const permitidas = (minhas ?? []).map((u) => u.unidade_id);
        if (!permitidas.includes(candidato.unidade_id)) {
            return { erro: 'Esse cadastro é de outra unidade.' };
        }
    }
    // Só o supervisor cria outro gestor.
    if (papel === 'gestor' && !['supervisor', 'admin'].includes(quemAprova.role)) {
        return { erro: 'Só o supervisor pode aprovar alguém como gestor.' };
    }

    const { error } = await admin.from('profiles').update({
        status: 'ativo',
        role: papel,
        aprovado_por: user.id,
        aprovado_em: new Date().toISOString(),
    }).eq('id', profileId);

    if (error) return { erro: 'Não foi possível aprovar agora. Tente de novo.' };

    if (papel === 'gestor') {
        await admin.from('gestor_unidades')
            .upsert({ gestor_id: profileId, unidade_id: candidato.unidade_id });
    }

    await admin.from('eventos_admin').insert({
        actor_id: user.id,
        acao: 'aprovou_cadastro',
        alvo_id: profileId,
        detalhes: { papel, unidade_id: candidato.unidade_id },
    });

    revalidatePath('/aprovacoes');
    return {};
}
