# 9. Plano para completar o produto

> **Atualização de 21/09/2026:** o plano abaixo foi executado no produto. A
> aplicação agora possui navegação por papel, análise e consolidação via OpenAI,
> dashboards de vendedor/equipe/rede, MEC, descobertas, operação, retenção e
> gestão de conexão/privacidade. A investigação da UAZAPI confirmou suporte ao
> evento `history` e ao download posterior de mídia; ambos foram integrados com
> limites e idempotência. O pipeline foi validado com conversas e nove áudios
> reais, todos transcritos. As decisões externas listadas em P3 continuam fora
> do produto por dependerem de ERP, metas e política comercial ainda não
> fornecidos.

## 9.1 Diagnóstico executivo

O dashboard atual não é a Fase 6 incompleta: ele é uma **fatia provisória,
deliberadamente construída antes da análise**. Mostra apenas o que pode ser
calculado com mensagens brutas — conversas do dia, tempo de resposta, taxa de
resposta e clientes esperando. Isso explica por que a tela parece vazia diante
dos protótipos: nota, conversão, coaching, MEC, evolução, análise por conversa e
visões de gestão dependem de um pipeline que ainda não foi implementado.

O produto está aproximadamente nesta situação:

| Bloco | Estado real |
|---|---|
| Fundação, autenticação, papéis e RLS | implementado e testado |
| Aprovação de cadastro | implementada |
| Conexão por QR e ingestão via webhook | implementadas; falta fechar a experiência de gestão da conexão e validar o ponta a ponta de produção |
| Transcrição de áudio | implementada no worker; depende de chave/configuração e teste real |
| Dashboard operacional sem IA | implementado, mobile e desktop |
| Análise individual por IA | não implementada |
| Fechamento diário e relatório do vendedor | não implementados |
| Conversa com análise e evidências | não implementada |
| Dashboard completo do vendedor | desenhado, mas não implementado |
| Equipe, unidade e rede | desenhados, mas não implementados |
| MEC, contestação e descobertas | schema e telas desenhados; pipeline e aplicação não implementados |
| Admin, retenção e operação | parcialmente modelados; telas e rotinas não implementadas |

Conclusão: **não vale completar o dashboard começando pelos cartões visuais**.
O caminho crítico é fechar o pipeline de análise, porque ele produz quase todos
os dados que faltam à interface.

## 9.2 Fontes usadas e decisões recuperadas

Este plano cruza:

- os documentos 01–08;
- as migrations e políticas de RLS;
- as 22 telas em `design/`;
- o código e os testes atuais;
- o histórico Git;
- as conversas locais do Claude Code associadas a este repositório.

As conversas acrescentaram quatro fatos relevantes:

1. O dashboard atual foi assumido explicitamente como o estado **“antes da
   análise”**, não como a entrega final da Fase 6.
2. Foi pedido suporte real a desktop; portanto, vendedor não deve ser tratado
   como usuário exclusivamente mobile, apesar da decisão inicial do design.
3. Foi manifestada a expectativa de sincronizar histórico logo após conectar.
   A investigação posterior confirmou o evento `history` e o endpoint
   `/message/history-sync`. A ingestão aceita lotes sobrepostos de forma
   idempotente; a interface explica corretamente que a entrega de histórico é
   assíncrona e não é garantida pelo WhatsApp.
4. Depois do redirecionamento automático, a conexão “sumiu” da experiência. O
   status aparece no cabeçalho, mas `/conectar` fica inalcançável enquanto o
   número está conectado e não existe Perfil funcional com número, desconectar
   ou trocar número.

## 9.3 Problemas que devem ser corrigidos antes de ampliar o dashboard

### A. Navegação por papel

Hoje todo usuário ativo cai em `/dashboard`. A mesma página pode consultar, via
RLS, uma pessoa, uma unidade ou a rede inteira, mas apresenta tudo como se fosse
o dia de um vendedor. Isso cria métricas semanticamente erradas para gestor,
supervisor e admin.

Destino correto após login:

| Papel | Entrada |
|---|---|
| vendedor | `/dashboard` |
| gestor | `/equipe` |
| supervisor | `/unidades` |
| admin | `/admin` |

### B. Gestão da conexão

Criar um caminho permanente, preferencialmente `/perfil`, contendo:

- número conectado e desde quando;
- status atual e último evento;
- ação de desconectar;
- ação separada de trocar/reconectar número, com confirmação;
- explicação do que deixa de ser capturado ao desconectar;
- estado de sincronização inicial, caso ela seja tecnicamente suportada;
- contatos bloqueados e aceite de monitoramento/LGPD.

O selo “Conectado” no cabeçalho deve abrir esse detalhe. A ação destrutiva deve
usar as travas já existentes de `systemName = zonanova`, registrar
`eventos_admin` e nunca apagar histórico por padrão.

### C. Contrato da captura inicial

Antes de prometer “sincronização”, executar um spike contra a UAZAPI instalada e
responder:

- existe endpoint real de histórico ou chat sync nessa versão?
- qual janela e quais tipos de mensagem ele devolve?
- como deduplicar contra o webhook por `wa_message_id`?
- ele traz mídia e áudio ainda acessíveis?
- qual o impacto de custo e privacidade?

Se não houver suporte confiável, a interface deve dizer: **“a análise começa a
partir da conexão”**. Se houver, implementar importação assíncrona com progresso,
limite de janela e idempotência antes de abrir o piloto.

### D. Shell de produto

O dashboard atual é uma página isolada. Implementar navegação responsiva por
papel, seguindo os protótipos:

- vendedor: Meu dia, Conversas, Evolução, Meu MEC e Perfil;
- gestor: Minha equipe, MEC, Conversas, Evolução, Aprovações e Configurações;
- supervisor: Rede, MEC, Descobertas, Pessoas e Conversas;
- admin: Fila, Custo, Unidades e papéis, Conexões e Registro de ações.

## 9.4 Ordem de implementação

### Etapa 0 — Fechar a base operacional

**Objetivo:** tornar conexão, navegação e ingestão confiáveis antes de gerar
notas.

Entregas:

1. Redirecionamento inicial por papel.
2. Shell responsivo e Perfil com gestão da conexão.
3. Desconectar e trocar número com auditoria.
4. Spike e decisão sobre importação de histórico.
5. Configurar e validar `OPENAI_API_KEY` para transcrição.
6. Teste ponta a ponta: QR → mensagem de entrada → saída → áudio → banco →
   transcrição.
7. Observabilidade mínima de webhook, cron e conexão, sem gravar conteúdo
   sensível em log.

**Pronto quando:** um vendedor entende qual número está ligado, consegue gerir a
conexão e uma conversa real completa aparece corretamente no banco, sem
duplicação.

### Etapa 1 — Pipeline de análise, o caminho crítico

**Objetivo:** transformar um dia real de mensagens em análise e relatório.

Entregas:

1. `POST/GET /api/cron/fechar-dia`, usando o fuso de São Paulo.
2. Filtros de conversa: bloqueados, grupos, aniversário, disparo sem resposta e
   corte do disparo a partir da primeira resposta do cliente.
3. Montador de transcript compacto, com automática, áudio transcrito e mídia
   não interpretável claramente marcados.
4. Schema estrito da análise individual e cliente OpenAI.
5. Rubrica portada e adaptada: atendimento separado de sentimento, evidência
   obrigatória, transferência legítima e `sem_resposta` somente quando o cliente
   falou por último.
6. Hash de transcript e reaproveitamento de análise idêntica.
7. Worker para `analise_conversa`, além da transcrição já existente.
8. Métricas determinísticas em SQL/código; a IA interpreta, mas não conta.
9. `relatorio_vendedor` com coaching, pontos fortes, três melhorias e desafio.
10. Registro de modelo, tokens e custo.
11. Simulador de custo rodado sobre um dia real antes de ativar em escala.

**Pronto quando:** um dia de um vendedor produz análises reproduzíveis, com
evidências verificáveis e relatório consolidado; reprocessar não duplica nem
cobra novamente sem motivo.

### Etapa 2 — Produto diário do vendedor

**Objetivo:** completar primeiro o fluxo de maior frequência de uso.

Rotas e entregas:

| Rota | Conteúdo |
|---|---|
| `/dashboard` | nota e variação de 7 dias; leads; conversões; perdas; resposta; coaching; MEC resumido; pendências; evolução; conversas |
| `/conversas` | busca e filtros por período, tipo, risco, status e espera |
| `/conversas/[id]` | transcript, mídia/transcrição, análise, MEC, próxima ação e evidência ligada ao trecho |
| `/evolucao` | 7/30/90 dias, comparação com unidade e padrões do período |
| `/perfil` | conexão, bloqueados, preferências e privacidade |
| `/meu-mec` | sete etapas, aplicáveis versus aplicadas e exemplos concretos |

Regras de experiência:

- preservar a fila “Esperando você” no topo da prioridade;
- manter o atalho para responder no WhatsApp;
- abrir a análise interna sem transformar o sistema em CRM de envio;
- nunca mostrar zero quando não existe dado;
- mostrar estados de processamento, falha e relatório ainda não fechado;
- desktop e mobile fazem parte do aceite, não são entregas separadas.

**Pronto quando:** o vendedor consegue decidir o que responder agora, entender
por que recebeu a nota e escolher uma mudança concreta para o próximo dia.

### Etapa 3 — Gestão da unidade

**Objetivo:** permitir ao gestor decidir com quem falar e sobre o quê.

Entregas:

1. `/equipe`: KPIs, ranking ordenável, tendência, volume, conversão, resposta,
   conexão e alertas.
2. `/equipe/[vendedor]`: visão individual, histórico, comparação com a unidade e
   observação visível ao vendedor.
3. Aprovações incorporadas ao shell com badge.
4. Lista de conversas da unidade com filtros de risco e espera.
5. Objeções mais frequentes e leitura narrativa do dia.
6. Alertas: conexão caída, sem movimento, cliente esperando e conversa em risco.

**Pronto quando:** em menos de um minuto o gestor identifica a pessoa que
precisa de intervenção e abre as conversas que justificam essa decisão.

### Etapa 4 — Rollups e supervisão da rede

**Objetivo:** comparar unidades sem reler conversas com IA.

Entregas:

1. Worker `rollup_unidade` em SQL e narrativa curta condicional.
2. Worker `rollup_rede` em SQL e narrativa curta condicional.
3. `/unidades`: nota e evolução da rede, ranking, comparativo selecionável e
   saúde das conexões.
4. `/unidades/[id]`: reutilizar a visão de equipe com escopo da unidade.
5. Drill-down rede → unidade → vendedor → conversa preservando período e
   filtros.

**Pronto quando:** totais fecham com os relatórios inferiores, vendedor sem dado
fica fora do denominador e todo número permite chegar à evidência de origem.

### Etapa 5 — MEC e contestação

**Objetivo:** medir o padrão comercial de maneira honesta e treinável.

Entregas:

1. Carregar Book 1 v1 em `playbooks`, etapas e itens.
2. Montar o bloco de doutrina do prompt a partir do banco.
3. Gravar aderência por conversa e rollup diário.
4. Aplicar a regra central: `aplicadas / aplicáveis`, com
   `não_verificável` para o que o WhatsApp não vê.
5. `/meu-mec`, `/equipe/mec` e `/mec` da rede.
6. Contestação pelo gestor e revisão pelo supervisor, com trilha.
7. Resolver antes da ativação: pesos das etapas, alçada de desconto e as duas
   seções provisórias do Book.

**Pronto quando:** toda marcação exibida tem justificativa e trecho; uma
contestação pode ser registrada, revisada e usada na calibração.

### Etapa 6 — Admin, privacidade e operação

**Objetivo:** operar o sistema sem depender de banco ou terminal.

Entregas:

1. `/admin`: fila, falhas, reexecução, custo, conexões e jobs.
2. Gestão de unidades, papéis, transferências e desativação.
3. Reprocessamento por vendedor/unidade/data, com prévia de custo e auditoria.
4. Registro de aceite de monitoramento.
5. Política de retenção aprovada e `/api/cron/expurgo`.
6. Exportações auditadas e minimização dos trechos armazenados.
7. Alertas de falha de fechamento e conexão caída.

**Pronto quando:** um admin consegue explicar e recuperar um dia que falhou sem
alterar manualmente o banco.

### Etapa 7 — Piloto e calibração

**Objetivo:** validar a confiança antes de abrir para toda a rede.

1. Uma unidade, todos os vendedores, por duas semanas.
2. Amostra diária de conversas revisada pelo gestor.
3. Comparar nota, classificação, conversão inferida e MEC com julgamento humano.
4. Medir falsos positivos de `sem_resposta`, disparo e mídia.
5. Calibrar rubrica e prompts; versionar mudanças.
6. Só depois liberar outras unidades.

A descoberta semanal deve entrar **depois de haver volume confiável**, não no
primeiro corte. Implementá-la cedo produz “insight” com amostra insuficiente.

## 9.5 Backlog priorizado

### P0 — bloqueia o produto

- fluxo de conexão completo e persistente;
- decisão/importação de histórico;
- teste ponta a ponta da ingestão e transcrição;
- fechamento diário;
- análise individual;
- relatório do vendedor;
- conversa com análise e evidências;
- dashboard completo do vendedor.

### P1 — transforma análise em gestão

- shell e destinos por papel;
- equipe, detalhe do vendedor e alertas;
- rollups de unidade e rede;
- dashboard da rede e drill-down;
- admin de fila, falhas, custo e reprocessamento.

### P2 — diferencia o produto

- MEC completo e contestação;
- observações do gestor;
- evolução e padrões de período;
- descoberta semanal e versionamento do Book.

### P3 — depende de decisão externa

- integração com ERP para conversão real, desconto, ticket e mix;
- resumo/alertas enviados por WhatsApp;
- metas por vendedor e unidade;
- tratamento de feriados e calendários de atendimento;
- extensão para atendimento presencial/ligação.

## 9.6 Estratégia de entrega

Para uma pessoa desenvolvedora, a estimativa prudente é:

| Marco | Esforço provável |
|---|---|
| Etapa 0 | 3–5 dias úteis |
| Etapa 1 | 7–10 dias úteis |
| Etapa 2 | 5–8 dias úteis |
| Etapas 3 e 4 | 8–12 dias úteis |
| Etapas 5 e 6 | 8–12 dias úteis |
| Piloto | 2 semanas corridas, em paralelo com calibração |

Faixa total: **6–9 semanas de desenvolvimento, mais duas semanas de piloto**,
desde que as decisões externas não parem o trabalho. MEC/descoberta pode ser
movido para depois do piloto se a prioridade for colocar análise e gestão no ar
mais cedo.

Cada etapa deve terminar com uma fatia vertical funcionando em produção. Evitar
implementar todas as telas com dados fictícios antes do pipeline: isso produziria
um dashboard visualmente completo, mas ainda vazio de produto.

## 9.7 Decisões que precisam de dono

Antes da Etapa 5:

- pesos das etapas do MEC;
- texto definitivo de estratégia de preço e contorno de objeções;
- alçada de desconto por vendedor;
- quem revisa e em quanto tempo responde contestações.

Antes do piloto:

- prazo de retenção de mensagens;
- base legal, aviso e aceite do monitoramento;
- importação de histórico ou início apenas após o QR;
- o que conta como conversão sem ERP;
- metas formais e calendário de funcionamento;
- identidade visual definitiva.

Antes de expandir para a rede:

- limite diário de custo;
- critério mínimo de qualidade da IA;
- procedimento para falha de cron ou conexão;
- treinamento dos gestores para ler correlação sem tratá-la como causa.

## 9.8 Próximo corte recomendado

O próximo corte não deve ser “mais widgets”. Deve entregar, nesta ordem:

1. Perfil/conexão + navegação por papel;
2. teste ponta a ponta real da captura;
3. `fechar-dia` + uma análise individual;
4. tela `/conversas/[id]` provando a análise com evidência;
5. relatório diário;
6. dashboard final do vendedor alimentado por esse relatório.

Esse corte transforma o que existe hoje — um monitor de atividade — no núcleo
do produto prometido: uma ferramenta que mostra **o que aconteceu, por que a
nota existe e o que fazer diferente amanhã**.
