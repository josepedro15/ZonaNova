/**
 * Cliente da UAZAPI.
 *
 * ATENÇÃO — o servidor é COMPARTILHADO com o MetricsIA/zap-insight. No momento
 * em que isto foi escrito havia 28 instâncias lá, 25 delas do zap-insight, e o
 * nosso admintoken controla todas: criar, desconectar e apagar. Um engano aqui
 * derruba o WhatsApp de cliente de outro produto.
 *
 * Por isso duas regras, aplicadas em código e não por disciplina:
 *
 *   1. Toda instância que criamos leva `systemName = 'zonanova'`.
 *   2. Toda operação destrutiva confirma o systemName ANTES de agir, e recusa
 *      o que não for nosso. `listar()` também filtra — o resto do sistema
 *      nunca enxerga instância alheia.
 */
export const SYSTEM_NAME = 'zonanova';

export type Instancia = {
    id: string;
    token: string;
    name: string;
    systemName: string;
    status: string;
    owner?: string;
    profileName?: string;
    qrcode?: string;
    paircode?: string;
};

type Fetch = typeof globalThis.fetch;

// Sem "parameter properties" (`constructor(private x)`) em todo este ficheiro:
// o `node --test` roda em strip-only mode, que as recusa. Campo declarado e
// atribuído à mão é o que os dois entendem.
export class ErroUazapi extends Error {
    readonly status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ErroUazapi';
        this.status = status;
    }
}

/** Recusa mexer no que não é nosso. É a trava do servidor compartilhado. */
export class InstanciaAlheia extends ErroUazapi {
    constructor(systemName: string) {
        super(
            `instância pertence a "${systemName}", não a "${SYSTEM_NAME}" — ` +
            'operação recusada para não afetar outro produto no mesmo servidor',
        );
        this.name = 'InstanciaAlheia';
    }
}

export function ehNossa(i: { systemName?: string | null }): boolean {
    return i.systemName === SYSTEM_NAME;
}

export class Uazapi {
    private readonly baseUrl: string;
    private readonly adminToken: string;
    private readonly buscar: Fetch;

    constructor(baseUrl: string, adminToken: string, buscar: Fetch = globalThis.fetch) {
        this.baseUrl = baseUrl;
        this.adminToken = adminToken;
        this.buscar = buscar;
    }

    private async chamar<T>(
        caminho: string,
        { metodo = 'GET', token, corpo }: { metodo?: string; token?: string; corpo?: unknown } = {},
    ): Promise<T> {
        const r = await this.buscar(`${this.baseUrl}${caminho}`, {
            method: metodo,
            headers: {
                'content-type': 'application/json',
                ...(token ? { token } : { admintoken: this.adminToken }),
            },
            ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        });
        const texto = await r.text();
        if (!r.ok) throw new ErroUazapi(`${metodo} ${caminho}: ${r.status} ${texto.slice(0, 300)}`, r.status);
        return (texto ? JSON.parse(texto) : {}) as T;
    }

    /** Só as instâncias do ZonaNova. O resto do sistema nunca vê as outras. */
    async listar(): Promise<Instancia[]> {
        const todas = await this.chamar<Instancia[]>('/instance/all');
        return todas.filter(ehNossa);
    }

    async status(token: string): Promise<Instancia> {
        const r = await this.chamar<{ instance: Instancia }>('/instance/status', { token });
        return r.instance;
    }

    async criarInstancia(nome: string): Promise<Instancia> {
        const r = await this.chamar<{ instance?: Instancia } & Partial<Instancia>>('/instance/init', {
            metodo: 'POST',
            corpo: { name: nome, systemName: SYSTEM_NAME },
        });
        const i = (r.instance ?? r) as Instancia;
        if (!i?.token) throw new ErroUazapi('a UAZAPI não devolveu token da instância criada');
        return i;
    }

    /**
     * `excludeMessages` fica VAZIO de propósito. As outras instâncias do
     * servidor excluem `wasSentByApi`, mas o ZonaNova precisa justamente
     * dessas: é o disparo em massa, que o doc 3 §3.3 manda identificar para
     * não destruir a média do vendedor. Excluir na origem tiraria a evidência.
     */
    async configurarWebhook(token: string, url: string): Promise<void> {
        await this.chamar('/webhook', {
            metodo: 'POST',
            token,
            corpo: {
                enabled: true,
                url,
                events: ['messages', 'connection'],
                excludeMessages: [],
                addUrlEvents: false,
                addUrlTypesMessages: false,
            },
        });
    }

    async conectar(token: string): Promise<Instancia> {
        await this.garantirNossa(token);
        const r = await this.chamar<{ instance: Instancia }>('/instance/connect', { metodo: 'POST', token });
        return r.instance;
    }

    async desconectar(token: string): Promise<void> {
        await this.garantirNossa(token);
        await this.chamar('/instance/disconnect', { metodo: 'POST', token });
    }

    async apagar(token: string): Promise<void> {
        await this.garantirNossa(token);
        await this.chamar('/instance', { metodo: 'DELETE', token });
    }

    /** Pergunta ao servidor de quem é a instância antes de mexer nela. */
    private async garantirNossa(token: string): Promise<void> {
        const i = await this.status(token);
        if (!ehNossa(i)) throw new InstanciaAlheia(i.systemName ?? '(sem systemName)');
    }
}
