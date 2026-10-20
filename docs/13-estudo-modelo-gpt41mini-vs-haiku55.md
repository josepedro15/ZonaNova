# Modelo da análise: manter o GPT-4.1 mini ou ir para o Claude Haiku 5.5?

Estudo de 11/10/2026. Números de uso lidos de `analises_conversa` em produção
(últimos 28 dias, só leitura).

## Resposta curta

**Pelo preço, a troca não vale o trabalho. O que pode justificar a troca é a
qualidade, e isso a gente mede antes de decidir.** O Haiku 5.5 sai de 2 a 3
vezes mais barato por análise, mas a conta inteira hoje fica abaixo de US$ 20
por mês: a economia é de US$ 7 a 12 por mês. O ganho que importa seria o
modelo seguir melhor as regras do prompt. O código está cheio de conferências
que existem porque o GPT-4.1 mini "não seguia nem com a regra no prompt"
(`lib/analise.ts`), e a calibração de 07/10 parou em 106/132. A decisão sai
de rodar a mesma calibração com o Haiku.

## Onde o modelo é usado hoje

| Chamada | Arquivo | Modelo hoje | Dá para ir para o Claude? |
|---|---|---|---|
| Análise por conversa (o grosso do custo) | `lib/pedido-analise.ts`, `lib/openai-analise.ts` | `gpt-4.1-mini-2025-04-14` | Sim |
| Consolidação do vendedor | `lib/consolidacao.ts` | idem | Sim |
| Descrição de imagem e PDF | `lib/midia.ts` | idem (ou `OPENAI_MODELO_MIDIA`) | Sim (o Haiku lê imagem) |
| Descobertas semanais | `lib/openai-analise.ts` (`descobrirPraticas`) | idem | Sim |
| Transcrição de áudio | `lib/transcricao.ts` | `gpt-4o-mini-transcribe` | **Não**: a Anthropic não tem API de transcrição |

Mesmo trocando tudo, a chave da OpenAI continua por causa do áudio. Vamos ter
dois fornecedores de qualquer jeito.

## Volume e tamanho reais (produção, 28 dias)

- 1.056 análises em 19 dias, todas no `gpt-4.1-mini`. Desde o rollout de
  06/10, são de 150 a 290 por dia.
- Entrada: média de 4.337 tokens (p95 5.174, máx. 6.739).
- Saída: média de 841 tokens (p95 1.090, máx. 1.502).
- Custo gravado: US$ 3,25 no período, cerca de US$ 0,0031 por análise. O
  `custoEstimado` usa o preço cheio e ignora o cache automático da OpenAI,
  então a fatura real tende a ser um pouco menor.

## Custo por análise

Preços: GPT-4.1 mini a US$ 0,40 / 1,60 por milhão de tokens (entrada/saída),
o mesmo de `custoEstimado`. Claude Haiku 5.5 a US$ 0,10 / 0,50 com prompt de
até 100 mil tokens; o nosso tem uns 5 mil. Cache lido custa 0,1× a entrada.

O tokenizer do Haiku 5.5 conta uns 30% a mais de tokens para o mesmo texto,
e a conta abaixo já supõe +30%. O Haiku também "pensa" por padrão, e esse
raciocínio é cobrado como saída.

| Cenário | Entrada | Saída | US$ por análise | US$/mês (6 mil análises) |
|---|---|---|---|---|
| GPT-4.1 mini (hoje) | 4.337 | 841 | 0,0031 | ~18,5 |
| Haiku 5.5, sem raciocínio | ~5.640 | ~1.090 | 0,0011 | ~6,7 |
| Haiku 5.5, effort `low` (~500 de raciocínio) | ~5.640 | ~1.590 | 0,0014 | ~8,2 |
| Haiku 5.5, effort `medium`, o padrão (~1.500) | ~5.640 | ~2.590 | 0,0019 | ~11,2 |

Com o cache do prompt fixo (instruções + MEC), cada análise no Haiku sai
mais uns US$ 0,0003 mais barata. A consolidação, a mídia e as descobertas
somam pouco perto da análise e seguem a mesma proporção.

## O que muda no código se trocar (e o que pode quebrar)

1. **Não aceita `temperature: 0`.** No Haiku 5.5, qualquer temperatura
   diferente da padrão dá erro 400. Hoje a gente depende de temperatura 0
   para a análise variar pouco entre rodadas (a calibração já vê de 2 a 3
   conversas mudarem) e para o `RespostaIncompleta` tratar o corte como
   definitivo. Sem ela, a variação tende a subir, e é preciso medir quanto.
2. **O schema estrito aceita menos coisa.** O Claude não garante, na geração,
   `minimum`/`maximum` (as notas 0–100 e a urgência 1–5), `minItems: 7` do
   MEC nem `maxItems` das listas. O `maxItems` da consolidação é justamente a
   defesa contra o loop de itens repetidos de 06/10. Essas regras teriam de
   sair do schema mandado ao modelo e virar conferência no Zod: cortar a
   lista e limitar a nota, em vez de recusar a resposta.
3. **Raciocínio ligado por padrão.** É preciso escolher o `effort` (`low` ou
   `medium`) ou desligar o raciocínio. Ele entra no `max_tokens` (6.000 na
   análise dá folga; os 300 da mídia, não).
4. **Formato de API diferente.** As quatro chamadas são `fetch` direto na
   Responses API da OpenAI. Elas teriam de passar por um adaptador para a
   Messages API (`system`, `output_config.format`, `stop_reason` no lugar de
   `status: incomplete`, `usage` com outros nomes), além de nova chave
   `ANTHROPIC_API_KEY` na Vercel (pelo painel), `custoEstimado` por modelo e
   o `modelo` gravado.
5. **Recusas.** O Haiku 5.5 tem classificadores de segurança sem fallback no
   servidor. Em conversa de loja de material de construção o risco é baixo,
   mas o worker precisaria tratar `stop_reason: "refusal"` como falha do
   item.

Estimativa: de 1 a 2 dias para trocar com testes, sem contar a calibração.

## O que pesa a favor de cada um

**Manter o GPT-4.1 mini**
- Tudo calibrado nele: prompt, conferências e gabarito de 07/10.
- Temperatura 0 e schema estrito completo (min/max/itens).
- Zero trabalho, e a conta já é pequena.

**Ir para o Haiku 5.5**
- Modelo bem mais novo (o GPT-4.1 mini é de abril de 2025), com seguimento
  de instrução muito melhor, que é o nosso ponto fraco documentado.
- De 2 a 3× mais barato por análise, e o cache entra a partir de 512 tokens.
- Contexto de 1M e saída de até 128 mil tokens (não precisamos disso hoje).

## Recomendação

1. **Não trocar agora pelo preço.** A economia é de ~US$ 10 por mês.
2. **Fazer um teste lado a lado com a calibração que já existe**
   (`npm run analise:calibracao`): as mesmas 66 conversas do gabarito e as 53
   de controle, em 2 rodadas, com o Haiku 5.5 em effort `low` e `medium`. O
   script tem um ponto só de chamada (`scripts/analise-calibracao.mjs:90`),
   então dá para adaptar em poucas horas. O teste custa menos de US$ 1.
3. **Critério para trocar:** o Haiku precisa bater ou passar os 106/132 do
   gabarito e os 99/106 do controle, sem piorar as categorias 1 (papéis
   invertidos) e 3 (venda não contada), e com variação entre rodadas parecida
   com a de hoje. Se empatar, fica o GPT-4.1 mini, porque a troca custa
   trabalho e risco. Se ganhar com folga, a gente migra primeiro a análise
   por conversa e deixa a transcrição na OpenAI.

## Implementação (16/10/2026)

O Haiku 5.5 está no código só para a análise por conversa, desligado por
padrão: a produção continua no GPT-4.1 mini até a calibração passar.

- `lib/claude.ts`: liga/desliga (`ANALISE_PROVEDOR=anthropic`), effort
  (`ANTHROPIC_EFFORT`, `low` por padrão), schema sem `minimum`/`maximum`/
  `maxItems` para o modelo e os mesmos limites de volta na leitura (nota na
  borda, lista cortada; o MEC sem as 7 etapas continua recusado), leitura do
  texto pelo tipo do bloco, corte (`max_tokens`) como `RespostaIncompleta` e
  recusa como falha do item.
- O MEC vai ao Claude como objeto com as 7 etapas obrigatórias (uma
  definição em `$defs`, referenciada 7 vezes; 7 cópias inteiras dão 400
  "compiled grammar is too large") e volta como a lista de sempre. Como
  lista, sem o `minItems: 7`, o Haiku pulava etapas (3 de 44 na prévia).
- `lib/pedido-analise.ts`: `pedidoAnaliseClaude`, com as mesmas regras (o
  texto para a OpenAI ficou byte a byte o mesmo), sem `temperature`, regras
  em `system` com cache e `max_tokens` 8.000 (o raciocínio conta dentro).
- `lib/openai-analise.ts`: `analisarConversa` desvia para o Claude quando
  ligado, pelo SDK oficial `@anthropic-ai/sdk`. O worker não mudou.
- `custoEstimado` conhece o `claude-haiku-5-5` (US$ 0,10 / 0,50).

### Teste lado a lado (o passo 2 da recomendação)

Pôr `ANTHROPIC_API_KEY` no `.env.local` e rodar, com o mesmo gabarito de 07/10:

```bash
ANALISE_PROVEDOR=anthropic ANTHROPIC_EFFORT=low npm run analise:calibracao -- gabarito.json haiku-low.json 2
ANALISE_PROVEDOR=anthropic ANTHROPIC_EFFORT=medium npm run analise:calibracao -- gabarito.json haiku-medium.json 2
```

Resposta fora do schema, recusa ou corte saem como "puladas" no resumo:
para o critério de troca, cada pulada conta como erro do Haiku.

### Prévia com o gabarito do Silas de 15/10 (11 conversas × 2 rodadas)

| Modelo | Acertos | Custo (22 análises) | Variação entre rodadas |
|---|---|---|---|
| GPT-4.1 mini | 22/22 | US$ 0,087 | nota ±0,5; nenhum status mudou |
| Haiku 5.5 `low` | 22/22 | US$ 0,059 | nota ±4,5; 1 status mudou (lead_frio × em_andamento) |
| Haiku 5.5 `medium` | 21/22 | US$ 0,071 | nota ±8,3; 1 status mudou (a falha: encomenda com "tranquilo então" virou venda) |

Amostra pequena (14 dos 22 são controles): empata, não decide. O custo do
Haiku está superestimado (o cache lido é cobrado cheio em `custoEstimado`).
Cada análise no Haiku levou de 12 a 18 s e ~10 mil tokens de entrada.

### Para ligar em produção (só se passar)

Na Vercel (painel → Settings → Environment Variables): `ANTHROPIC_API_KEY`,
`ANALISE_PROVEDOR=anthropic` e `ANTHROPIC_EFFORT` com o nível que venceu.
Para voltar ao GPT, apagar `ANALISE_PROVEDOR`. Análises já gravadas não mudam.

### Ligado em 20/10/2026, antes da calibração completa

Decisão do usuário: a produção passa para o Haiku 5.5 `low` com base só na
prévia de 15/10 (22/22), sem rodar os 132/106 do gabarito de 07/10. Ficar de
olho na variação de nota entre análises e no status de encomenda com
"tranquilo então", a falha que apareceu no `medium`. Se piorar, apagar
`ANALISE_PROVEDOR` na Vercel volta ao GPT-4.1 mini.
