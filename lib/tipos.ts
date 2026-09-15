export type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin';
export type SituacaoPerfil = 'pendente' | 'ativo' | 'inativo';
export type StatusConexao = 'desconectada' | 'aguardando_qr' | 'conectada' | 'caida';

export interface Perfil {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    role: Papel;
    unidade_id: string | null;
    status: SituacaoPerfil;
}

export interface Unidade {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
    ativa: boolean;
}

export const PAPEIS_DE_GESTAO: Papel[] = ['gestor', 'supervisor', 'admin'];
export const PAPEIS_DE_REDE: Papel[] = ['supervisor', 'admin'];
