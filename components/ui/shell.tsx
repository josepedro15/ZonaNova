import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import logo from '@/public/marca/logo.png';
import logoBranco from '@/public/marca/logo-branco.png';
import { sair } from '@/app/actions/auth';
import { iniciais } from '@/lib/visual';
import { Icone, type NomeIcone } from './icone';
import { Selo } from './selo';

export type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin';
type Item = { href: string; rotulo: string; curto?: string; icone: NomeIcone };

const ITENS: Record<Papel, Item[]> = {
    vendedor: [
        { href: '/dashboard', rotulo: 'Meu dia', icone: 'casa' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        { href: '/evolucao', rotulo: 'Evolução', icone: 'tendencia' },
        { href: '/meu-mec', rotulo: 'Meu MEC', icone: 'mec' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
    gestor: [
        { href: '/equipe', rotulo: 'Minha equipe', curto: 'Equipe', icone: 'equipe' },
        { href: '/equipe/mec', rotulo: 'Aderência ao MEC', curto: 'MEC', icone: 'mec' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Configurações', curto: 'Ajustes', icone: 'engrenagem' },
    ],
    supervisor: [
        { href: '/unidades', rotulo: 'Rede', icone: 'rede' },
        { href: '/mec', rotulo: 'O MEC', icone: 'mec' },
        { href: '/descobertas', rotulo: 'Descobertas', icone: 'lampada' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        // Só supervisor e admin aprovam alguém como gestor, e só eles resolvem
        // cadastro de unidade que ainda não tem gestor.
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
    admin: [
        { href: '/admin', rotulo: 'Operação', icone: 'operacao' },
        { href: '/admin/unidades', rotulo: 'Unidades e papéis', curto: 'Unidades', icone: 'equipe' },
        { href: '/admin/conexoes', rotulo: 'Conexões', icone: 'wifi' },
        { href: '/admin/eventos', rotulo: 'Registro de ações', curto: 'Registro', icone: 'lista' },
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
};

const NOME_PAPEL: Record<Papel, string> = { vendedor: 'Vendedor', gestor: 'Gestão', supervisor: 'Supervisão', admin: 'Administração' };

export default function Shell({ papel, nome, unidade, atual, conexao, pendentes = 0, children }: {
    papel: Papel; nome: string; unidade?: string | null; atual: string;
    conexao?: 'conectada' | 'fora' | null; pendentes?: number; children: ReactNode;
}) {
    const itens = ITENS[papel];
    const legenda = [NOME_PAPEL[papel], unidade].filter(Boolean).join(' · ');
    const badge = (href: string) => href === '/aprovacoes' && pendentes > 0;

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
            <aside className="sticky top-0 hidden h-screen flex-col gap-9 bg-azul px-[18px] pb-6 pt-[30px] text-white lg:flex">
                <Link href="/" className="px-2"><Image src={logoBranco} alt="Redemac Zona Nova" width={150} priority /></Link>
                <nav aria-label="Navegação principal" className="flex flex-col gap-1">
                    {itens.map((item) => {
                        const ativo = atual === item.href;
                        return (
                            <Link key={item.href} href={item.href as Route} aria-current={ativo ? 'page' : undefined}
                                  className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition ${ativo ? 'bg-white/13 font-semibold text-white' : 'font-medium text-white/75 hover:bg-white/8 hover:text-white'}`}>
                                <Icone nome={item.icone} />
                                {item.rotulo}
                                {badge(item.href) ? (
                                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11.5px] font-bold text-azul">{pendentes}</span>
                                ) : ativo && (
                                    <span aria-hidden="true" className="ml-auto size-[7px] rotate-45 rounded-[1.5px] bg-verde-marca" />
                                )}
                            </Link>
                        );
                    })}
                </nav>
                <div className="mt-auto flex flex-col gap-3.5 border-t border-white/15 px-2 pt-[18px]">
                    <div className="flex items-center gap-2.5">
                        <span className="display flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-[13px] font-bold">{iniciais(nome) ?? '·'}</span>
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[13.5px] font-semibold">{nome}</span>
                            <span className="truncate text-xs text-white/65">{legenda}</span>
                        </div>
                    </div>
                    {conexao && (
                        <span className="flex items-center gap-2 text-[12.5px] text-white/85">
                            <span className={`size-2 rounded-full ${conexao === 'conectada' ? 'bg-bom-claro' : 'bg-risco'}`} aria-hidden="true" />
                            {conexao === 'conectada' ? 'WhatsApp conectado' : 'WhatsApp fora do ar'}
                        </span>
                    )}
                    <form action={sair}>
                        <button type="submit" className="flex min-h-11 items-center gap-2 text-[13px] text-white/75 hover:text-white">
                            <Icone nome="sair" tamanho={16} />Sair
                        </button>
                    </form>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-linha bg-superficie/95 px-4 py-2 backdrop-blur lg:hidden">
                    <Link href="/"><Image src={logo} alt="Redemac Zona Nova" width={92} priority /></Link>
                    <div className="flex items-center gap-1">
                        {conexao && <Selo tom={conexao === 'conectada' ? 'bom' : 'risco'} ponto>{conexao === 'conectada' ? 'Conectado' : 'Fora do ar'}</Selo>}
                        <Link href="/perfil" aria-label="Perfil" className="flex size-11 items-center justify-center text-azul"><Icone nome="pessoa" /></Link>
                        <form action={sair}>
                            <button type="submit" aria-label="Sair" className="flex size-11 items-center justify-center text-tinta-2"><Icone nome="sair" /></button>
                        </form>
                    </div>
                </header>
                <main className="pb-24 lg:pb-0">{children}</main>
                <nav aria-label="Navegação inferior"
                     className="fixed inset-x-0 bottom-0 z-20 grid border-t border-linha bg-superficie px-1.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
                     style={{ gridTemplateColumns: `repeat(${Math.min(itens.length, 5)}, minmax(0, 1fr))` }}>
                    {itens.slice(0, 5).map((item) => {
                        const ativo = atual === item.href;
                        return (
                            <Link key={item.href} href={item.href as Route} aria-current={ativo ? 'page' : undefined}
                                  className={`relative flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] ${ativo ? 'font-bold text-azul' : 'font-semibold text-tinta-3'}`}>
                                <Icone nome={item.icone} tamanho={22} />
                                <span className="max-w-full truncate">{item.curto ?? item.rotulo}</span>
                                {badge(item.href) && <span className="absolute right-[22%] top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-risco px-1 text-[10px] font-bold text-white">{pendentes}</span>}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
