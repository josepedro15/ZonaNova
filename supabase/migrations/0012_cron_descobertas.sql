select cron.schedule('zn-descobertas-semanais', '0 6 * * 0', $$ select public.disparar_rota_cron('/api/cron/descobertas') $$);
