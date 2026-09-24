# MEC estruturado na análise de cada conversa

**Data:** 24 set 2026 · **Branch:** `redesign/redemac` · **Task:** [ClickUp 868m9rtte](https://app.clickup.com/t/868m9rtte)
**Origem:** item 2 da auditoria de análises ([ClickUp 868m9rqwy](https://app.clickup.com/t/868m9rqwy); inventários em `.superpowers/auditoria-analises/`).

## 1. Problema

O doc 7 §7.1 promete medir o MEC por **sinal observável**: cada uma das 7
informações da sondagem como um sim/não com evidência, a objeção pelo catálogo
das 8, os três passos do contorno, o tipo de fechamento e as frases proibidas.
Hoje a IA recebe o Book como texto corrido e devolve, por etapa, só
`aplicado` (sim/parcial/não), uma justificativa e uma lista livre `itens`.
Consequências:

- **Sondagem**, que o doc 7 chama de *"provavelmente a métrica mais acionável do
  sistema"*, não existe como número. A coluna `aderencia_diaria.sondagem_itens`
  existe desde a migration 0002 e nunca é gravada.
- **Frases proibidas** não são contadas (`aderencia_diaria.frases_proibidas`
  fica sempre 0).
- **Objeções** chegam como texto livre ("achou caro", "preço alto", "tá
  salgado"). A tela "Objeções da semana" não consegue agrupar, e "objeção fora
  do catálogo" só existe na descoberta semanal, por texto.
- **Contorno, preço e fechamento** viram uma frase de justificativa. Não dá
  para responder "quem pula o papagaio?" ou "quantos fecham com limitação de
  opções?".

## 2. Objetivo

Toda análise de conversa de **negociação** passa a devolver, além do que já
devolve, um bloco `mec_detalhe` com campos **fechados** (booleanos, códigos do
catálogo e contagens), cada um com trecho literal como prova. Esses campos são
gravados numa tabela normalizada, agregados por dia/vendedor/unidade e
mostrados nas telas do MEC.

## 3. Fora do escopo

- Correlação etapa × conversão (item 4 da auditoria: depende de algumas semanas
  deste dado).
- Resumos narrativos de unidade/rede (item 3).
- Alçada de desconto real e desconto aplicado no Carrinho: o sistema continua
  medindo só o que é **dito** na conversa (doc 7 §7.3; não há ERP).
- Mudar a nota de atendimento ou a regra de aderência (`aplicadas ÷
  aplicáveis`). O detalhe explica a nota; não a recalcula.
- Balcão e ligação: continuam não verificáveis.

## 4. O que a IA passa a devolver

Um objeto `mec_detalhe`, só quando `tipo_conversa = 'negociacao'` (senão
`null`). Os códigos (`sondagem_a`, `preco_alto`, `algo_mais`, `direto`…) **vêm do
playbook vigente** no banco (`playbook_itens.chave`), não do código: quando o
Book 2 mudar os itens, a análise acompanha sem deploy.

```ts
mec_detalhe: {
  sondagem: {
    aplicavel: boolean,                       // espelha mec[sondagem].aplicavel
    itens: { chave: ChaveInformacao, capturada: boolean, trecho: string | null }[],  // exatamente os 7 do playbook
    perguntas_abertas: number,                // perguntas do vendedor que pedem relato
    perguntas_fechadas: number,               // perguntas de sim/não ou de escolha
  },
  solucao_completa: {
    complementares_oferecidos: { produto: string, trecho: string }[],   // nomeado pelo vendedor
    prazo_informado: boolean, condicao_informada: boolean,
    frases_proibidas: { chave: ChaveFraseProibida, trecho: string }[],  // cada ocorrência
  },
  objecoes: {
    codigo: ChaveObjecao | 'fora_do_catalogo',
    descricao: string,                        // como o cliente disse, resumido
    trecho: string,
    cachorro: boolean, papagaio: boolean, minhoca: boolean,
    ordem_correta: boolean,                   // os presentes vieram nessa ordem
    concordou_ou_criticou: boolean,           // o que o Book proíbe
    minhoca_do_catalogo: boolean | null,      // null quando não houve minhoca
  }[],
  preco: {
    desconto_mencionado: boolean, trecho_desconto: string | null,
    mencionou_gerencia: boolean,
    orcamento_concorrente: boolean,           // cliente trouxe orçamento rival
    conferiu_orcamento: boolean | null,       // itens/prazo/frete; null se não houve orçamento
  },
  fechamento: {
    tentou: boolean,
    tecnica: ChaveTecnica | 'outra' | null,   // 'direto' | 'opcoes' do playbook
    trecho: string | null,
    final_positivo: boolean,
  },
}
```

**Regras que vão no prompt**, somadas às atuais:
- Uma informação da sondagem só conta como capturada com trecho. "Capturar"
  inclui o cliente contar sem ser perguntado (o Book pede ter a informação, não
  a pergunta).
- Frase proibida conta cada ocorrência literal dita pelo vendedor, não pelo
  cliente nem por mensagem `[automática]`.
- Objeção fora das 8 vira `fora_do_catalogo` com `descricao`. Não força a
  entrada no código mais próximo.
- `ordem_correta` considera só os passos presentes (cachorro → papagaio →
  minhoca).
- As seções de contorno e preço estão marcadas como **provisórias** no Book;
  medir, mas não inventar critério além do que o texto diz.

**Esquema dinâmico.** O JSON Schema (modo `strict`) é montado por uma função
pura `schemaAnalisePara(playbook)`, com os `enum` das chaves lidos do playbook.
Assim a própria OpenAI rejeita código inexistente. O Zod equivalente sai da
mesma função. Sem playbook vigente, `mec_detalhe` fica fora do schema, como
hoje.

**Uma chamada só.** O bloco entra na mesma chamada da análise; não se abre uma
segunda. Estimativa: +300 a +500 tokens de saída por negociação, cerca de
US$ 0,0006 a mais por conversa ao preço atual do gpt-4.1-mini. Os tokens reais
são medidos no piloto (§9) pelas colunas `tokens_saida` e `custo_estimado`.

## 5. Onde fica gravado

### 5.1 Tabela nova `mec_observacoes` (fonte das agregações)

Uma linha por **sinal observado**, para agregar com SQL simples e a mesma RLS
de `aderencia_conversa`:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `conversa_id`, `user_id`, `unidade_id`, `data_ref`, `playbook_id` | como em `aderencia_conversa` | |
| `etapa` | text | chave da etapa |
| `sinal` | text | `sondagem_item`, `pergunta_aberta`, `pergunta_fechada`, `complementar`, `prazo`, `condicao`, `frase_proibida`, `objecao`, `desconto`, `gerencia`, `orcamento_concorrente`, `fechamento`, `final_positivo` |
| `item_chave` | text null | chave do playbook (`sondagem_b`, `preco_alto`, `algo_mais`, `direto`) ou `fora_do_catalogo` |
| `valor` | boolean null | capturada/presente/tentou |
| `detalhe` | jsonb | `{cachorro, papagaio, minhoca, ordem_correta, concordou_ou_criticou, minhoca_do_catalogo, descricao, produto, contagem}` conforme o sinal |
| `trecho` | text null | evidência literal |

Índices: `(user_id, data_ref)`, `(unidade_id, data_ref)`, `(sinal, item_chave, data_ref)`.
Gravação: o worker apaga as linhas de `(conversa_id, data_ref)` e insere as
novas, na mesma transação lógica do upsert de `aderencia_conversa` (as duas
coisas mudam juntas quando a conversa é reanalisada).

`aderencia_conversa.itens` continua recebendo o que já recebe (lista livre),
para não quebrar telas nem análises antigas.

### 5.2 Rollup diário (`aderencia_diaria`)

- `sondagem_itens` muda de `smallint` para `numeric(3,1)`: média de informações
  capturadas por conversa **em que a sondagem era aplicável**. Continua `null`
  quando nenhuma era.
- `frases_proibidas`: total de ocorrências no dia.
- Coluna nova `detalhe jsonb`:
  `{ sondagem_por_item: {sondagem_a: %, …}, perguntas_abertas_pct, objecoes: {codigo: n}, fora_do_catalogo: n, contorno_completo_pct, concordou_ou_criticou: n, desconto_mencionado: n, fechamento: {direto: n, opcoes: n, outra: n, nenhum: n}, final_positivo_pct }`.
- Toda a conta é TS puro numa função nova `resumirObservacoes(linhas)` em
  `lib/mec.ts`, testada, sem chamada de IA (mesma regra do resto do rollup).

## 6. Telas

| Tela | O que muda |
|---|---|
| `/conversas/[id]`, bloco "MEC nesta conversa" | Cada etapa ganha seu checklist: sondagem com as 7 informações (✓/✕ + trecho no hover/toque); objeções com código do catálogo e os 3 passos (●●○); frases proibidas destacadas; técnica de fechamento. Etapas de seção provisória levam o selo "seção do Book em revisão". |
| `/meu-mec` (vendedor) | Topo com "Sondagem: 3,4 de 7 informações por conversa". As 7 informações em barras (% das conversas em que capturou), com a mais esquecida em destaque e um exemplo de pergunta tirado do Book. Contador de "Algo mais?" com os trechos. Perguntas abertas × fechadas. |
| `/equipe/mec` (gestor) | A matriz vendedor × etapa ganha uma segunda matriz **vendedor × informação da sondagem**: coluna fraca = treino coletivo; linha fraca = conversa individual (doc 7 §7.7). |
| `/equipe`, "Objeções da semana" | Passa a contar por **código do catálogo** (`mec_observacoes`), com "fora do catálogo" separado. O `contarObjecoes` por texto livre fica só como fallback para dias anteriores ao corte. |
| `/mec` (supervisor) | Colunas novas por unidade: sondagem média, % de contorno completo e distribuição do tipo de fechamento. |

Regras de apresentação: número com contexto, ausência como ausência ("sem
conversa com sondagem aplicável"), cor sempre com texto, tudo em `components/ui`.

## 7. Transição e reprocessamento

- A partir do deploy, as análises novas trazem `mec_detalhe`. As antigas
  ficam sem ele, e as telas mostram "sem detalhe do MEC para este dia" em vez de
  zero.
- Um corte de data (`MEC_DETALHE_DESDE`, gravado em configuração) evita
  misturar dias com e sem detalhe numa mesma média.
- Reprocessar dias antigos usa a ação que já existe no admin
  (`reprocessarDia`). Quanto reprocessar é decisão do usuário (§10).

## 8. Qualidade da medição

- **Calibração antes de ligar para a rede.** 20 conversas reais de negociação,
  marcadas à mão por um gestor, e comparadas com a IA item a item. O critério
  de liberação é ≥ 85% de concordância nos 7 itens da sondagem e no código da
  objeção. Abaixo disso, ajusta o prompt, e não a régua.
- A contestação continua por etapa (fluxo atual). O motivo pode citar o item
  ("a sondagem_b foi dita na linha 12"), e o supervisor usa isso como
  calibração.
- Testes unitários (`node --test`):
  - `schemaAnalisePara` gera os `enum` do playbook e rejeita chave estranha;
  - a normalização `mec_detalhe → linhas de mec_observacoes` cobre todos os sinais e ignora `null`;
  - `resumirObservacoes` cobre média da sondagem só sobre aplicáveis, contagem de frases, objeções por código, % de contorno completo e dia sem negociação → `null`;
  - fixture de resposta real da IA passando pelo Zod.

## 9. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 · Dados | migration (`mec_observacoes` + RLS, `aderencia_diaria.detalhe`, tipo de `sondagem_itens`), `schemaAnalisePara`, prompt, gravação e rollup | testes verdes; uma conversa real reanalisada em staging grava todos os sinais |
| 2 · Piloto | liga em 1 unidade, calibração das 20 conversas, medição de custo | concordância ≥ 85% e custo medido |
| 3 · Telas | conversa, Meu MEC, Equipe/MEC, Objeções por código, /mec | conferidas a 390 e 1440 |
| 4 · Rede | liga para todas as unidades; reprocessamento decidido em §10 | painel de custo dentro do previsto |

## 10. Decisões que são suas

1. **Reprocessar o histórico?** Nenhum, os últimos 14 dias ou tudo. Custa uma análise inteira por conversa reprocessada (o custo real sai do painel do admin depois do piloto). Recomendação: **14 dias**, o bastante para as telas nascerem com tendência.
2. **Quem marca as 20 conversas de calibração?** Recomendação: um gestor que conheça bem o Book, com uma planilha que eu preparo a partir das conversas reais.
3. **Unidade piloto.** Recomendação: a de maior volume de negociação, para a calibração sair rápida.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| A IA marca "capturada" sem prova | O trecho é obrigatório no schema; `capturada: true` com `trecho: null` é descartado na normalização e conta como não capturada |
| Seções provisórias do Book geram contestação justa | Selo "em revisão" nas telas; o supervisor vê as contestações por item |
| Schema maior deixa a resposta mais lenta e cara | Medido no piloto; `max_output_tokens` sobe de 6000 só se necessário |
| Objeção "fora do catálogo" vira lixeira | A descoberta semanal já agrupa essas objeções. Se passarem de 30% das objeções, é sinal para revisar o catálogo, não o prompt |
