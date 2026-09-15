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

## Fase 3 — Fundação
Projeto Next + Supabase, migration `0001_init`, auth, middleware por papel,
cadastro com seleção de unidade, aprovação pelo gestor. Seed de unidades e
usuários de teste.

**Critério de pronto:** um vendedor se cadastra, um gestor aprova, e a RLS
impede que ele veja dado de outra unidade — comprovado por teste.

## Fase 4 — Conexão e ingestão
Criação de instância UAZAPI por vendedor, tela de QR, webhook, gravação
idempotente de mensagens, transcrição de áudio, `checar-conexoes`.

**Critério de pronto:** mensagem enviada no celular aparece no banco em segundos,
e reentrega de webhook não duplica.

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
