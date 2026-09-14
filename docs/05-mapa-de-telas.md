# 5. Mapa de telas

Briefing para a fase de design (Claude Design). Cada tela abaixo tem: quem vê, o
que decide, e o que precisa estar na tela para essa decisão acontecer.

## 5.1 Fluxo de navegação

```
  /cadastro ──► /aguardando-aprovacao ──► /conectar ──► /dashboard
      │                                                    │
      └─ /login ───────────────────────────────────────────┤
                                                           ├─► /conversas/[id]
                                          (gestor) ────────┼─► /equipe
                                                           │      └─► /equipe/[vendedor]
                                       (supervisor) ───────┼─► /unidades
                                                           │      └─► /unidades/[id]
                                            (admin) ───────┴─► /admin
```

## 5.2 Telas

### 1. Cadastro — `/cadastro`
Nome, e-mail, telefone, senha e **seleção da unidade** (o campo que define todo o
resto). Unidade como busca/select, não lista solta — a rede cresce.
*Estado a desenhar:* erro de e-mail já cadastrado.

### 2. Aguardando aprovação — `/aguardando-aprovacao`
Tela de espera. Mostra a unidade escolhida, quem vai aprovar e o que fazer se
errou a unidade (botão "não é minha unidade" → volta a escolher). Sem menu, sem
dashboard vazio ao fundo.

### 3. Conectar WhatsApp — `/conectar`
A tela mais crítica do onboarding: se ela falhar, o sistema não tem dado.

- QR Code grande, com contagem regressiva e renovação automática ao expirar
- Passo a passo do celular (Aparelhos conectados → Conectar aparelho)
- Estados: `gerando QR` · `aguardando leitura` · `conectado ✓` · `erro/expirado`
- Depois de conectado: número conectado, status e botão de desconectar
- Aviso de monitoramento (LGPD, §4.8) visível aqui, antes de conectar

### 4. Dashboard do vendedor — `/dashboard`
*Decide:* o que eu faço hoje de diferente.

- Cabeçalho: nota do dia + variação vs. média dos 7 dias
- Linha de KPIs: leads atendidos · conversões · oportunidades perdidas · tempo
  médio de resposta · taxa de resposta
- **Coaching do dia** em destaque: top 3 melhorias, elogio, desafio de amanhã
- **Leads pendentes**: cliente falou por último e ficou sem resposta — lista
  acionável, ordenada por tempo parado
- Gráfico de evolução da nota (14/30 dias)
- Lista de conversas do dia com tipo, nota e status
- *Estado vazio:* "sem movimento hoje" — nunca mostrar nota zero por ausência

### 5. Conversa + análise — `/conversas/[id]`
Duas colunas: transcript à esquerda (bolhas, mídia marcada, áudio com
transcrição, mensagem automática visualmente distinta) e análise à direita
(scores, resumo, objeções, técnicas, erros, próxima ação, script sugerido).

As **evidências** devem destacar o trecho correspondente no transcript ao passar
o mouse. É o que separa "a IA disse" de "a IA mostrou".

### 6. Equipe da unidade — `/equipe` (gestor)
*Decide:* com quem eu falo hoje.

- KPIs da unidade no topo + comparação com a média da rede
- **Tabela de vendedores** ordenável: nota, volume, conversões, tempo de
  resposta, status da conexão, tendência (subindo/caindo)
- **Alertas** no topo: número caído, vendedor sem movimento, conversa em risco
- **Cadastros pendentes** de aprovação — badge no menu, não escondido
- Objeções mais frequentes na unidade

### 7. Vendedor (visão do gestor) — `/equipe/[vendedor]`
Mesmo conteúdo do dashboard do vendedor, em modo leitura, com histórico e
comparação com a média da unidade. Espaço para o gestor registrar uma observação
(fica visível ao vendedor — feedback escondido não é gestão).

### 8. Rede — `/unidades` (supervisor)
*Decide:* qual unidade precisa de mim.

- Nota da rede + série histórica
- **Ranking de unidades** com todos os indicadores lado a lado e variação no período
- Gráfico comparativo entre unidades (permitir escolher o indicador)
- Saúde das conexões da rede (quantos números conectados de quantos)
- Drill-down: unidade → vendedor → conversa, sem trocar de contexto

### 9. Unidade (visão do supervisor) — `/unidades/[id]`
Idêntica à tela 6, para qualquer unidade. Uma tela só, dois papéis.

### 10. Admin — `/admin`
Fila (pendente/processando/falhou com o erro), custo de LLM por dia/unidade/
vendedor, reprocessamento, gestão de unidades e papéis, log de `eventos_admin`.

### 11-14. Telas do módulo MEC

Detalhadas em [§7.7](07-aderencia-mec.md):

- **Vendedor · Meu MEC** — as 7 etapas do dia, o que aplicou e o que passou, com
  o trecho ao lado. Transforma "sua nota caiu" em "você não perguntou em que
  etapa a obra está, em 9 de 11 atendimentos".
- **Gestor · Aderência da unidade** — matriz vendedor × etapa. Coluna fraca é
  treino coletivo; linha fraca é conversa individual. Fila de contestações.
- **Supervisor · O MEC está pegando?** — aderência por unidade, evolução desde a
  última versão do Book, cruzamento etapa × conversão.
- **Supervisor · Descobertas** — hipótese, força da evidência, trechos, aprovar
  ou descartar. É a porta de entrada do Book 2.

## 5.3 Diretrizes de design

- **Português do Brasil**, linguagem de vendas, não de software.
- **Uma decisão por tela.** Se o gestor abre `/equipe` e não sabe com quem falar,
  a tela falhou.
- **Nota sempre com contexto** (variação, média, tendência). Número solto não diz
  se é bom.
- **Tom de treino, não de punição** — a doutrina §1.5 vale para a interface
  também. O vendedor abre isso todo dia.
- **Cores semânticas por token** (`--primary`, `--success`, `--warning`,
  `--destructive`), nunca hex solto.
- **Mobile importa**: o vendedor vai abrir no celular, entre um atendimento e
  outro. Dashboard e conversa precisam funcionar em ~390px.
- **Estado vazio é tela de verdade**: primeiro dia, sem conversa, sem conexão,
  aguardando primeiro relatório.

## 5.4 Prioridade de desenho

1. `/conectar` (bloqueia todo o resto)
2. `/dashboard` do vendedor (uso diário, maior volume)
3. `/equipe` (é onde o sistema vira gestão)
4. `/conversas/[id]` (é onde o sistema prova o que afirma)
5. `/unidades`
6. `/cadastro` + `/aguardando-aprovacao`
7. `/admin`

As quatro telas do MEC entram depois de `/equipe` — a de vendedor junto com o
dashboard, a do gestor logo em seguida.
