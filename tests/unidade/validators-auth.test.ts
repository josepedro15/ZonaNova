import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaTrocaSenha } from '../../lib/validators/auth.ts';

const valido = { senhaAtual: 'senha-generica-1', senha: 'MinhaNova#2026', confirmacao: 'MinhaNova#2026' };
const erroEm = (dados: Record<string, string>) => {
    const r = schemaTrocaSenha.safeParse(dados);
    return r.success ? null : String(r.error.issues[0].path[0]);
};

test('troca de senha com os três campos certos passa', () => {
    assert.equal(erroEm(valido), null);
});

test('troca de senha exige a senha atual', () => {
    assert.equal(erroEm({ ...valido, senhaAtual: '' }), 'senhaAtual');
});

// A regra é a do cadastro: o Perfil não pode virar o atalho para uma senha
// mais fraca do que a que a pessoa conseguiria criar ao se cadastrar.
test('senha nova curta é recusada como no cadastro', () => {
    assert.equal(erroEm({ ...valido, senha: 'curta', confirmacao: 'curta' }), 'senha');
});

test('confirmação diferente é recusada', () => {
    assert.equal(erroEm({ ...valido, confirmacao: 'OutraCoisa#2026' }), 'confirmacao');
});

// O pedido veio de contas genéricas criadas com a mesma senha: "trocar" para a
// mesma senha deixaria tudo como estava e pareceria resolvido.
test('senha nova igual à atual é recusada', () => {
    assert.equal(erroEm({ senhaAtual: 'MinhaNova#2026', senha: 'MinhaNova#2026', confirmacao: 'MinhaNova#2026' }), 'senha');
});
