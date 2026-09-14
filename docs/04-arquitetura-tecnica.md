# 4. Arquitetura técnica

## 4.1 Stack

| Camada | Escolha | Motivo |
|---|---|---|
| App | Next.js 16 (App Router), React 19 | mesmo terreno do zap-insight; server actions evitam uma API separada |
| UI | Tailwind v4 + shadcn/ui | componentes já conhecidos, tokens semânticos |
| Gráficos | Recharts | já usado no MetricsIA |
| Dados | Supabase (Postgres, Auth, RLS) | RLS resolve a hierarquia no banco, não na aplicação |
| WhatsApp | UAZAPI (QR) | número comercial do vendedor sem migrar para a Meta |
| LLM | OpenAI `gpt-4.1-mini` | structured outputs + custo baixo por conversa |
| Deploy | Vercel + Vercel Cron | crons declarados em `vercel.json` |

## 4.2 Estrutura de pastas

```
app/
  (auth)/login, /cadastro, /aguardando-aprovacao
  (app)/conectar            — QR Code e status da conexão
  (app)/dashboard           — vendedor
  (app)/conversas/[id]      — conversa + análise
  (app)/equipe              — gestor: vendedores da unidade
  (app)/unidades            — supervisor: rede
  (app)/admin               — fila, custos, reprocessamento
  api/webhook/uazapi        — ingestão
  api/cron/fechar-dia
  api/cron/processar-fila
components/  ui/ · dashboard/ · equipe/ · rede/
lib/
  supabase/    (client, server, admin)
  services/    uazapi · openai · transcricao · rollup · fila · crypto
  prompts/     analise-individual · consolidado-vendedor · resumo-unidade
  validators/  schemas zod
supabase/migrations/
docs/
```

## 4.3 Rotas e proteção

| Rota | Quem acessa | Proteção |
|---|---|---|
| `/cadastro`, `/login` | público | — |
| `/aguardando-aprovacao` | logado com `status = pendente` | middleware |
| `/conectar`, `/dashboard`, `/conversas/*` | `ativo` | middleware + RLS |
| `/equipe/*` | `gestor`, `supervisor`, `admin` | server-side + RLS |
| `/unidades/*` | `supervisor`, `admin` | server-side + RLS |
| `/admin/*` | `admin` | server-side |
| `/api/webhook/uazapi` | UAZAPI | token de rota + confere instância |
| `/api/cron/*` | Vercel Cron | `Authorization: Bearer ${CRON_SECRET}` |

O middleware trata redirecionamento por status (pendente → espera; ativo sem
conexão → `/conectar`). **A autorização de verdade é a RLS** — o middleware só
melhora a navegação; ele não é a barreira.

## 4.4 Crons

```json
{
  "crons": [
    { "path": "/api/cron/fechar-dia",      "schedule": "30 2 * * *" },
    { "path": "/api/cron/processar-fila",  "schedule": "*/5 * * * *" },
    { "path": "/api/cron/checar-conexoes", "schedule": "0 */2 * * *" },
    { "path": "/api/cron/expurgo",         "schedule": "0 5 1 * *" }
  ]
}
```

Horários em UTC. `fechar-dia` às 02:30 UTC = **23:30 BRT** do dia anterior.
`checar-conexoes` bate o status real na UAZAPI e corrige `caida` — webhook de
desconexão se perde, ping não.

## 4.5 Segredos

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # só server; nunca no cliente
DIRECT_URL                     # migrations

UAZAPI_API_URL
UAZAPI_ADMIN_TOKEN             # criar instância por vendedor
UAZAPI_WEBHOOK_SECRET          # autenticar o webhook de entrada

OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini

ZN_ENCRYPTION_KEY              # AES-256-GCM dos tokens de instância (openssl rand -base64 32)
CRON_SECRET
NEXT_PUBLIC_APP_URL
```

Nenhum segredo em `NEXT_PUBLIC_*` além de URL e anon key. O `instance_token` de
cada vendedor é cifrado com `ZN_ENCRYPTION_KEY` antes de ir para o banco, e a
tabela que o guarda não tem política de SELECT para usuário autenticado.

## 4.6 Pontos de falha previstos

| Falha | Consequência | Mitigação desenhada |
|---|---|---|
| Número do vendedor cai | dia inteiro sem dado, ninguém nota | `checar-conexoes` a cada 2h + alerta no painel do gestor |
| Webhook reentrega | mensagem duplicada | `wa_message_id UNIQUE` |
| LLM devolve JSON inválido | análise perdida | structured outputs `strict` + retry + item `falhou` visível |
| Disparo em massa | média do vendedor destruída | filtro de disparo antes da fila |
| Vendedor troca de unidade | histórico migra junto e distorce a unidade antiga | `unidade_id` carimbada na conversa e na análise |
| Cron da Vercel não dispara | dia sem relatório | fila persiste; próximo `processar-fila` pega o atraso |
| Reprocessamento em massa | custo inesperado de LLM | teto diário + custo por análise gravado + ação só de admin |

## 4.7 Ambientes

- **Produção** — projeto Supabase próprio, instâncias UAZAPI reais.
- **Desenvolvimento** — projeto Supabase separado (ou branch do Supabase) e uma
  instância UAZAPI de teste com um número descartável. **Nunca** apontar o
  ambiente de dev para os números reais dos vendedores: são conversas de clientes
  de verdade.
- Seed de desenvolvimento com conversas sintéticas cobrindo os casos da doutrina
  (disparo, áudio, mensagem automática, cliente sem resposta).

## 4.8 LGPD

O sistema grava conversa de cliente final, que não é usuário do sistema. Antes de
ligar em produção:

- Aviso aos vendedores de que o WhatsApp comercial conectado é monitorado e
  analisado, com aceite registrado.
- Retenção definida e rotina de expurgo rodando (§2.8).
- Acesso à conversa individual só até onde a hierarquia justifica — é por isso
  que a RLS é por unidade e não "todo mundo logado vê tudo".
- Registro em `eventos_admin` de quem exportou ou reprocessou o quê.
