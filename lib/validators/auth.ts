import { z } from 'zod';

const telefoneBr = /^\(?\d{2}\)?\s?9?\s?\d{4}-?\d{4}$/;

export const schemaCadastro = z.object({
    nome: z.string().trim().min(3, 'Escreva seu nome completo.').max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    telefone: z.string().trim().regex(telefoneBr, 'Telefone inválido. Ex.: (54) 9 9711-3082'),
    unidadeId: z.string().uuid('Escolha sua unidade.'),
    senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(200),
});

export const schemaLogin = z.object({
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    senha: z.string().min(1, 'Digite sua senha.'),
});

export const schemaAprovacao = z.object({
    profileId: z.string().uuid(),
    papel: z.enum(['vendedor', 'gestor']),
});

export type DadosCadastro = z.infer<typeof schemaCadastro>;
export type DadosLogin = z.infer<typeof schemaLogin>;
