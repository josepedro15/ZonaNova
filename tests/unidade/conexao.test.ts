import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precisaConectar } from '../../lib/conexao.ts';

// Vendedor ativo que ainda não tem linha em conexoes_whatsapp: nunca abriu a
// tela de conectar.
test('sem conexão nenhuma, precisa conectar', () => {
    assert.equal(precisaConectar(null), true);
});

test('desconectada precisa conectar', () => {
    assert.equal(precisaConectar('desconectada'), true);
});

// O caso que deixava o vendedor parado no dashboard. `caida` é a instância que
// saiu do ar depois de ter estado nela — é o estado que o checar-conexoes
// existe para descobrir, justamente porque o vendedor não percebe sozinho.
test('caída precisa conectar — é o estado que o vendedor não percebe', () => {
    assert.equal(precisaConectar('caida'), true);
});

// Quem abriu o QR e não escaneou está tão fora do ar quanto quem nunca abriu.
test('aguardando_qr precisa conectar', () => {
    assert.equal(precisaConectar('aguardando_qr'), true);
});

test('conectada é o único estado que dispensa a tela', () => {
    assert.equal(precisaConectar('conectada'), false);
});

// A regra é "só `conectada` passa", e não "estes três reprovam": estado novo na
// coluna entra reprovando, que é o lado seguro. Errar mandando para /conectar
// custa um clique; errar deixando passar custa um dia de conversa não lida.
test('estado desconhecido precisa conectar', () => {
    assert.equal(precisaConectar('estado_que_ainda_nao_existe'), true);
});
