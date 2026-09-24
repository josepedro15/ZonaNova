import { notFound } from 'next/navigation';
import {
    Alerta, Avatar, Barra, Botao, BotaoLink, BotaoCopiar, CabecalhoPagina, Cartao, Comparacao, EstadoVazio, GraficoLinhas, Icone, Kpi, Numero, Pagina, RotuloSecao, Segmentado, Selo, SerieDias, Sparkline, Tabela, TempoEspera,
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
            <div className="grid gap-5 lg:grid-cols-4">
                <Kpi rotulo="Resposta média" valor={125} unidade=" min"
                     comparacao={<Comparacao delta={84} melhorQuando="menor">3× mais lenta que sua média (41 min)</Comparacao>} />
                <Kpi rotulo="Leads" valor={13} legenda="sua média: 11 por dia" />
                <Kpi heroi rotulo="Nota da equipe" valor={74} legenda="▲ 3 · rede: 71" />
                <Cartao className="flex flex-col gap-2"><TempoEspera ms={12 * 60000} /><TempoEspera ms={42 * 60000} /><TempoEspera ms={192 * 60000} prefixo="Esperando" /></Cartao>
            </div>
            <Cartao variante="heroi" className="flex flex-col gap-3">
                <SerieDias invertida dias={Array.from({ length: 14 }, (_, i) => ({ dia: `2026-09-${String(i + 10).padStart(2, '0')}`, nota: i % 5 === 4 ? null : 55 + i, temRelatorio: i !== 2 }))} />
                <Sparkline invertida rotulo="Série" valores={[58, 60, 55, 57, 52, 50, 47, 45, 40, 36, 33, 30]} />
            </Cartao>
            <div className="grid gap-4 lg:grid-cols-3">
                <Alerta tom="risco" icone="wifi_off" titulo="WhatsApp do Tiago caiu" acao={{ href: '/equipe', rotulo: 'Avisar' }}>ontem às 16h</Alerta>
                <Alerta tom="atencao" icone="relogio" titulo="9 clientes esperando">4 há mais de 2 horas</Alerta>
                <Alerta tom="azul" icone="cadastro" titulo="2 cadastros aguardando" acao={{ href: '/aprovacoes', rotulo: 'Aprovar' }} />
            </div>
            <Segmentado rotulo="Indicador" base="/dev/ui" param="indicador" atual="nota"
                        opcoes={[{ valor: 'nota', rotulo: 'Nota' }, { valor: 'conversao', rotulo: 'Conversões' }, { valor: 'resposta', rotulo: 'Resposta' }]} />
            <Cartao>
                <GraficoLinhas rotulo="Exemplo" rotulosX={['jun', 'set']} formato={(v) => String(Math.round(v))} series={[
                    { id: 'a', nome: 'Noiva do Mar', valores: [72, 74, 76, 78, 81], destaque: 'azul' },
                    { id: 'b', nome: 'Tramandaí', valores: [71, 69, 66, 64, 63], destaque: 'risco' },
                    { id: 'c', nome: 'Capão', valores: [66, 69, 71, 73, 74] },
                    { id: 'd', nome: 'Xangri-lá', valores: [69, 70, 70, null, 70] },
                ]} />
            </Cartao>
            <Tabela titulo="Tabela" colunas={['Cliente', 'Mensagens', 'Situação']} grade="minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)" vazio="Nada."
                    linhas={[
                        { chave: '1', href: '/dev/ui', celulas: ['Carlos Henrique', '214', <Selo key="s" tom="bom">Respondida</Selo>], resumo: 'Carlos Henrique · respondida' },
                        { chave: '2', celulas: ['Tiago Feltrin', '—', 'sem dado'], resumo: 'Tiago Feltrin · sem dado', atenuada: true },
                    ]} />
            <Cartao><BotaoCopiar texto="Márcia, consigo te entregar hoje." /></Cartao>
            <EstadoVazio titulo="Ontem não teve nota">Só houve suporte e conversa social. Isso não conta contra você.</EstadoVazio>
        </Pagina>
    );
}
