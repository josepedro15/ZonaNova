# 7. Aderência ao MEC e descoberta de práticas

> Fonte: **MEC — Modelo de Execução Comercial · Book 1: Do atendimento ao
> fechamento** (Grupo Zona Nova / Redemac, 2026). 18 páginas.

Este módulo responde a duas perguntas que o resto do sistema não responde:

1. **O pessoal está seguindo o que os gestores determinaram?**
2. **O que funciona que o MEC ainda não diz?**

São perguntas diferentes e precisam de mecânicas diferentes. A primeira é
medição contra um padrão conhecido. A segunda é mineração do que escapa do
padrão — e é ela que alimenta a próxima versão do Book.

## 7.1 O padrão, destrinchado

O MEC define seis etapas mais o acompanhamento. Para cada uma, o que dá para
observar numa conversa de WhatsApp:

| # | Etapa | O que o MEC manda | Sinal observável no WhatsApp |
|---|---|---|---|
| 1 | **Acolhida** | Cumprimentar, sorriso, assunto leve | Saudação presente; tom cordial; primeira resposta humana |
| 2 | **Sondagem** | Capturar 7 informações, com perguntas abertas | Quantas das 7 foram capturadas; proporção de perguntas abertas vs. fechadas |
| 3 | **Solução completa** | Oferecer complementares específicos; informar entrega e condição | Complementar nomeado; **frase proibida** ("algo mais?", "que mais?"); prazo e condição informados |
| 4 | **Contorno de objeções** | Cachorro → Papagaio → Minhoca; nunca concordar nem criticar | Os três passos presentes e na ordem; qual minhoca do catálogo; concordância ou crítica à objeção |
| 5 | **Estratégia de preço** | Alçada, orçamento do concorrente à gerência, regra de ouro | Desconto concedido; menção a gerência; conferência de itens/prazo/frete do orçamento rival |
| 6 | **Fechamento** | Dar a machadada: fechamento direto ou limitação de opções | Pergunta de fechamento presente e de qual tipo; mensagem final positiva |
| 7 | **Acompanhamento** | Contato no turno seguinte, de preferência ligação | Houve retorno do vendedor no turno seguinte? |

### As 7 informações da sondagem

`a` o que constrói · `b` etapa da obra · `c` andamento e prazo · `d` orientação
profissional · `e` compra todas as categorias conosco · `f` fluxo financeiro
(preço ou condição) · `g` uso pretendido do produto.

Cada uma vira um booleano com evidência. O agregado "sondagem" é `capturadas/7`
— e é provavelmente a métrica mais acionável do sistema inteiro, porque é
específica, contável e diretamente treinável.

### As 8 objeções catalogadas

Preço alto · preço maior que concorrente · confiança abalada · "vou pensar" ·
"na internet é mais barato" · "só se entregar hoje" · "já tenho permuta" · "meu
pedreiro só usa outra marca".

Objeção que aparece e **não** cai em nenhuma das 8 é sinal de lacuna no Book —
vai para a §7.4.

## 7.2 A regra que torna a medição honesta

**Nem toda etapa se aplica a toda conversa.**

Cliente que pergunta "vocês abrem sábado?" não tem sondagem a fazer. Cliente
que fecha na primeira mensagem não tem objeção a contornar. Se o sistema
cobrar as 6 etapas de todo mundo, a nota vira ruído e o vendedor para de
acreditar nela na primeira semana.

Então cada etapa é avaliada em dois eixos:

- **Aplicável** — essa etapa cabia nesta conversa? (`sim` / `não`)
- **Aplicado** — o vendedor fez? (`sim` / `parcial` / `não`)

E a aderência é `aplicadas ÷ aplicáveis`, nunca `aplicadas ÷ 6`.

Três consequências de desenho:

- Conversa classificada como `social` ou `suporte` não entra na aderência,
  pela mesma razão que não entra na nota de atendimento.
- Etapa marcada `não aplicável` precisa de justificativa da LLM, senão vira a
  saída fácil para tudo.
- O gestor pode contestar uma marcação. Contestação vira dado de calibração
  (§7.6), não discussão perdida no WhatsApp.

## 7.3 O que dá para cruzar — e o que não dá

O sistema vê **só o WhatsApp**. A Zona Nova vende muito no balcão, e o MEC foi
escrito para o atendimento presencial tanto quanto para o remoto. Isso precisa
estar dito em voz alta no produto, não escondido:

- **Acolhida** no WhatsApp é uma sombra da acolhida presencial. Medir, sim;
  tratar como retrato do atendimento da pessoa, não.
- **Acompanhamento** o MEC pede "de preferência por ligação". O sistema não vê
  ligação. Então ele mede o que vê — retorno por WhatsApp no turno seguinte — e
  registra como **não verificável** quando não houve mensagem. Nunca marcar como
  descumprimento o que pode ter sido uma ligação.
- **Alçada de desconto** o sistema vê o desconto mencionado na conversa, não o
  aplicado no Carrinho. Cruzar com o ERP resolveria isso de verdade — está na
  lista de pendências (§7.7).

Um indicador que mente para cima é pior do que não ter indicador.

## 7.4 A camada de descoberta (o que o MEC ainda não diz)

Medir aderência é olhar para trás. Esta camada olha para frente: encontra
prática que funciona e ainda não virou padrão, e padrão que não está
funcionando.

Roda **semanalmente** (não diariamente — precisa de volume), sobre as análises
já produzidas. Quatro buscas:

| Busca | Pergunta | O que produz |
|---|---|---|
| **Fora do script que deu certo** | Conversas que converteram com aderência baixa — o que o vendedor fez no lugar? | Candidatas a prática nova |
| **No script que deu errado** | Conversas com aderência alta que não converteram — onde o MEC falhou? | Pontos de revisão do Book |
| **Objeção fora do catálogo** | Objeções frequentes que não caem nas 8 | Lacunas do capítulo 4 |
| **Minhoca inventada** | Reversões que o vendedor criou e que precederam fechamento | Candidatas ao catálogo de minhocas |

Cada descoberta nasce com: hipótese em uma frase, quantas conversas a
sustentam, taxa de conversão com e sem, e **3 a 5 trechos reais** como prova.
Sem os trechos, é palpite com cara de dado.

### Correlação: quais etapas realmente pagam

Além das quatro buscas, um cruzamento fixo: para cada etapa, a taxa de
conversão quando ela foi aplicada vs. quando não foi, nas conversas onde ela
era aplicável. Isso responde a pergunta que o supervisor vai fazer cedo ou
tarde — *quais partes do MEC valem o esforço, nos nossos dados?*

**Correlação não é causa** e a tela precisa dizer isso. Vendedor bom aplica
mais o MEC e converte mais; parte do efeito é a pessoa, não a etapa. Serve para
levantar hipótese e priorizar treino, não para cortar um capítulo do Book.

### O ciclo

```
  conversas → aderência → descobertas → supervisor avalia
                                              │
                              ┌───────────────┴───────────────┐
                         descartada                    aprovada
                                                            │
                                                   vira MEC v(n+1)
                                                            │
                                      aderência passa a medir contra a nova
```

Descoberta aprovada só entra em vigor na próxima versão do playbook — e
aderência medida na v1 não é comparável com a v2. Por isso o playbook é
versionado no banco (§7.5) e toda linha de aderência aponta para a versão sob a
qual foi medida.

## 7.5 Dados

Somam-se ao modelo da [§2](02-modelo-de-dados.md):

- **`playbooks`** — versão do MEC. `versao`, `nome`, `vigente_de`, `vigente_ate`.
- **`playbook_etapas`** — as 6+1 etapas de uma versão: `chave` (`acolhida`,
  `sondagem`, …), `nome`, `peso`, `descricao`, `criterios jsonb`. É daqui que o
  prompt é montado — a doutrina mora no banco, não hardcoded no código.
- **`playbook_itens`** — os itens verificáveis dentro de uma etapa: as 7
  informações da sondagem, as 8 objeções, as frases proibidas, as técnicas de
  fechamento. `tipo` (`informacao` | `objecao` | `frase_proibida` | `tecnica`).
- **`aderencia_conversa`** — uma linha por conversa por etapa: `aplicavel`,
  `aplicado` (`sim`/`parcial`/`nao`), `justificativa`, `evidencias jsonb`,
  `itens jsonb` (quais dos 7, qual das 8, qual minhoca), `playbook_versao`.
- **`aderencia_contestacoes`** — gestor discorda de uma marcação: quem, qual,
  por quê, e o veredito depois da revisão.
- **`descobertas`** — saída da §7.4: `tipo`, `hipotese`, `conversas_suporte`,
  `conversao_com`, `conversao_sem`, `evidencias jsonb`, `status`
  (`nova`/`em_analise`/`aprovada`/`descartada`), `avaliada_por`, `virou_versao`.

Os agregados de aderência por vendedor, unidade e rede seguem a mesma regra do
resto: **rollup em SQL**, não nova chamada de LLM.

## 7.6 Pipeline

A [§3](03-pipeline-de-analise.md) ganha duas coisas.

**Na análise individual (etapa 1, diária).** O schema de saída cresce com um
bloco `mec`: para cada etapa, `aplicavel`, `aplicado`, `justificativa`,
`evidencias`, e os itens específicos. O prompt passa a ser montado a partir de
`playbook_etapas` + `playbook_itens` da versão vigente, não escrito à mão.

Isso encarece a chamada — o prompt cresce e a saída dobra de tamanho. Duas
defesas: o bloco de doutrina é fixo e vai para **prompt caching**; e a medição
de aderência só roda em `tipo_conversa = 'negociacao'`, que é a minoria das
conversas do dia. Medir antes de ligar para a rede inteira.

**Descoberta (semanal).** Job novo, domingo de madrugada. Roda as quatro
buscas sobre a semana, agrupa, e faz uma chamada de LLM por busca recebendo
**os resumos das análises** — nunca os transcripts. Grava em `descobertas`. A
correlação por etapa é SQL puro.

## 7.7 Telas

Acrescentam-se ao [mapa](05-mapa-de-telas.md):

- **Vendedor · Meu MEC** — as 7 etapas com o que ele aplicou e o que deixou
  passar hoje, com o trecho da conversa ao lado. É a tela que transforma "sua
  nota caiu" em "você não perguntou em que etapa a obra está, em 9 de 11
  atendimentos".
- **Gestor · Aderência da unidade** — matriz vendedor × etapa. Onde a unidade
  inteira falha (coluna fraca) é problema de treino; onde uma pessoa falha
  (linha fraca) é conversa individual. Fila de contestações aqui.
- **Supervisor · O MEC está pegando?** — aderência por unidade, evolução desde
  a última versão do Book, e o cruzamento etapa × conversão.
- **Supervisor · Descobertas** — a fila do §7.4: hipótese, força da evidência,
  trechos, e os botões de aprovar ou descartar. É a porta de entrada do Book 2.

## 7.8 Pendências

| Assunto | Precisa de |
|---|---|
| Book 2 e seguintes | O PDF fala em "alguns elementos"; só temos o Book 1 |
| Duas seções incompletas | "Estratégia de preço" está marcada *página não editada* e o contorno de objeções *no aguardo de reforço* — medir contra texto provisório gera contestação justa |
| Cruzamento com ERP | Desconto real, ticket, mix de categorias, conversão de orçamento — hoje o sistema só vê o que foi dito na conversa |
| Atendimento presencial | O MEC cobre o balcão; o sistema só vê WhatsApp. Definir se isso é aceito como recorte ou se entra áudio de loja mais adiante |
| Alçada por vendedor | Para medir estouro de alçada, o sistema precisa saber a alçada de cada um |
| Peso das etapas | Todas valem igual na nota de aderência? O MEC não diz |
