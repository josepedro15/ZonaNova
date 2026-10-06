-- =============================================================================
-- ZonaNova — análise das conversas também às 12h e às 18h (06/10/2026)
--
-- O piloto pediu análise ao meio-dia e no fim da tarde, só das conversas: o
-- status, o potencial e o lead quente para o CRM chegam no mesmo dia. O
-- relatório do vendedor (o treino) continua saindo só do dia fechado, no
-- `fechar-dia` das 00h30 — o worker não o encadeia de dia aberto.
--
-- 15:00 UTC = 12:00 BRT e 21:00 UTC = 18:00 BRT. A rota analisa o dia de hoje
-- em São Paulo.
--
-- Aplicar DEPOIS do deploy que traz a rota `/api/cron/atualizar-conversas`:
-- antes dele, o job chamaria uma rota que não existe.
-- =============================================================================

select cron.schedule('zn-atualizar-conversas', '0 15,21 * * *', $$ select public.disparar_rota_cron('/api/cron/atualizar-conversas') $$);
