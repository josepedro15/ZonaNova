import Marca from '@/app/marca';
import { statusConexao } from '@/app/actions/conexao';
import PainelConexao from './painel';

export default async function Conectar() {
    const inicial = await statusConexao();

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-10">
            <div className="py-5"><Marca legenda="Conectar WhatsApp" /></div>
            <PainelConexao inicial={inicial} />
        </main>
    );
}
