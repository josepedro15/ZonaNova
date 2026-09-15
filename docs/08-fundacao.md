# 8. Fundação (Fase 3)

Auth, papéis e isolamento por unidade. O critério de pronto da fase era um
teste provando que um vendedor não enxerga dado de outra unidade — está em
[`tests/rls.sql`](../tests/rls.sql), **32 asserções, todas passando**.

## 8.1 Rodar

```bash
npm install
cp .env.example .env.local     # preencher com as credenciais do Supabase
npm run dev

npm run test:rls               # sobe Postgres local, aplica tudo, testa a RLS
npm run typecheck && npm run lint && npm run build
```

`scripts/db-local.sh` recria em Postgres local o mínimo que o Supabase fornece
(schema `auth`, `auth.uid()`, os papéis `authenticated`/`anon`/`service_role`),
para que as migrations e a RLS rodem exatamente como em produção. Não substitui
o Supabase — serve para o teste rodar sem depender de projeto remoto.

## 8.2 Três bugs que o teste encontrou

Nenhum foi visto lendo o código. Todos apareceram ao rodar.

### O cadastro quebrava inteiro

O trigger `handle_new_user` cria o profile com `role` = `vendedor` por defeito.
A constraint exigia unidade para todo vendedor — então um signup sem unidade nos
metadados violava o `CHECK`, a inserção caía, e a pessoa ficava em `auth.users`
**sem profile**: conta existente e app quebrado, sem erro visível.

A regra estava errada no papel. Não é "todo vendedor precisa de unidade", é
**todo vendedor ativo**. Pendente é justamente o estado logo após o signup.

### Todo vendedor lia as conversas dos colegas

`zn_unidades_visiveis()` devolvia a unidade do próprio vendedor, e as políticas
fazem `user_id = auth.uid() OR unidade_id IN (...)`. Resultado: qualquer vendedor
lia a unidade inteira — o oposto do que o §1.3 promete.

A função passou a significar *unidades onde posso ler o dado individual de
outras pessoas*, e o vendedor não entra nela. Para a linha "média da unidade" do
dashboard existe `zn_minha_unidade()`, que dá acesso só ao **agregado**.

### Um gestor promovia-se a supervisor

A política de UPDATE restringe a **linha** (`id = auth.uid()`), mas RLS no
Postgres não restringe **coluna**. O gestor reescrevia o próprio `role` e passava
a ler a rede inteira.

Duas camadas fecham isso: `grant update (nome, telefone)` — as colunas de poder
ficam fora do grant — e um trigger que rejeita alteração de
`role`/`unidade_id`/`status`/`aprovado_*` vinda de sessão de utilizador. O
trigger continua a valer se alguém um dia alargar o grant.

## 8.3 Decisões de segurança

**RLS e GRANT são cadeados diferentes.** RLS sem GRANT nega tudo; GRANT sem RLS
abre tudo. O Supabase concede privilégios por defeito a `authenticated`, mas
depender desse implícito quebra em qualquer outro ambiente — a secção 8 do
`0001` declara os dois explicitamente.

**O token da instância tem grant por coluna.** `conexoes_whatsapp` é legível
(a UI precisa do status para o alerta de número caído), mas `instance_token`
está fora do grant: nem um `select *` o alcança. É a credencial do WhatsApp de
uma pessoa — errar uma política futura não pode vazá-la.

**O proxy não é a barreira.** `proxy.ts` só decide para onde mandar a pessoa.
Se o ficheiro sumisse, ninguém passaria a ler dado de outra unidade — é o que o
teste prova. A autorização mora no banco.

**Aprovar usa service role, com autorização em código.** A RLS e o trigger
proíbem mudar `role`/`status` de uma sessão de utilizador — e é justamente isso
que impede a escalada. Então `aprovarCadastro` usa o service role, confere em
código quem pede e para qual unidade, e grava em `eventos_admin`. Um gestor só
aprova nas unidades dele; só o supervisor cria outro gestor.

**Login e recuperação não confirmam se um e-mail existe.** Mensagem única em
ambos. Diferenciar transformaria as telas num jeito de descobrir quem trabalha
na rede.

## 8.4 O que está de pé

| | |
|---|---|
| Migrations | `0001_init` (hierarquia, RLS, grants), `0002_mec` (aderência) |
| Auth | cadastro com unidade, login, recuperação de senha, logout |
| Papéis | encaminhamento por papel e situação em `proxy.ts` |
| Aprovação | server action com autorização em código e trilha em `eventos_admin` |
| Seed | 2 unidades, supervisor, 2 gestores, 3 vendedores, 1 pendente |
| Verificação | `test:rls` · `typecheck` · `lint` · `build` — todos limpos |

## 8.5 Ainda não

O dashboard é uma tela mínima que só prova que a sessão e a RLS funcionam. As
20 telas desenhadas entram na Fase 6, depois de existir dado: primeiro conectar
o WhatsApp (Fase 4), depois ligar a análise (Fase 5).

Falta também criar o projeto Supabase de verdade e aplicar as migrations lá —
tudo aqui foi validado em Postgres local.
