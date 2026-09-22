'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { APP_URL } from '@/lib/env';
import { schemaAprovacao, schemaCadastro, schemaLogin, schemaNovaSenha } from '@/lib/validators/auth';
import { podeResolver, type Papel } from '@/lib/aprovacao';
import { dentroDoLimite, ipDoCliente } from '@/lib/limite';

const MUITAS_TENTATIVAS = 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';

export type Resultado = { erro?: string; campo?: string; enviado?: boolean; vencido?: boolean };

export async function entrar(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaLogin.safeParse({
        email: form.get('email'), senha: form.get('senha'),
    });
    if (!parse.success) {
        const p = parse.error.issues[0];
        return { erro: p.message, campo: String(p.path[0]) };
    }

    // Por IP e por e-mail: o primeiro segura quem testa muitas contas, o
    // segundo quem testa muitas senhas de uma conta só. Todo login sai do IP
    // do servidor, então o limite do próprio Supabase valia para a rede toda.
    const ip = await ipDoCliente();
    if (!await dentroDoLimite([
        { chave: `login:ip:${ip}`, max: 20, janelaSegundos: 600 },
        { chave: `login:email:${parse.data.email.toLowerCase()}`, max: 10, janelaSegundos: 600 },
    ])) return { erro: MUITAS_TENTATIVAS };

    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.signInWithPassword({
        email: parse.data.email, password: parse.data.senha,
    });
    // Mensagem única de propósito: distinguir "e-mail não existe" de "senha
    // errada" transforma a tela num jeito de descobrir quem trabalha na rede.
    if (error) return { erro: 'E-mail ou senha incorretos.' };

    // O proxy resolve o destino pelo papel (vendedor/equipe/rede/admin).
    redirect('/');
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

    // Sem confirmação de e-mail, por decisão de produto: a conta nasce
    // confirmada e a pessoa sai do cadastro já logada.
    //
    // Feito aqui, e não desligando "Confirm email" no painel do Supabase, para
    // não depender de uma configuração que ninguém vê no repositório. O
    // `signUp` comum obedece ao painel (e o projeto exige confirmação); o
    // `admin.createUser` com `email_confirm: true` não. De quebra, não manda
    // e-mail nenhum — o limite de poucos e-mails por hora do plano gratuito
    // deixa de travar cadastro.
    //
    // O que se abre mão: provar que o e-mail é da pessoa. Alguém pode se
    // cadastrar com o e-mail de outro. O que segura é a aprovação: a conta nasce
    // `pendente`, não lê nada, e só entra quando um gestor que conhece a pessoa
    // aprova (app/(app)/aprovacoes).
    //
    // `auth.admin.createUser` passa por fora do rate limit e do captcha do
    // Supabase: sem isto, um script criava milhares de contas pendentes e
    // enterrava a fila de aprovação dos gestores.
    const ip = await ipDoCliente();
    if (!await dentroDoLimite([
        { chave: `cadastro:ip:${ip}`, max: 5, janelaSegundos: 3600 },
        { chave: `cadastro:email:${email.toLowerCase()}`, max: 3, janelaSegundos: 3600 },
    ])) return { erro: MUITAS_TENTATIVAS };

    const admin = criarClienteAdmin();
    const { error: erroCriar } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        // O trigger on_auth_user_created lê estes campos e cria o profile já
        // com a unidade escolhida, em status 'pendente'.
        user_metadata: { nome, telefone, unidade_id: unidadeId },
    });

    if (erroCriar) {
        // Também aqui: não confirmamos se o e-mail já existe.
        return { erro: 'Não foi possível criar a conta. Confira os dados e tente de novo.' };
    }

    // A conta foi criada pelo service role, que não abre sessão para ninguém.
    // O login com a senha que a pessoa acabou de escolher é o que grava os
    // cookies.
    const supabase = await criarClienteServidor();
    const { error: erroEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });

    // Conta criada mas sem sessão: raro, e o login resolve.
    if (erroEntrar) redirect('/login');

    redirect('/aguardando-aprovacao');
}

export async function pedirLinkDeSenha(_estado: Resultado, form: FormData): Promise<Resultado> {
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    if (!email.includes('@')) return { erro: 'E-mail inválido.' };

    // Estourado o limite, responde igual e não envia: dizer "limite" só para
    // alguns e-mails voltaria a revelar quem existe. Protege a cota de e-mails
    // do projeto, que é pequena.
    const ip = await ipDoCliente();
    if (!await dentroDoLimite([
        { chave: `senha:ip:${ip}`, max: 5, janelaSegundos: 3600 },
        { chave: `senha:email:${email}`, max: 3, janelaSegundos: 3600 },
    ])) return { enviado: true };

    const supabase = await criarClienteServidor();
    const { error: erroEnvio } = await supabase.auth.resetPasswordForEmail(email, {
        // Passa pelo /auth/callback, que troca o `code` do PKCE por sessão — a
        // mesma troca da confirmação de cadastro, num lugar só. Mandar direto
        // para /nova-senha deixava o `code` sem ninguém para o trocar.
        redirectTo: `${APP_URL}/auth/callback?next=/nova-senha`,
    });

    // Responde igual com e-mail existente ou não: diferenciar aqui
    // transformaria a tela num jeito de descobrir quem trabalha na rede. O
    // erro vai para o log, onde a cota de e-mails esgotada aparece.
    if (erroEnvio) console.error('pedirLinkDeSenha', erroEnvio.message);
    return { enviado: true };
}

/**
 * Grava a senha nova de quem chegou pelo link de recuperação.
 *
 * Não pede a senha antiga porque o link do e-mail É a prova de identidade: a
 * sessão que chega aqui foi criada pelo /auth/callback minutos antes. Quem
 * impede uma sessão roubada e antiga de trocar a senha é a opção "Secure
 * password change" do Supabase, não esta tela — o updateUser funciona a partir
 * de qualquer sessão, com ou sem ela.
 */
export async function definirNovaSenha(_estado: Resultado, form: FormData): Promise<Resultado> {
    const parse = schemaNovaSenha.safeParse({
        senha: form.get('senha'), confirmacao: form.get('confirmacao'),
    });
    if (!parse.success) {
        const p = parse.error.issues[0];
        return { erro: p.message, campo: String(p.path[0]) };
    }

    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    // A sessão do link expirou com a tela aberta: gravar não tem como, e o
    // caminho certo é pedir outro link, não "tente de novo".
    if (!user) return { vencido: true };

    const { error } = await supabase.auth.updateUser({ password: parse.data.senha });
    if (error) {
        if (error.code === 'same_password') {
            return { erro: 'Essa é a senha que você já usa. Escolha outra.', campo: 'senha' };
        }
        if (error.code === 'weak_password') {
            return { erro: 'Senha fraca demais. Use letras e números, com pelo menos 8 caracteres.', campo: 'senha' };
        }
        // `reauthentication_needed` é o "Secure password change" recusando uma
        // sessão velha: um link novo gera sessão nova, então a saída é a mesma.
        if (['session_expired', 'session_not_found', 'reauthentication_needed'].includes(error.code ?? '')) {
            return { vencido: true };
        }
        return { erro: 'Não foi possível salvar a senha agora. Tente de novo.' };
    }

    // "Depois disso você entra direto" (design/Senha.dc.html): a sessão do link
    // continua valendo. Quem ainda está pendente, o proxy leva para a tela de
    // espera — o /dashboard aqui é só o destino de quem já está ativo.
    redirect('/');
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
