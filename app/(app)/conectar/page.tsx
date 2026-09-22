import Link from 'next/link';
import Marca from '@/app/marca';
import { sair } from '@/app/actions/auth';
import { statusConexao } from '@/app/actions/conexao';
import PainelConexao from './painel';

export default async function Conectar() {
    const inicial = await statusConexao();

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10">
            <div className="flex items-center justify-between py-5">
                <Marca legenda="Conectar WhatsApp" />
                <form action={sair}><button className="text-[12.5px] text-tinta-2">Sair</button></form>
            </div>
            <PainelConexao inicial={inicial} />
            {/* O resto do app continua aberto sem WhatsApp: histórico, Meu MEC e
                Perfil não dependem de o número estar no ar agora. */}
            <Link href="/conversas" className="mt-6 text-center text-[12.5px] text-tinta-2 underline">Ver minhas conversas</Link>
        </main>
    );
}
