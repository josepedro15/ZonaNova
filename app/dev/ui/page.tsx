import { notFound } from 'next/navigation';
import {
    Avatar, Barra, Botao, BotaoLink, CabecalhoPagina, Cartao, EstadoVazio, Icone, Numero, Pagina, RotuloSecao, Selo,
} from '@/components/ui';

// Vitrine dos componentes para conferir no browser. Não existe em produção.
export default function VitrineUi() {
    if (process.env.NODE_ENV === 'production') notFound();
    return (
        <Pagina>
            <CabecalhoPagina sobre="Só em desenvolvimento" titulo="Componentes" acoes={<Botao>Primário</Botao>} />
            <RotuloSecao complemento="complemento">Rótulo de seção</RotuloSecao>
            <div className="grid gap-5 lg:grid-cols-3">
                <Cartao className="flex flex-col gap-3">
                    <Numero valor={72} unidade="/100" tamanho="xl" />
                    <Numero valor={125} unidade=" min" />
                    <div className="flex flex-wrap gap-2">
                        <Selo tom="bom" ponto>Conectado</Selo><Selo tom="risco" ponto>Fora do ar</Selo>
                        <Selo tom="atencao">42min</Selo><Selo>12min</Selo><Selo tom="azul">Negociação</Selo>
                    </div>
                </Cartao>
                <Cartao variante="heroi" className="flex flex-col gap-3"><span>Cartão herói</span><Numero valor={71} tamanho="xl" /></Cartao>
                <Cartao variante="suave">Cartão suave (treino)</Cartao>
                <Cartao className="flex flex-col gap-3">
                    <Barra pct={100} rotulo="Acolhida" /><Barra pct={29} tom="risco" rotulo="Sondagem" />
                    <Barra pct={40} tom="atencao" rotulo="Solução" /><Barra pct={null} rotulo="Acompanhamento" />
                </Cartao>
                <Cartao className="flex items-center gap-3"><Avatar nome="Marcos Teixeira" /><Avatar nome={null} /><Avatar nome="Nexo" tamanho={48} /></Cartao>
                <Cartao className="flex flex-col items-start gap-3">
                    <Botao variante="secundario">Secundário</Botao>
                    <BotaoLink href="https://wa.me/5551999999999" externo variante="secundario">Responder</BotaoLink>
                    <Botao variante="texto">Texto <Icone nome="seta_direita" tamanho={14} /></Botao>
                </Cartao>
            </div>
            <EstadoVazio titulo="Ontem não teve nota">Só houve suporte e conversa social. Isso não conta contra você.</EstadoVazio>
        </Pagina>
    );
}
