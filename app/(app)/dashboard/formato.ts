export const FUSO = 'America/Sao_Paulo';

/** Meia-noite de hoje em Brasília, como instante. */
export function inicioDoDia(agora: Date): Date {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
    return new Date(`${dia}T00:00:00-03:00`);
}

export function horaBrasilia(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(':', 'h');
}

export function dataCurtaBrasilia(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "quarta, 23 de setembro" de um AAAA-MM-DD. */
export function diaPorExtenso(dataRef: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(`${dataRef}T12:00:00-03:00`));
}

export function saudacao(agora: Date): string {
    const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(agora));
    if (hora < 12) return 'Bom dia';
    return hora < 18 ? 'Boa tarde' : 'Boa noite';
}

export function dataPorExtenso(agora: Date): string {
    const texto = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(agora);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}
