select cron.schedule('zn-expurgo-mensagens', '0 5 1 * *', $$ select public.disparar_rota_cron('/api/cron/expurgo') $$);
