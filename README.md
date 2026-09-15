# ZonaNova — Análise de Atendimento Comercial

Sistema interno da **Zona Nova** para análise, com IA, das conversas de WhatsApp
dos vendedores de todas as unidades.

Cada vendedor conecta o WhatsApp comercial dele. As mensagens são recebidas em
tempo real por webhook, e ao final de cada dia o sistema processa as conversas,
envia para a LLM analisar e publica o resultado em três níveis de dashboard:

| Nível | Quem vê | O quê |
|---|---|---|
| **Vendedor** | o próprio | as conversas dele, notas, coaching do dia |
| **Gestor** | gestor da unidade | todos os vendedores da(s) unidade(s) dele |
| **Supervisor** | topo da hierarquia | todas as unidades, ranking e comparativo |

Além das análises de conversa, o sistema mede **aderência ao MEC** — o Modelo de
Execução Comercial que a rede determinou — e minera o que funciona fora dele.
Ver [doc 7](docs/07-aderencia-mec.md).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 + shadcn · Supabase (Postgres +
Auth + RLS) · UAZAPI (WhatsApp) · **OpenAI GPT-4.1 mini** (análise) · Vercel.

> A base conceitual é o MetricsIA (repo `zap-insight`), mas o ZonaNova é um
> sistema interno de uma única empresa: sem billing, sem marketing, sem
> multi-tenant de clientes. O que se reaproveita é o *pipeline* e a doutrina de
> avaliação — não o código de SaaS. E a LLM muda: MetricsIA usa Gemini,
> ZonaNova usa GPT-4.1 mini.

## Documentação de planejamento

Leia nesta ordem:

1. [Produto e escopo](docs/01-produto-e-escopo.md) — o que o sistema faz, papéis, regras de negócio
2. [Modelo de dados](docs/02-modelo-de-dados.md) — tabelas, hierarquia, RLS
3. [Pipeline de análise](docs/03-pipeline-de-analise.md) — ingestão → fila → LLM → relatórios
4. [Arquitetura técnica](docs/04-arquitetura-tecnica.md) — rotas, crons, segredos, ambientes
5. [Mapa de telas](docs/05-mapa-de-telas.md) — briefing para a fase de design
6. [Roadmap](docs/06-roadmap.md) — fases de entrega
7. [Aderência ao MEC](docs/07-aderencia-mec.md) — medir se o padrão comercial está sendo seguido, e descobrir o que ele ainda não diz
8. [Fundação](docs/08-fundacao.md) — o que está de pé, e os três bugs que o teste de RLS encontrou

## Rodar

```bash
npm install
cp .env.example .env.local     # preencher com as credenciais do Supabase
npm run dev

npm run test:rls               # Postgres local: migrations + seed + 32 testes de RLS
```

## Estado atual

**Fase 3 — Fundação concluída.** Auth, papéis e isolamento por unidade de pé e
testados (`tests/rls.sql`, 32 asserções). As 22 telas estão desenhadas em
`design/`. Próximo: conectar o WhatsApp (Fase 4).

Duas pendências que bloqueiam: a identidade visual da Zona Nova (as telas usam
placeholder) e o projeto Supabase real — tudo foi validado em Postgres local.