import Link from 'next/link';
import Marca from '@/app/marca';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { DIAS_PARA_AVISO, quandoPediu } from '@/lib/aprovacao';
import Decisao from './decisao';

type Pendente = {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    created_at: string;
    unidade_id: string | null;
    unidades: { nome: string } | null;
};

const iniciais = (nome: string) =>
    nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export default async function Aprovacoes({
    searchParams,
}: {
    searchParams: Promise<{ id?: string }>;
}) {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: eu } = await supabase
        .from('profiles').select('role, unidades!profiles_unidade_id_fkey(nome)').eq('id', user!.id)
        .maybeSingle<{ role: string; unidades: { nome: string } | null }>();

    // A lista vem pela SESSÃO do gestor, não pelo service role: a RLS já
    // entrega só os pendentes das unidades dele (zn_unidades_visiveis). Se a
    // tela pedisse mais do que devia, o banco não entregaria.
    const { data } = await supabase
        .from('profiles')
        .select('id, nome, email, telefone, created_at, unidade_id, unidades!profiles_unidade_id_fkey(nome)')
        .eq('status', 'pendente')
        .order('created_at', { ascending: true });
    const pendentes = (data ?? []) as unknown as Pendente[];

    const { id } = await searchParams;
    const atual = pendentes.find((p) => p.id === id) ?? pendentes[0];

    // "Número não está cadastrado em outra unidade" — o design deixa como
    // conferência manual, mas isto o sistema sabe responder. Consulta pelo
    // service role porque o gestor não enxerga perfis de outra unidade; só se
    // devolve a CONTAGEM, nunca de quem é o número.
    let numeroRepetido = 0;
    if (atual?.telefone) {
        const { count } = await criarClienteAdmin()
            .from('profiles').select('id', { count: 'exact', head: true })
            .eq('telefone', atual.telefone).neq('id', atual.id);
        numeroRepetido = count ?? 0;
    }

    const maisAntigo = pendentes[0] ? quandoPediu(new Date(pendentes[0].created_at)) : null;

    return (
        <main className="mx-auto w-full max-w-[1180px] px-[18px] pb-12">
            <header className="flex items-center justify-between border-b border-linha py-3.5">
                <Marca legenda={eu?.role === 'gestor' ? `Gestão · ${eu.unidades?.nome ?? ''}` : 'Rede'} />
                <Link href="/" className="text-[13px] text-tinta-3">Voltar</Link>
            </header>

            <h1 className="display mt-6 text-[26px] font-semibold">Quem quer entrar na sua unidade</h1>
            <p className="mt-1 text-sm text-tinta-2">
                Enquanto você não aprova, nada do WhatsApp dessa pessoa é lido.
            </p>

            {pendentes.length === 0 ? (
                <section className="mt-8 rounded-lg border border-linha bg-superficie p-8 text-center">
                    <p className="display text-[17px] font-semibold">Ninguém esperando</p>
                    <p className="mt-1.5 text-[13px] text-tinta-3">
                        Quando alguém se cadastrar na sua unidade, aparece aqui.
                    </p>
                </section>
            ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-[300px_1fr]">
                    <nav aria-label="Pendentes" className="flex flex-col gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-tinta-3">
                            PENDENTES · {pendentes.length}
                        </span>
                        {pendentes.map((p) => {
                            const q = quandoPediu(new Date(p.created_at));
                            const ativo = p.id === atual?.id;
                            return (
                                <Link key={p.id} href={`/aprovacoes?id=${p.id}`}
                                      aria-current={ativo ? 'true' : undefined}
                                      className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-3 ${
                                          ativo ? 'border-petroleo bg-petroleo-sof' : 'border-linha bg-superficie'}`}>
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-papel-2 text-[12px] font-semibold text-tinta-2">
                                        {iniciais(p.nome)}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-semibold">{p.nome}</span>
                                        <span className="text-[12px] text-tinta-3">{q.texto}</span>
                                    </span>
                                    {q.dias > 0 && (
                                        <span className={`shrink-0 text-[11.5px] font-semibold ${
                                            q.dias >= DIAS_PARA_AVISO ? 'text-ambar-texto' : 'text-tinta-3'}`}>
                                            {q.dias} {q.dias === 1 ? 'dia' : 'dias'}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}

                        {maisAntigo && maisAntigo.dias >= DIAS_PARA_AVISO && (
                            <p className="mt-1 rounded-[10px] border border-linha-quente bg-ambar-sof px-3.5 py-3 text-[12.5px] leading-relaxed text-ambar-texto">
                                {pendentes[0]!.nome.split(' ')[0]} está esperando há {maisAntigo.dias} dias.
                                Cada dia parado é um dia de conversas que ninguém está analisando.
                            </p>
                        )}
                    </nav>

                    {atual && (
                        <section className="rounded-lg border border-linha bg-superficie p-5 md:p-6">
                            <div className="flex items-center gap-3">
                                <span className="flex size-11 items-center justify-center rounded-full bg-papel-2 text-sm font-semibold text-tinta-2">
                                    {iniciais(atual.nome)}
                                </span>
                                <div>
                                    <p className="display text-[19px] font-semibold">{atual.nome}</p>
                                    <p className="text-[12.5px] text-tinta-3">
                                        {quandoPediu(new Date(atual.created_at)).texto.replace('pediu', 'Pedido feito')}
                                    </p>
                                </div>
                            </div>

                            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                                <Campo rotulo="E-MAIL">{atual.email}</Campo>
                                <Campo rotulo="WHATSAPP COMERCIAL">{atual.telefone ?? '—'}</Campo>
                                <Campo rotulo="UNIDADE QUE ESCOLHEU">{atual.unidades?.nome ?? 'nenhuma'}</Campo>
                            </dl>

                            <div className="mt-6 rounded-[12px] bg-papel-2 p-4">
                                <p className="text-[11px] font-semibold tracking-wide text-tinta-3">
                                    O QUE CONFERIR ANTES DE APROVAR
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-tinta-2">
                                    <li>O e-mail é da Zona Nova, ou de alguém que você reconhece</li>
                                    <li className={numeroRepetido ? 'font-semibold text-vermelho-texto' : ''}>
                                        {numeroRepetido
                                            ? `Este número já está em ${numeroRepetido} outro cadastro — confira antes`
                                            : 'Número não aparece em nenhum outro cadastro ✓'}
                                    </li>
                                    <li>Você conhece essa pessoa? O sistema não sabe — a conferência é sua.</li>
                                </ul>
                            </div>

                            <div className="mt-5 text-[13px] leading-relaxed text-tinta-2">
                                <p className="font-semibold text-tinta">Aprovando, {atual.nome.split(' ')[0]}:</p>
                                <ul className="mt-1 list-disc pl-5">
                                    <li>conecta o WhatsApp e passa a ser analisada</li>
                                    <li>entra na média e no ranking da {atual.unidades?.nome ?? 'unidade'}</li>
                                    <li>vê só os próprios dados</li>
                                </ul>
                            </div>

                            <Decisao key={atual.id} profileId={atual.id}
                                     podeCriarGestor={eu?.role === 'supervisor' || eu?.role === 'admin'} />
                        </section>
                    )}
                </div>
            )}
        </main>
    );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[11px] font-semibold tracking-wide text-tinta-3">{rotulo}</dt>
            <dd className="mt-0.5 text-sm">{children}</dd>
        </div>
    );
}
