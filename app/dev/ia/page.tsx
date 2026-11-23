import { notFound } from 'next/navigation';
import { CabecalhoPagina, Pagina, Shell } from '@/components/ui';
import { Chat, type Turno } from '@/app/(app)/ia/chat';
import { CardMonitoramento } from '@/components/monitoramentos';
import { resumoDoCard, type ClienteDaBase, type Monitoramento } from '@/lib/monitoramento';

// Conversar com a IA e o card do monitoramento com dados de exemplo, para
// conferir no browser sem login. Não existe em produção. `?vazio=1` abre o chat
// sem conversa; `?vendedor=1` mostra o card como o vendedor vê.
const MON: Monitoramento = {
    id: '00000000-0000-4000-8000-000000000001', titulo: 'Ações de Natal',
    criterio: 'Conta quando o vendedor manda ao cliente o encarte ou o PDF de Natal, ou fala da oferta de Natal na conversa. Só desejar "Feliz Natal" não conta.',
    palavras: ['natal', 'natalino', 'encarte', 'fim de ano'], unidade_id: null, inicio: '2026-12-01', fim: '2026-12-24',
    criado_por: 'u0', created_at: '2026-11-23T12:00:00Z', encerrado_em: null, conferido_ate: null,
};
const VENDEDORES = [['v1', 'Thamires ZN'], ['v2', 'Rafael Muller'], ['v3', 'Ana Paula Rocha'], ['v4', 'Vanderlei'], ['v5', 'Taliane']] as const;
const CLIENTES = ['Construtora Lima', 'Ana Paula · porcelanato', 'Rogério', 'Fernanda Tintas', 'Marcos obra praia', 'Dona Cleusa', 'Jair', 'Paula Reforma', 'Sérgio', 'Vilmar'];

const TURNOS: Turno[] = [
    { papel: 'usuario', texto: 'A partir de 1º de dezembro, monitora se os vendedores estão mandando as ações de Natal para os clientes.' },
    {
        papel: 'ia',
        texto: 'Testei as palavras na Black Friday (17 a 21/11): **674 conversas** de **24 vendedores**.\n\nExemplos:\n- [Tiele · Lucas](/conversas/00000000-0000-4000-8000-000000000010): áudio explicando o encarte e os 25%. **Conta.**\n- [Vendas Tramandaí · cs casas](/conversas/00000000-0000-4000-8000-000000000011): "Nossas ofertas de Black Friday". **Conta.**\n- [Ana Paula · Valdomiro](/conversas/00000000-0000-4000-8000-000000000012): "Convide os clientes para vir sexta!" parece recado para colega. **Não contaria.**\n\nO monitoramento **ainda não está valendo**: confira e clique em "Começar a monitorar".',
        propostas: [{ titulo: MON.titulo, criterio: MON.criterio, palavras: MON.palavras, inicio: MON.inicio, fim: MON.fim, unidade_id: null }],
    },
];

export default async function VitrineIa({ searchParams }: { searchParams: Promise<{ vazio?: string; vendedor?: string }> }) {
    if (process.env.NODE_ENV === 'production') notFound();
    const { vazio, vendedor } = await searchParams;
    const base: ClienteDaBase[] = Array.from({ length: 46 }, (_, i) => ({
        conversa_id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
        user_id: VENDEDORES[i % (vendedor ? 1 : 5)][0], cliente_nome: `${CLIENTES[i % CLIENTES.length]}${i >= 10 ? ` ${i}` : ''}`,
        cliente_telefone: '5551999990000', ultima_mensagem_em: new Date(Date.parse('2026-12-06T12:00:00Z') - (i % 20) * 86_400_000).toISOString(),
        potencial_venda: ['alto', 'medio', 'baixo'][i % 3],
    }));
    const marcas = base.filter((_, i) => (i * 7) % 10 < 6).map((b) => ({ conversa_id: b.conversa_id, user_id: b.user_id, enviada_em: '2026-12-03T12:00:00Z', trecho: 'encarte' }));
    const resumo = resumoDoCard(base, marcas, new Map(VENDEDORES.map(([id, nome]) => [id, nome])));
    return (
        <Shell papel={vendedor ? 'vendedor' : 'supervisor'} nome="Silas Exemplo" unidade={null} atual={vendedor ? '/dashboard' : '/ia'}>
            <Pagina>
                <CabecalhoPagina sobre="Pergunte sobre as conversas ou peça para acompanhar uma ação da rede" titulo="Conversar com a IA" />
                {!vendedor && <Chat nome="Silas" papel="supervisor" inicial={vazio ? [] : TURNOS} />}
                <div className="grid gap-4 xl:grid-cols-2">
                    <CardMonitoramento m={MON} resumo={resumo} hoje="2026-12-06" modo={vendedor ? 'vendedor' : 'gestao'} podeEncerrar={!vendedor} />
                </div>
            </Pagina>
        </Shell>
    );
}
