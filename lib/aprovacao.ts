/**
 * Quem pode resolver um cadastro pendente — as regras, sem I/O.
 *
 * Estavam escritas dentro da server action, misturadas com as consultas. Aqui
 * ficam testáveis: é a regra que decide se alguém ganha acesso às conversas de
 * uma unidade inteira, e isso não pode ser verificado só lendo o código.
 */

export type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin';

export type Aprovador = {
    role: Papel;
    status: string;
    /** Unidades que o gestor cobre (gestor_unidades). Ignorado para supervisor/admin. */
    unidades: string[];
};

export type Candidato = {
    status: string;
    unidade_id: string | null;
};

/** Devolve a mensagem de recusa, ou null se pode. */
export function podeResolver(
    quem: Aprovador | null,
    candidato: Candidato | null,
    papelPedido: 'vendedor' | 'gestor' = 'vendedor',
): string | null {
    if (!quem || quem.status !== 'ativo' || !['gestor', 'supervisor', 'admin'].includes(quem.role)) {
        return 'Você não tem permissão para aprovar cadastros.';
    }
    if (!candidato) return 'Cadastro não encontrado.';
    if (candidato.status !== 'pendente') return 'Esse cadastro já foi resolvido.';
    if (!candidato.unidade_id) return 'O cadastro não tem unidade. Peça para a pessoa escolher.';

    // Um gestor só resolve cadastro das unidades dele. O supervisor, qualquer.
    if (quem.role === 'gestor' && !quem.unidades.includes(candidato.unidade_id)) {
        return 'Esse cadastro é de outra unidade.';
    }
    // Criar gestor é dar a alguém leitura da unidade inteira: só o supervisor.
    if (papelPedido === 'gestor' && !['supervisor', 'admin'].includes(quem.role)) {
        return 'Só o supervisor pode aprovar alguém como gestor.';
    }
    return null;
}

/** "pediu ontem, 17h42" / "pediu 11 set, 09h15" — como no design. */
export function quandoPediu(criado: Date, agora = new Date()): { texto: string; dias: number } {
    const fuso = 'America/Sao_Paulo';
    const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: fuso });
    const hora = criado.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
        .replace(':', 'h');

    const dias = Math.round(
        (Date.parse(dia(agora)) - Date.parse(dia(criado))) / 86_400_000,
    );
    if (dias === 0) return { texto: `pediu hoje, ${hora}`, dias };
    if (dias === 1) return { texto: `pediu ontem, ${hora}`, dias };
    const data = criado.toLocaleDateString('pt-BR', { timeZone: fuso, day: 'numeric', month: 'short' })
        .replace('.', '').replace(' de ', ' ');
    return { texto: `pediu ${data}, ${hora}`, dias };
}

/**
 * A partir de quando o pedido parado merece aviso. O design fala em 4 dias;
 * 3 é o primeiro dia em que já dá para dizer "está esperando há dias".
 */
export const DIAS_PARA_AVISO = 3;
