-- =============================================================================
-- ZonaNova — o fechamento roda depois que o dia termina (quarta revisão)
--
-- O `fechar-dia` rodava às 02:30 UTC = 23:30 BRT e fechava "ontem" — ou seja,
-- às 23:30 de terça fechava segunda. O vendedor abria o app na quarta e via o
-- treino de segunda: 24h de atraso em tudo. Fechar o próprio dia às 23:30
-- também não serve: perderia a última meia hora.
--
-- 03:30 UTC = 00:30 BRT. A rota continua fechando "ontem" (agora − 24h), que
-- a essa hora é o dia que acabou de terminar. A fila processa de madrugada e
-- o relatório está pronto de manhã.
--
-- As descobertas de domingo (03:00 BRT) liam a semana até sábado, e o sábado
-- ainda estava na fila. Passam para 09:00 BRT (12:00 UTC).
--
-- `cron.schedule` com um nome que já existe atualiza o job em vez de criar
-- outro.
-- =============================================================================

select cron.schedule('zn-fechar-dia', '30 3 * * *', $$ select public.disparar_rota_cron('/api/cron/fechar-dia') $$);
select cron.schedule('zn-descobertas-semanais', '0 12 * * 0', $$ select public.disparar_rota_cron('/api/cron/descobertas') $$);
