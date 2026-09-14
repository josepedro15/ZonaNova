# 1. Produto e escopo

## 1.1 O problema

A Zona Nova tem vários vendedores espalhados por unidades, cada um atendendo
clientes pelo WhatsApp comercial próprio. Hoje ninguém sabe, com evidência, o que
acontece dentro dessas conversas: quem conduz bem, quem deixa lead no vácuo, que
objeção derruba a venda, qual unidade está abaixo da média e por quê.

## 1.2 O que o sistema faz

1. O vendedor se cadastra, escolhe a unidade onde trabalha e conecta o WhatsApp
   comercial dele lendo um QR Code.
2. A partir daí, toda mensagem trocada (entrada e saída) é recebida por webhook e
   gravada.
3. Todo fim de dia, um processo automático monta as conversas do dia, manda cada
   uma para a LLM analisar, e depois gera um consolidado do vendedor.
4. Os números sobem a hierarquia: vendedor → unidade → rede.
5. Cada nível tem seu dashboard.

## 1.3 Papéis e hierarquia

```
                        ┌───────────────┐
                        │  SUPERVISOR   │   vê tudo, todas as unidades
                        └───────┬───────┘
                ┌───────────────┼───────────────┐
          ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
          │  GESTOR   │   │  GESTOR   │   │  GESTOR   │   vê a(s) unidade(s) dele
          │ Unidade A │   │ Unidade B │   │ Unidade C │
          └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
          │ VENDEDORES│   │ VENDEDORES│   │ VENDEDORES│   vê só a si
          └───────────┘   └───────────┘   └───────────┘
```

| Papel | Escopo de leitura | Pode |
|---|---|---|
| `vendedor` | só os próprios dados | conectar/desconectar o WhatsApp dele, ver as próprias conversas e notas, marcar contato como bloqueado (privado) |
| `gestor` | todos os vendedores das unidades sob ele | aprovar cadastros pendentes da unidade, ver conversa individual de qualquer vendedor dele, comparar vendedores, receber o resumo diário da unidade |
| `supervisor` | toda a rede | tudo do gestor em qualquer unidade + criar/editar unidades, promover gestores, ver ranking de unidades |
| `admin` | técnico | gerir integrações, reprocessar análises, ver fila e erros |

**Decisões:**

- Um gestor pode cobrir **mais de uma unidade** (tabela de ligação, não coluna
  única). É barato agora e evita migração depois.
- Um vendedor pertence a **uma** unidade por vez. Transferência de unidade é uma
  ação do gestor/supervisor e preserva o histórico (o dado analisado guarda a
  unidade vigente na data).
- `supervisor` e `admin` são separados de propósito: o supervisor é um cargo do
  negócio, o admin é quem mexe em token, fila e reprocessamento.

## 1.4 Fluxo de entrada (onboarding)

```
  cadastro (nome, e-mail, senha, telefone)
        ↓
  escolhe a UNIDADE numa lista
        ↓
  status = pendente ──────────────► tela "aguardando aprovação"
        ↓  (gestor da unidade aprova)
  status = ativo
        ↓
  tela de conexão do WhatsApp (QR Code)
        ↓
  conectado → dashboard
```

**Por que aprovação:** cadastro aberto sem barreira coloca gente na unidade
errada e polui o número da unidade no relatório do supervisor. A aprovação é um
clique do gestor e resolve isso. Enquanto está pendente, o usuário loga mas só vê
a tela de espera — nada é ingerido.

Se a unidade escolhida ainda não tem gestor, o pedido cai para o supervisor.

## 1.4-A O padrão comercial da casa: o MEC

A Zona Nova (Redemac) tem um **Modelo de Execução Comercial** escrito — o MEC,
Book 1: *Do atendimento ao fechamento*. Ele define seis etapas de venda mais o
acompanhamento, e é a diretriz oficial da rede.

O sistema não só analisa a conversa: ele **mede se o MEC está sendo seguido**, e
minera o que funciona fora dele para alimentar a próxima versão do Book. Isso
tem doc próprio — [§7](07-aderencia-mec.md) — porque muda o schema da análise, o
modelo de dados e três telas.

## 1.5 Regras de negócio da análise

Herdadas do MetricsIA (doutrina já validada em produção) e mantidas:

- **Classificação obrigatória da conversa** em `negociacao` / `suporte` /
  `social`. Só `negociacao` entra na nota de atendimento do dia.
- **Nota de atendimento ≠ humor do cliente.** São dois números distintos:
  `score_atendimento` (qualidade do que o vendedor fez) e `sentiment` (satisfação
  do cliente).
- **Zero invenção.** Toda conclusão precisa de trecho do transcript que a
  sustente (campo `evidencias`).
- **Mensagem automática não é o vendedor.** Template/bot de triagem nunca conta
  como mérito nem como culpa — mas o relógio de demora continua correndo.
- **Imagem e documento não são lidos pela LLM.** Nunca concluir "não houve
  comprovante" por causa de uma imagem ilegível.
- **Transferir para especialista não é erro.** É condução legítima; só pontua
  negativo quando mal executada.
- **Disparo em massa e aniversário** não entram na nota (poluem a média).
- `sem_resposta` só quando a última mensagem é do cliente.

## 1.6 Fora de escopo na v1

- Envio de mensagem pelo sistema (é leitura/análise, não um CRM).
- Billing, planos, limites por assinatura.
- Site público / marketing / SEO / blog.
- Módulo de academia e biblioteca de scripts (fica para uma fase futura — o
  modelo de dados não impede).
- Meta Cloud API (WABA). A v1 é só UAZAPI por QR.

## 1.7 Métricas do produto

O que precisa aparecer, por nível:

**Vendedor (dia e período)** — nota geral, leads atendidos, conversas por tipo,
conversões confirmadas, oportunidades perdidas, tempo médio de resposta, taxa de
resposta, top 3 melhorias, elogio do dia, desafio de amanhã, leads pendentes
(cliente falou por último e ninguém respondeu).

**Gestor (unidade)** — nota média da unidade, ranking dos vendedores, volume por
vendedor, objeções mais frequentes na unidade, alertas (conversa em risco,
cliente sem resposta há X), vendedores sem WhatsApp conectado, evolução da
unidade no período.

**Supervisor (rede)** — ranking de unidades, nota da rede, série histórica,
comparativo entre unidades nos mesmos indicadores, drill-down até o vendedor e
até a conversa, saúde das conexões (quantos números caíram).
