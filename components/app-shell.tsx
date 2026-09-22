import Link from 'next/link';
import type { Route } from 'next';
import Marca from '@/app/marca';
import { sair } from '@/app/actions/auth';

type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin';

const itens: Record<Papel, { href: string; rotulo: string }[]> = {
    vendedor: [
        { href: '/dashboard', rotulo: 'Meu dia' },
        { href: '/conversas', rotulo: 'Conversas' },
        { href: '/evolucao', rotulo: 'Evolução' },
        { href: '/meu-mec', rotulo: 'Meu MEC' },
        { href: '/perfil', rotulo: 'Perfil' },
    ],
    gestor: [
        { href: '/equipe', rotulo: 'Minha equipe' },
        { href: '/equipe/mec', rotulo: 'Aderência ao MEC' },
        { href: '/conversas', rotulo: 'Conversas' },
        { href: '/aprovacoes', rotulo: 'Aprovações' },
        { href: '/perfil', rotulo: 'Configurações' },
    ],
    supervisor: [
        { href: '/unidades', rotulo: 'Rede' },
        { href: '/mec', rotulo: 'O MEC' },
        { href: '/descobertas', rotulo: 'Descobertas' },
        { href: '/conversas', rotulo: 'Conversas' },
        // Só supervisor e admin aprovam alguém como gestor, e só eles resolvem
        // cadastro de unidade que ainda não tem gestor.
        { href: '/aprovacoes', rotulo: 'Aprovações' },
        { href: '/perfil', rotulo: 'Perfil' },
    ],
    admin: [
        { href: '/admin', rotulo: 'Operação' },
        { href: '/admin/unidades', rotulo: 'Unidades e papéis' },
        { href: '/admin/conexoes', rotulo: 'Conexões' },
        { href: '/admin/eventos', rotulo: 'Registro de ações' },
        { href: '/aprovacoes', rotulo: 'Aprovações' },
        { href: '/perfil', rotulo: 'Perfil' },
    ],
};

export default function AppShell({
    papel, nome, unidade, atual, children,
}: {
    papel: Papel;
    nome: string;
    unidade?: string | null;
    atual: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="hidden min-h-screen flex-col bg-petroleo-esc px-5 py-6 text-papel lg:flex">
                <Marca legenda={papel === 'supervisor' ? 'Supervisão' : papel === 'admin' ? 'Administração' : unidade ?? 'Rede'} invertida />
                <nav className="mt-9 flex flex-col gap-1.5" aria-label="Navegação principal">
                    {itens[papel].map((item) => (
                        <Link key={item.href} href={item.href as Route}
                              className={`rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition ${atual === item.href ? 'bg-white/14 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}>
                            {item.rotulo}
                        </Link>
                    ))}
                </nav>
                <div className="mt-auto border-t border-white/15 pt-4">
                    <p className="text-[13px] font-semibold">{nome}</p>
                    <p className="mt-0.5 text-[11.5px] capitalize text-white/60">{papel}</p>
                    <form action={sair}><button className="mt-3 text-[12px] text-white/70 hover:text-white">Sair</button></form>
                </div>
            </aside>
            <div className="min-w-0">
                <header className="sticky top-0 z-20 border-b border-linha bg-papel/95 px-4 py-3 backdrop-blur lg:hidden">
                    <div className="mx-auto flex max-w-[680px] items-center justify-between">
                        <Marca legenda={unidade ?? 'Rede'} />
                        <Link href={'/perfil' as Route} className="text-[12px] font-semibold text-petroleo">Perfil</Link>
                    </div>
                </header>
                <main>{children}</main>
                <nav className="fixed inset-x-0 bottom-0 z-20 grid border-t border-linha bg-superficie px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
                     style={{ gridTemplateColumns: `repeat(${Math.min(itens[papel].length, 5)}, minmax(0, 1fr))` }}>
                    {itens[papel].slice(0, 5).map((item) => (
                        <Link key={item.href} href={item.href as Route}
                              className={`truncate px-1 py-2 text-center text-[10.5px] font-semibold ${atual === item.href ? 'text-petroleo' : 'text-tinta-3'}`}>
                            {item.rotulo}
                        </Link>
                    ))}
                </nav>
            </div>
        </div>
    );
}
