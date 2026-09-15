# 6. Roadmap

## Fase 1 — Planejamento ✅
Escopo, hierarquia, modelo de dados, pipeline, arquitetura, mapa de telas.
Entregue neste conjunto de documentos.

**Pendências para fechar a fase:** lista real das unidades da Zona Nova, volume
estimado de conversas/dia por vendedor, e quem são o supervisor e os gestores
iniciais.

## Fase 2 — Design das telas ✅
22 telas desenhadas em `design/`, publicadas como canvas. Direção visual A
(papel quente, tinta petróleo, acento ocre) com tokens em `design/README.md`.

**Pendência que bloqueia o refino:** a marca é placeholder. Sem logo, cores e
tipografia reais da Zona Nova, refinar pixel é trabalho que pode ir fora.

## Fase 3 — Fundação ✅
Next 16 + Supabase, migrations `0001`–`0004`, auth, encaminhamento por papel,
cadastro com seleção de unidade, aprovação, recuperação de senha, seed.

**Critério de pronto: atingido.** `tests/rls.sql` — 32 asserções de isolamento
mais 3 guardas de privilégio, **35 de 35 a passar**. O teste encontrou quatro bugs reais que a leitura
do código não pegou; estão descritos em [§8.2](08-fundacao.md).

**Projeto Supabase provisionado**, com `0001`–`0004` aplicadas. Subir para lá
revelou o quarto bug: os grants estreitos do `0001` não restringiam nada, porque
o Supabase concede tudo por defeito e GRANT só soma. O `0003` fecha isso.

**Sem pendências técnicas.** O ambiente de teste e o Supabase real foram
reconciliados: mesmas tabelas, mesmas policies, mesmos privilégios.

## Fase 4 — Conexão e ingestão
Criação de instância UAZAPI por vendedor, tela de QR, webhook, gravação
idempotente de mensagens, transcrição de áudio, `checar-conexoes`.

**De pé:** cifra do `instance_token`, normalização e descarte do payload, token
de rota por vendedor, `POST /api/webhook/uazapi/[token]`, criação de instância,
tela de QR, `GET /api/cron/checar-conexoes`, e o trigger de contadores (`0005`).

O servidor UAZAPI é **compartilhado com o MetricsIA** — 25 instâncias do
zap-insight vivem nele e o nosso admintoken as controla. A separação é por
`systemName = 'zonanova'`, aplicada em código: `listar()` filtra, e toda
operação destrutiva confere de quem é a instância antes de agir. Verificado
contra o servidor real.

Transcrição de áudio de pé: `GET /api/cron/processar-fila` com backoff
exponencial (5, 20, 45 min; na 4ª falha desiste) e cache por hash do arquivo —
o mesmo áudio encaminhado não é transcrito duas vezes, porque transcrição é
paga por minuto.

**Falta:** `OPENAI_API_KEY` para a transcrição correr de facto, e o teste ponta
a ponta — que exige unidade cadastrada, vendedor aprovado, instância real e
alguém lendo o QR.

**Critério de pronto:** mensagem enviada no celular aparece no banco em segundos,
e reentrega de webhook não duplica. *A segunda metade está provada
(`tests/rls.sql`); a primeira não.*

## Fase 5 — Pipeline de análise
Prompts portados e adaptados ao GPT-4.1 mini, structured outputs, fila, worker,
`fechar-dia`, consolidado do vendedor, métricas calculadas em SQL, cache e
registro de custo.

**Antes de ligar:** rodar a simulação de custo (§3.8) sobre um dia real.

**Critério de pronto:** um dia de conversas reais de um vendedor vira relatório
correto, e o custo medido bate com o estimado.

## Fase 6 — Dashboards
Vendedor → gestor → supervisor, nessa ordem, mais a tela de conversa com
evidências. Rollups de unidade e rede.

## Fase 6-A — Aderência ao MEC

Playbook carregado no banco (Book 1 v1), bloco `mec` no schema da análise, telas
de aderência do vendedor e do gestor, contestação. Ver [§7](07-aderencia-mec.md).

**Critério de pronto:** um gestor olha a matriz da unidade e consegue dizer, com
o trecho na mão, qual etapa a equipe dele não está cumprindo.

## Fase 6-B — Descoberta

Job semanal, tela de descobertas do supervisor, cruzamento etapa × conversão.
Só faz sentido depois de algumas semanas de aderência acumulada — precisa de
volume para a evidência valer alguma coisa.

## Fase 7 — Operação
Painel de admin (fila, custos, reprocessamento), alertas de conexão caída,
expurgo de retenção, aceite de LGPD, documentação de uso para gestores.

## Fase 8 — Piloto
Uma unidade, todos os vendedores, duas semanas. Calibrar a rubrica de nota contra
o julgamento do gestor antes de abrir para a rede — se a nota da IA não bate com
o que o gestor vê, ninguém confia no sistema depois.

## Decisões pendentes

| Assunto | Precisa de |
|---|---|
| Retenção de mensagens | definição do prazo (proposta: 12 meses) |
| Envio do resumo diário por WhatsApp ao gestor | quer? para quais números? |
| Metas por vendedor/unidade | existem metas formais para o dashboard comparar? |
| Integração com CRM/ERP da Zona Nova | há conversão de venda registrada em outro sistema? |
| Fim de semana e feriado | unidades atendem? o relatório deve rodar? |
| Books seguintes do MEC | o Book 1 fala em "alguns elementos"; só temos ele |
| Duas seções incompletas do Book 1 | "estratégia de preço" está *página não editada* e o contorno de objeções *no aguardo de reforço* |
| Alçada de desconto por vendedor | sem isso não dá para medir estouro de alçada |
| Peso das etapas do MEC | todas valem igual na aderência? o Book não diz |
| Identidade visual da Zona Nova | logo, cores e tipografia — bloqueia o refino das telas |
| Registro de ligação | metade das contestações previstas é sobre acompanhamento que o sistema não vê |
