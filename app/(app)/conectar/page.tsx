import Link from 'next/link';
import Marca from '@/app/marca';
import { sair } from '@/app/actions/auth';
import { statusConexao } from '@/app/actions/conexao';
import { conexaoObrigatoria, inicioPorPapel } from '@/lib/conexao';
import { criarClienteServidor } from '@/lib/supabase/server';
import PainelConexao from './painel';

export default async function Conectar() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    const [inicial, { data: perfil }] = await Promise.all([
        statusConexao(),
        supabase.from('profiles').select('role').eq('id', user?.id ?? '').maybeSingle<{ role: string }>(),
    ]);
    const papel = perfil?.role ?? 'vendedor';
    const opcional = !conexaoObrigatoria(papel);

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10">
            <div className="flex items-center justify-between py-5">
                <Marca legenda="Conectar WhatsApp" />
                <form action={sair}><button className="text-[12.5px] text-tinta-2">Sair</button></form>
            </div>
            {/* Só o vendedor é cobrado pela conexão. Quem gere chega aqui por
                escolha (ou por uma aba aberta antes da promoção) e precisa de
                uma saída para o próprio painel. */}
            {opcional && (
                <p className="mb-5 rounded-card border border-linha bg-superficie px-4 py-3 text-[12.5px] text-tinta-2">
                    Para o seu perfil, conectar o WhatsApp é opcional.{' '}
                    <Link href={inicioPorPapel(papel)} className="font-semibold text-petroleo underline">Ir para o painel</Link>
                </p>
            )}
            <PainelConexao inicial={inicial} />
            {/* O resto do app continua aberto sem WhatsApp: histórico, Meu MEC e
                Perfil não dependem de o número estar no ar agora. */}
            <Link href={opcional ? inicioPorPapel(papel) : '/conversas'} className="mt-6 text-center text-[12.5px] text-tinta-2 underline">
                {opcional ? 'Voltar ao painel' : 'Ver minhas conversas'}
            </Link>
        </main>
    );
}
