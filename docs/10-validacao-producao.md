# Validação em produção

## Rodada 1 — 21/09/2026

Escopo validado com sessão real de vendedor:

- dashboard e fila “Esperando você”;
- lista, filtro e detalhe de conversa;
- transcrição de áudio, evidências e marcações MEC;
- evolução, Meu MEC e Perfil;
- consistência entre banco, fila e interface.

### Evidências operacionais

- 8 conversas visíveis no tempo real e 7 análises concluídas; a oitava foi
  ignorada por regra de elegibilidade;
- 13 áudios recebidos e 13 transcritos;
- fila sem falhas: análises, relatório e rollups concluídos;
- relatório fechado com 6 leads elegíveis, uma negociação e nota 10;
- aderência MEC 0% coerente com as cinco etapas aplicáveis marcadas como não
  executadas; duas etapas não eram aplicáveis.

### Achados e tratamento

1. **Dois conjuntos de KPIs pareciam contraditórios.** O superior é o relatório
   fechado; o inferior é tempo real. A interface passou a nomear os dois e
   explicar a diferença.
2. **Coaching prolixo e contaminado por suporte/testes.** O consolidado passou a
   priorizar somente negociações, com limites rígidos de tamanho e uma ação por
   melhoria.
3. **MEC mostrava só percentuais.** Próxima rodada deve validar exemplos e
   justificativas no fluxo diário com maior volume de negociações.
4. **Evolução tem apenas um dia.** Controles de 7/30/90 dias só se tornam
   verificáveis após acumular histórico; o estado atual não deve simular
   tendência.

### Próximo aceite

- validar o fechamento automático da próxima madrugada;
- revisar manualmente pelo menos cinco negociações contra o julgamento humano;
- comparar classificação, status, nota e etapas MEC;
- registrar falso positivo/negativo e calibrar somente com evidência.
