import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

// /auth/callback tem de ser pública: quem chega do link do e-mail ainda NÃO
// tem sessão — é essa rota que a cria. Protegida, o proxy mandava para o login
// antes de o código ser trocado, e a confirmação nunca abria sessão.
const ROTAS_PUBLICAS = ['/login', '/cadastro', '/recuperar-senha', '/auth/callback'];
const ROTAS_DE_GESTAO = ['/equipe', '/aprovacoes'];
const ROTAS_DE_REDE = ['/unidades', '/mec'];
const ROTAS_DE_ADMIN = ['/admin'];

function comecaCom(caminho: string, prefixos: string[]) {
    return prefixos.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/**
 * O proxy só melhora a NAVEGAÇÃO: manda a pessoa para a tela certa em vez
 * de a deixar num painel vazio. A autorização de verdade é a RLS — se este
 * ficheiro sumisse, ninguém passaria a ler dado de outra unidade.
 * Ver tests/rls.sql.
 */
export async function proxy(request: NextRequest) {
    let resposta = NextResponse.next({ request });

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (lista) => {
                lista.forEach(({ name, value }) => request.cookies.set(name, value));
                resposta = NextResponse.next({ request });
                lista.forEach(({ name, value, options }) =>
                    resposta.cookies.set(name, value, options));
            },
        },
    });

    const { data: { user } } = await supabase.auth.getUser();
    const caminho = request.nextUrl.pathname;
    const publica = comecaCom(caminho, ROTAS_PUBLICAS);

    if (!user) {
        if (publica) return resposta;
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const { data: perfil } = await supabase
        .from('profiles')
        .select('role, status, unidade_id')
        .eq('id', user.id)
        .maybeSingle();

    // Conta sem perfil: estado impossível se o trigger correu. Desloga em vez
    // de deixar a pessoa num app meio funcional.
    if (!perfil) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?erro=sem-perfil', request.url));
    }

    if (perfil.status === 'inativo') {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?erro=desativado', request.url));
    }

    if (perfil.status === 'pendente') {
        return caminho === '/aguardando-aprovacao'
            ? resposta
            : NextResponse.redirect(new URL('/aguardando-aprovacao', request.url));
    }

    // Ativo: as telas de entrada e a de espera já não servem.
    if (publica || caminho === '/aguardando-aprovacao' || caminho === '/') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    const papel = perfil.role as string;

    // Vendedor ativo sem WhatsApp ligado não tem o que ver no dashboard: sem
    // conexão não entra mensagem, sem mensagem não há análise. Mandar para
    // /conectar é o doc 4 §4.3 — e continua sendo só navegação, não barreira.
    if (papel === 'vendedor' && caminho !== '/conectar') {
        const { data: conexao } = await supabase
            .from('vw_conexoes_status').select('status')
            .eq('user_id', user.id).maybeSingle();
        if (!conexao || conexao.status === 'desconectada') {
            return NextResponse.redirect(new URL('/conectar', request.url));
        }
    }

    if (comecaCom(caminho, ROTAS_DE_ADMIN) && papel !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    if (comecaCom(caminho, ROTAS_DE_REDE) && !['supervisor', 'admin'].includes(papel)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    if (comecaCom(caminho, ROTAS_DE_GESTAO) && !['gestor', 'supervisor', 'admin'].includes(papel)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return resposta;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhook|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
