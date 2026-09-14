# 3. Pipeline de análise

## 3.1 Visão geral

```
  WhatsApp do vendedor
        │  (UAZAPI)
        ▼
  POST /api/webhook/uazapi ──► mensagens (idempotente por wa_message_id)
        │
        └─► áudio? enfileira transcricao
                              │
  ┌───────────────────────────┘
  │  23:30 BRT — cron "fechar-dia"
  ▼
  monta a lista de conversas com atividade no dia, por vendedor ativo
        │  filtros: contatos bloqueados, grupos, disparo em massa, aniversário
        ▼
  enfileira analise_conversa (uma por conversa)
        │
        ▼
  worker /api/cron/processar-fila  (a cada 5 min, lotes)
        │
        ├─ LLM  GPT-4.1 mini · structured output · 1 chamada por conversa
        │       └─► analises_conversa
        │
        ├─ quando todas as conversas do vendedor no dia terminam:
        │   relatorio_vendedor → 1 chamada LLM (agregador) ─► relatorios_diarios
        │
        ├─ rollup_unidade  → SQL puro + 1 chamada curta p/ o texto ─► relatorios_unidade
        └─ rollup_rede     → SQL puro + 1 chamada curta p/ o texto ─► relatorios_rede

  (semanal) descoberta → 4 buscas sobre os resumos da semana ─► descobertas
```

**Regra de ouro do custo:** LLM só onde há julgamento a fazer. Número é somado em
SQL. A unidade e a rede não re-leem conversa nenhuma — elas somam o que os níveis
abaixo já produziram e usam a LLM apenas para escrever o parágrafo de leitura.

## 3.2 Ingestão

Rota `POST /api/webhook/uazapi`, uma por instância (a URL de webhook é
configurada na UAZAPI no momento em que a instância é criada, com um token de
rota por vendedor).

Responsabilidades, nessa ordem:

1. **Autenticar** o payload (token da rota + confere `instance_token` contra
   `conexoes_whatsapp`). Payload não autenticado → 401, sem gravar nada.
2. **Responder 200 rápido.** O processamento pesado vai para `after()` do Next —
   webhook que demora é webhook que a UAZAPI reentrega.
3. **Resolver a conversa** (`user_id` + `cliente_telefone`), criando se for nova
   e carimbando a `unidade_id` vigente do vendedor.
4. **Gravar a mensagem** com `ON CONFLICT (wa_message_id) DO NOTHING`.
5. Se for **áudio**, enfileirar `transcricao`.
6. Eventos de conexão (`connected` / `disconnected`) atualizam
   `conexoes_whatsapp.status` — é isso que alimenta o alerta de número caído.

Descartar já na entrada: mensagens de grupo (`@g.us`), status/broadcast,
e telefones em `contatos_bloqueados`.

## 3.3 Fechamento do dia

Cron às **23:30 BRT** (`30 2 * * *` em UTC). Para cada vendedor com
`status = 'ativo'` e conexão `conectada`:

- Busca conversas com mensagem entre 00:00 e 23:59:59 do dia (fuso
  `America/Sao_Paulo` — o dia do relatório é o dia comercial, não UTC).
- Aplica o **filtro de disparo**: conversa de aniversário nunca analisa;
  campanha em massa sem resposta do cliente fica fora; com resposta entra, mas
  cortada a partir da resposta. (Sem isso, um disparo de 300 contatos destrói a
  média do vendedor.)
- Enfileira uma `analise_conversa` por conversa sobrevivente.

Vendedor sem conversa no dia não gera relatório — não é nota zero, é ausência de
dado, e o dashboard mostra isso como "sem movimento".

## 3.4 Worker

`GET /api/cron/processar-fila` com `Authorization: Bearer ${CRON_SECRET}`, a cada
5 minutos. Pega um lote de N itens `pendente` (ordem de criação), marca
`processando`, executa, marca `concluido` ou `falhou` incrementando `tentativas`.

- **Retry** com backoff: tentativas 1, 2, 3. Na 4ª, `falhou` definitivo e o item
  aparece no painel do admin.
- **Idempotente**: `analises_conversa` tem `UNIQUE (conversa_id, data_ref)` e a
  gravação é upsert. Rodar o worker duas vezes não duplica nem cobra duas vezes
  (a análise existente é reaproveitada, salvo reprocessamento explícito).
- O worker é uma rota HTTP comum: dá para chamar à mão para destravar um dia.

## 3.5 Etapa 1 — análise individual (LLM)

**Modelo:** `gpt-4.1-mini`. Uma chamada por conversa.

**Entrada:** transcript compacto do dia, no formato já validado no MetricsIA —
`V:` para vendedor, `C:` para cliente, uma linha por mensagem, mídia marcada como
`[Media: audio] (Transcrição: "...")`, e mensagem de bot prefixada com
`[automática]`.

**Saída:** JSON estrito via **structured outputs** (`response_format` com
`json_schema` e `strict: true`), `temperature: 0`. Campos:

| Campo | Tipo | Nota |
|---|---|---|
| `tipo_conversa` | `negociacao\|suporte\|social` | só `negociacao` entra na nota do dia |
| `status` | enum | `em_andamento`, `venda_feita`, `lead_frio`, `sem_resposta`, ... |
| `sentiment` | 0-100 | humor do **cliente** |
| `score_atendimento` | 0-100 | qualidade do **vendedor** (rubrica) |
| `score_oportunidade` / `score_risco` | 0-100 | |
| `estagio_funil`, `potencial_venda`, `urgencia` | | |
| `resumo`, `destaque`, `proxima_acao`, `script_sugerido` | texto | |
| `objecoes`, `tecnicas_usadas`, `erros_vendedor`, `tags` | array | |
| `evidencias` | array 1-5 | trechos do transcript que sustentam as conclusões |

**Prompt:** porta o prompt do MetricsIA (`lib/prompts/individual-analysis.ts`),
que já carrega a doutrina do §1.5. Ajustes necessários para o GPT:

- O prompt do Gemini termina pedindo "responda apenas com JSON". Com structured
  outputs isso é redundante — mas mantenha, custa nada e protege se o schema for
  afrouxado.
- Gemini tolera prompt muito longo em `systemInstruction`; no GPT, mandar a
  doutrina como `system` e o transcript como `user` separa melhor e permite
  **prompt caching** do bloco fixo.
- Enums do schema devem ser `enum` de verdade no JSON Schema (o Gemini aceitava
  descrição em texto). Isso elimina a validação manual de valor inválido.

**Cache:** hash do transcript (`sha256`) em coluna da análise. Transcript
idêntico ao já analisado (reprocessamento de um dia sem mensagem nova) não
rechama a LLM.

## 3.6 Etapa 2 — consolidado do vendedor (LLM)

Uma chamada por vendedor por dia, recebendo as **análises individuais** (não os
transcripts). Produz:

- `aggregate` — score geral, leads atendidos, conversões confirmadas,
  oportunidades perdidas, taxa de resposta, tempo médio de resposta, summary,
  pontos positivos/negativos
- `coaching` — nota geral, top 3 melhorias, elogio, desafio de amanhã
- `insights` — padrões de sucesso/falha, objeções frequentes, alertas

**Os números vêm calculados, não inventados.** Tempo médio de resposta, taxa de
resposta e contagem de leads são computados em SQL sobre `mensagens` e passados
prontos no prompt. A LLM escreve a leitura; ela não conta. Isso elimina a classe
de erro mais comum do MetricsIA (número plausível e errado).

Média do dia = média de `score_atendimento` **só das conversas
`tipo_conversa = 'negociacao'`**.

## 3.6-A Etapa 2-A — aderência ao MEC

Sai junto com a análise individual (mesma chamada, schema maior): um bloco `mec`
com as 7 etapas, cada uma com `aplicavel`, `aplicado`, `justificativa`,
`evidencias` e os itens específicos.

O prompt desse bloco é **montado a partir do banco** (`playbook_etapas` +
`playbook_itens` da versão vigente), não escrito à mão no código.

Custo: o prompt cresce e a saída quase dobra. Duas defesas — o bloco de doutrina
é fixo e vai para prompt caching, e a aderência só é medida em
`tipo_conversa = 'negociacao'`, que é a minoria do dia. Medir isso na simulação
de custo antes de ligar para a rede.

Detalhes e a regra de `aplicáveis` em [§7](07-aderencia-mec.md).

## 3.6-B Descoberta (semanal)

Job novo, domingo de madrugada. Quatro buscas sobre a semana — prática fora do
script que converteu, script seguido que não converteu, objeção fora do
catálogo, minhoca inventada — mais o cruzamento etapa × conversão em SQL puro.

Recebe **os resumos das análises**, nunca os transcripts. Uma chamada por busca.
Grava em `descobertas` para o supervisor avaliar. Ver [§7.4](07-aderencia-mec.md).

## 3.7 Etapa 3 — unidade e rede (SQL + narrativa curta)

`rollup_unidade`: soma/média ponderada de `relatorios_diarios` da unidade na
data. Vendedor sem movimento não entra no denominador.

`rollup_rede`: mesma coisa sobre `relatorios_unidade`.

Depois, **uma** chamada curta à LLM por unidade e uma para a rede, recebendo só
os números do dia + os 7 dias anteriores, para escrever `resumo_ia`: o que mudou,
onde está o problema, quem puxou para cima. Se os números do dia estiverem dentro
da variação normal, pula a chamada e repete o texto anterior — economia sem perda.

## 3.8 Custo

Por conversa, na prática: transcript curto de WhatsApp raramente passa de alguns
milhares de tokens de entrada e a saída estruturada é da ordem de 500-800 tokens.
Com `gpt-4.1-mini` o custo por conversa fica na casa dos milésimos de dólar; o que
determina a conta é o **volume de conversas/dia × número de vendedores**.

Dá para estimar de verdade antes de ligar: portar o `simulate-cost.ts` do
zap-insight, rodar contra um dia real de mensagens e medir. **Faça isso antes da
Fase 3** — e confirme a tabela de preços vigente do modelo na documentação da
OpenAI em vez de assumir valores.

Controles previstos no desenho:

- Chamada de LLM **só** nas etapas 1 e 2 (e no texto curto das etapas 3).
- Cache por hash de transcript.
- Prompt caching no bloco de doutrina (é o maior pedaço e não muda).
- `tokens_entrada`/`tokens_saida`/`custo_estimado` gravados por análise →
  painel de custo por dia, por unidade e por vendedor.
- Teto diário configurável de conversas analisadas por vendedor: acima dele,
  analisa as mais recentes e registra o corte.

## 3.9 Transcrição de áudio

Áudio é parte grande da venda no WhatsApp e ignorar áudio cega a análise. Fila
`transcricao` separada, com cache por hash do arquivo (o mesmo áudio
encaminhado não é transcrito duas vezes). A análise do dia espera as transcrições
pendentes daquela conversa; se uma falhar, segue com `[Media: audio]` sem texto —
e a doutrina já instrui a LLM a não concluir nada a partir de mídia que não leu.

## 3.10 Reprocessamento

Ação de admin: reprocessar um dia de um vendedor, de uma unidade, ou da rede.
Apaga as análises daquele `data_ref` e reenfileira. Fica registrado em
`eventos_admin` — reprocessamento muda nota de gente, então tem que ter dono.
