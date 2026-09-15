# 2. Modelo de dados

Projeto Supabase **próprio do ZonaNova** (isolado do `zap-insight`). Prefixo de
tabela: nenhum — a base é só deste sistema, então os nomes ficam limpos
(`unidades`, `conversas`, `mensagens`).

O SQL executável está em [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
Este documento explica o *porquê* de cada peça.

## 2.1 Visão geral

```
auth.users
    │ 1:1
    ▼
 profiles ──────────► unidades ◄────── gestor_unidades
    │  (role, unidade_id, status)              (gestor ↔ unidade, N:N)
    │
    ├─► conexoes_whatsapp   (1 por vendedor: instância UAZAPI + token)
    │
    └─► conversas ──► mensagens
            │
            └──► analises_conversa          (1 por conversa por dia)
                       │
                       ▼
              relatorios_diarios (vendedor)
                       │
                       ▼
              relatorios_unidade  ──►  relatorios_rede
```

## 2.2 Hierarquia e permissões

### `unidades`
Uma loja/filial da Zona Nova. `ativa` permite tirar uma unidade da lista de
cadastro sem apagar histórico.

### `profiles`
Espelha `auth.users`. Campos que importam:

- `role` — `vendedor | gestor | supervisor | admin`
- `unidade_id` — a unidade do vendedor. `NULL` para supervisor/admin.
- `status` — `pendente | ativo | inativo`. Ingestão e análise só rodam para
  `ativo`. `inativo` preserva todo o histórico (desligamento não apaga dado).
- `aprovado_por` / `aprovado_em` — trilha de quem liberou o acesso.

### `gestor_unidades`
Ligação N:N entre gestor e unidade. Um gestor cobre uma ou várias; o vendedor
continua tendo uma só (em `profiles.unidade_id`).

### Funções de escopo (usadas pela RLS)

Duas funções `SECURITY DEFINER`, marcadas `STABLE`, evitam recursão infinita de
RLS (a política de `profiles` não pode consultar `profiles` diretamente):

- `zn_role()` → o papel do usuário logado
- `zn_unidades_visiveis()` → conjunto de `unidade_id` que ele pode ler
  - vendedor: a própria unidade
  - gestor: as de `gestor_unidades`
  - supervisor/admin: todas

Com isso, toda política de leitura vira `unidade_id IN (SELECT zn_unidades_visiveis())`,
uma linha, igual em toda tabela. Escrita de dado operacional (conversas,
mensagens, análises) é **exclusiva do service role** — o cliente nunca escreve.

## 2.3 Conexão de WhatsApp

### `conexoes_whatsapp`
Uma linha por vendedor. Guarda `instance_name`, `instance_token` (da UAZAPI),
`numero`, `status` (`desconectada | aguardando_qr | conectada | caida`),
`ultimo_evento_em`.

**Segurança:** o token é credencial de acesso ao WhatsApp da pessoa. Fica
cifrado em repouso (AES-256-GCM em coluna `bytea`, chave em
`ZN_ENCRYPTION_KEY`, cifra/decifra na camada de aplicação) e a tabela é
**service-role only** — nenhuma política dá SELECT a usuário autenticado. A UI
lê status e número por uma view (`vw_conexoes_status`) que não expõe o token.

O `status = caida` alimenta o alerta do gestor: número que caiu para de gerar
dado e ninguém percebe.

## 2.4 Dados da conversa

### `conversas`
Uma por par (vendedor, telefone do cliente). Carrega `unidade_id` **denormalizada**
de propósito: é o que permite a RLS por unidade em uma comparação simples e o
rollup histórico correto quando um vendedor troca de unidade.

Campos: `cliente_telefone`, `cliente_nome`, `ultima_mensagem_em`,
`total_mensagens`, `arquivada`.

### `mensagens`
Normalizada (o MetricsIA guarda um blob JSON por conversa; aqui separamos porque
vamos consultar por período, por direção e por vendedor o tempo todo).

- `wa_message_id` **UNIQUE** — idempotência. Webhook reentrega; a gravação é
  `ON CONFLICT DO NOTHING`.
- `direcao` — `entrada | saida`
- `tipo` — `texto | audio | imagem | documento | video | outro`
- `conteudo` — texto ou legenda
- `transcricao` — áudio transcrito (preenchido de forma assíncrona)
- `automatica` — `true` quando é template/bot de triagem. A LLM recebe esse
  marcador e a regra de negócio 1.5 depende dele.
- `enviada_em` — timestamptz, vindo do WhatsApp (não do servidor)

### `contatos_bloqueados`
Telefones que o vendedor marca como "não analisar" (pessoal, fornecedor,
entregador). Filtro aplicado antes da análise.

## 2.5 Resultado da análise

### `analises_conversa`
Resultado individual da LLM para uma conversa num dia. Colunas tipadas para o
que é consultado (`tipo_conversa`, `score_atendimento`, `sentiment`,
`score_oportunidade`, `score_risco`, `status`, `estagio_funil`,
`potencial_venda`, `urgencia`) e um `payload jsonb` com o objeto completo
(resumo, evidências, objeções, técnicas, erros, próxima ação, script sugerido).

`UNIQUE (conversa_id, data_ref)` — reprocessar um dia sobrescreve, não duplica.

Também grava `modelo`, `tokens_entrada`, `tokens_saida`, `custo_estimado` — sem
isso não dá para responder "quanto custou o mês".

### `relatorios_diarios`
Consolidado por **vendedor** por dia: nota geral, leads atendidos, conversões,
oportunidades perdidas, tempo médio de resposta, taxa de resposta, pontos
positivos/negativos, coaching (top 3 melhorias, elogio, desafio). `payload jsonb`
guarda o retorno completo do agregador.

`UNIQUE (user_id, data_ref)`.

### `relatorios_unidade` e `relatorios_rede`
Materializados por dia. Poderiam ser `VIEW`, mas o dashboard do supervisor pede
série histórica de vários meses cruzando unidades — materializar sai muito mais
barato e torna o gráfico instantâneo. São gerados por **rollup em SQL** (soma e
média ponderada dos relatórios do nível abaixo), não por nova chamada de LLM. Só
o texto narrativo (`resumo_ia`) é gerado por LLM, e só se houver mudança
relevante — ver [pipeline](03-pipeline-de-analise.md).

## 2.6 Operação

### `fila_processamento`
`(tipo, referencia_id, data_ref, status, tentativas, ultimo_erro)` com
`UNIQUE (tipo, referencia_id, data_ref)`. Tipos: `analise_conversa`,
`relatorio_vendedor`, `rollup_unidade`, `rollup_rede`, `transcricao`.

Fila em tabela (e não um job runner externo) pelo mesmo motivo do MetricsIA: o
worker é uma rota HTTP idempotente chamada por cron, dá para reprocessar à mão e
o estado é inspecionável no painel do admin.

### `eventos_admin`
Log de ação sensível: aprovação de cadastro, mudança de papel, transferência de
unidade, reprocessamento, desconexão forçada. Quem, o quê, quando, sobre quem.

## 2.7 Índices que não são opcionais

| Índice | Serve a |
|---|---|
| `mensagens (conversa_id, enviada_em)` | montar transcript do dia |
| `mensagens (wa_message_id)` UNIQUE | idempotência do webhook |
| `conversas (user_id, ultima_mensagem_em DESC)` | lista do vendedor |
| `conversas (unidade_id, ultima_mensagem_em DESC)` | lista do gestor |
| `analises_conversa (user_id, data_ref)` | agregação diária |
| `relatorios_diarios (unidade_id, data_ref)` | rollup de unidade |
| `fila_processamento (status, created_at) WHERE status='pendente'` | worker pegar o próximo |

## 2.7-A Módulo MEC

O módulo de aderência acrescenta `playbooks`, `playbook_etapas`,
`playbook_itens`, `aderencia_conversa`, `aderencia_contestacoes`,
`aderencia_diaria` e `descobertas` — em
[`supabase/migrations/0002_mec.sql`](../supabase/migrations/0002_mec.sql),
explicadas em [§7.5](07-aderencia-mec.md).

Uma decisão que vale destacar: **a doutrina de avaliação mora no banco**, não no
código. O prompt da análise é montado a partir de `playbook_etapas` e
`playbook_itens` da versão vigente. Mudar o MEC vira uma linha nova de dados e
uma versão nova, não um deploy — e toda aderência já medida continua apontando
para a versão sob a qual foi medida.

## 2.8 Retenção

Mensagem de WhatsApp é dado pessoal de terceiro (o cliente). Definir na fase de
implementação, mas a proposta é: **mensagens brutas 12 meses**, análises e
relatórios **indefinidamente** (já são agregados/derivados, sem o texto do
cliente). Rotina de expurgo mensal, e o `payload` da análise não deve carregar
trechos longos de conversa além das evidências curtas.
