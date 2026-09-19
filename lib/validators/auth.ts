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

// A regra da senha vem do cadastro, não é copiada: se o mínimo subir lá e não
// aqui, a recuperação vira o atalho para criar uma senha mais fraca.
export const schemaNovaSenha = z.object({
    senha: schemaCadastro.shape.senha,
    confirmacao: z.string(),
}).refine((d) => d.senha === d.confirmacao, {
    message: 'As duas senhas não são iguais.',
    path: ['confirmacao'],
});

export const schemaAprovacao = z.object({
    profileId: z.string().uuid(),
    papel: z.enum(['vendedor', 'gestor']),
});

export type DadosCadastro = z.infer<typeof schemaCadastro>;
export type DadosLogin = z.infer<typeof schemaLogin>;
