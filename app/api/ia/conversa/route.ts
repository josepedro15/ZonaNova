import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dentroDoLimite } from '@/lib/limite';
import { conversar, type PerfilConversa } from '@/lib/ia-conversa';

// Uma pergunta com várias consultas leva de 10 a 60 segundos.
export const maxDuration = 120;

const PAPEIS = ['gestor', 'supervisor', 'admin'] as const;

const schemaPedido = z.object({
    mensagens: z.array(z.object({ papel: z.enum(['usuario', 'ia']), texto: z.string().trim().min(1).max(6000) })).min(1).max(40),
}).refine((p) => p.mensagens[0].papel === 'usuario' && p.mensagens[p.mensagens.length - 1].papel === 'usuario', { message: 'a conversa começa e termina com o usuário' });

/**
 * O chat da tela Conversar com a IA (lib/ia-conversa.ts). Só gestor,
 * supervisor e admin; o vendedor fica para a fase 3. As consultas da IA usam
 * a sessão de quem pergunta: a RLS decide o que ela vê.
 */
export async function POST(req: Request) {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
    const { data: perfil } = await supabase.from('profiles').select('id,nome,role,status,unidade_id,unidades!profiles_unidade_id_fkey(nome)').eq('id', user.id)
        .maybeSingle<{ id: string; nome: string; role: string; status: string; unidade_id: string | null; unidades: { nome: string } | null }>();
    if (!perfil || perfil.status !== 'ativo' || !PAPEIS.includes(perfil.role as typeof PAPEIS[number])) {
        return Response.json({ erro: 'Esta tela é da gestão.' }, { status: 403 });
    }

    const lido = schemaPedido.safeParse(await req.json().catch(() => null));
    if (!lido.success) return Response.json({ erro: 'Pedido inválido.' }, { status: 400 });

    // Contra laço e abuso, não contra uso normal: 40 perguntas por hora.
    if (!(await dentroDoLimite([{ chave: `ia-conversa:${user.id}`, max: 40, janelaSegundos: 3600 }]))) {
        return Response.json({ erro: 'Muitas perguntas na última hora. Espere um pouco e tente de novo.' }, { status: 429 });
    }

    const quem: PerfilConversa = {
        id: perfil.id, nome: perfil.nome, role: perfil.role as PerfilConversa['role'],
        unidade_id: perfil.unidade_id, unidade: perfil.unidades?.nome ?? null,
    };
    try {
        return Response.json(await conversar(supabase, quem, lido.data.mensagens));
    } catch (e) {
        console.error('ia-conversa', e);
        const ocupada = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500);
        return Response.json({ erro: ocupada ? 'A IA está ocupada agora. Tente de novo em um minuto.' : 'Não consegui responder agora. Tente de novo.' }, { status: 502 });
    }
}
