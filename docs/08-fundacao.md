# 8. Fundação (Fase 3)

Auth, papéis e isolamento por unidade. O critério de pronto da fase era um
teste provando que um vendedor não enxerga dado de outra unidade — está em
[`tests/rls.sql`](../tests/rls.sql): **32 asserções de isolamento, mais 3
guardas de privilégio** acrescentadas depois de o Supabase real mostrar que o
teste local era otimista demais (§8.2).

## 8.1 Rodar

```bash
npm install
cp .env.example .env.local     # preencher com as credenciais do Supabase
npm run dev

npm run test:rls               # sobe Postgres local, aplica tudo, testa a RLS
npm run typecheck && npm run lint && npm run build
```

`scripts/db-local.sh` recria em Postgres local o mínimo que o Supabase fornece
(schema `auth`, `auth.uid()`, os papéis `authenticated`/`anon`/`service_role`)
**e as default privileges que o Supabase concede em `public`** — sem essas
últimas o local fica mais fechado que a produção e o teste passa por motivo
errado, que foi o quarto bug do §8.2. Não substitui o Supabase: serve para o
teste rodar sem depender de projeto remoto.

Roda em Linux (como root, com o utilizador `postgres` do sistema) e em macOS
(como o próprio utilizador, com `brew install postgresql@17`). Em ambos o
superuser do cluster chama-se `postgres` — a `0003` faz `alter default
privileges FOR ROLE postgres` e sem esse nome rebenta. O cluster fica em
`$HOME/.local/share/zonanova/pg` no macOS, na porta 5433, sem tocar em nenhum
Postgres que já exista na máquina.

## 8.2 Quatro bugs que o teste encontrou

Nenhum foi visto lendo o código. Todos apareceram ao rodar — e o quarto só
apareceu ao rodar **no Supabase real**, porque o Postgres local o escondia.

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

### Os grants por coluna não restringiam nada no Supabase

Os três bugs acima apareceram em Postgres local. Este só apareceu ao aplicar as
migrations no projeto Supabase real, e é o mais desconfortável: o teste local
**passava por motivo errado**.

O `0001` concede privilégios estreitos de propósito — `grant update (nome,
telefone) on profiles`, e um `grant select (…)` em `conexoes_whatsapp` que deixa
`instance_token` de fora. Num Postgres limpo, como o do `db-local.sh`, isso
restringe. No Supabase não: o projeto vem com `alter default privileges in schema
public grant all on tables to anon, authenticated`, então toda tabela nasce
aberta e um GRANT posterior **só soma — nunca tira**.

Medido no banco real depois de aplicar `0001`+`0002`: `anon` e `authenticated`
com SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas 21 relações. Na prática, um gestor
conseguia `select instance_token from conexoes_whatsapp` e ler a credencial de
WhatsApp cifrada dos vendedores da unidade dele — exatamente o que a secção 8.3
promete que não acontece.

O `0003` revoga a herança, mata as default privileges do role `postgres` e
reconstrói só os grants que o `0001` e o `0002` pretendiam. O `db-local.sh` passou
a replicar as default privileges do Supabase, para o teste deixar de ser mais
otimista que a produção, e o `tests/rls.sql` ganhou três guardas que falham se
uma tabela nova vier aberta.

Sobra uma aresta: as default privileges existem sob dois donos, e a de
`supabase_admin` continua a conceder tudo. O `postgres` do projeto não é
superuser e não a consegue alterar. Tabela criada pelas migrations ou pelo SQL
editor corre como `postgres` e está coberta; se algo em `public` vier a ser
criado por `supabase_admin`, nasce aberto — e é a guarda do teste que avisa.

## 8.3 Decisões de segurança

**RLS e GRANT são cadeados diferentes, e GRANT só abre.** RLS sem GRANT nega
tudo; GRANT sem RLS abre tudo. A secção 8 do `0001` declara os dois
explicitamente, mas declarar não bastava: o Supabase já tinha concedido tudo por
defeito, e GRANT nunca tira privilégio. Quem fecha é o `revoke` do `0003`.
Regra prática para toda migration futura: **privilégio estreito em `public` só
vale depois de um `revoke`** — escrever só o `grant` é um no-op silencioso.

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
| Migrations | `0001_init` (hierarquia, RLS, grants), `0002_mec` (aderência), `0003_revoga_padroes_supabase` (fecha a herança do Supabase), `0004_ensure_rls` (drift capturado) |
| Supabase | projeto real provisionado, `0001`–`0003` aplicadas; `0004` pendente |
| Auth | cadastro com unidade, login, recuperação de senha, logout |
| Papéis | encaminhamento por papel e situação em `proxy.ts` |
| Aprovação | server action com autorização em código e trilha em `eventos_admin` |
| Seed | 2 unidades, supervisor, 2 gestores, 3 vendedores, 1 pendente |
| Verificação | `test:rls` (35/35) · `typecheck` · `lint` · `build` — todos limpos |

## 8.5 Ainda não

O dashboard é uma tela mínima que só prova que a sessão e a RLS funcionam. As
20 telas desenhadas entram na Fase 6, depois de existir dado: primeiro conectar
o WhatsApp (Fase 4), depois ligar a análise (Fase 5).

O projeto Supabase já existe e as migrations `0001`–`0003` estão lá. Falta
aplicar a `0004` no remoto — é no-op onde o `ensure_rls` já existe, mas sem ela
quem recriar o banco pelas migrations não o teria.
