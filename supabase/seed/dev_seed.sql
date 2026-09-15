-- Seed de desenvolvimento. NUNCA rodar em produção.
-- 2 unidades, 1 supervisor, 2 gestores, 3 vendedores, conversas e análises.

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'paulo@zonanova.com.br'),
  ('22222222-2222-2222-2222-222222222222', 'carla@zonanova.com.br'),
  ('33333333-3333-3333-3333-333333333333', 'denis@zonanova.com.br'),
  ('44444444-4444-4444-4444-444444444444', 'rafael@zonanova.com.br'),
  ('55555555-5555-5555-5555-555555555555', 'leticia@zonanova.com.br'),
  ('66666666-6666-6666-6666-666666666666', 'ivete@zonanova.com.br'),
  ('77777777-7777-7777-7777-777777777777', 'vera@zonanova.com.br')
on conflict do nothing;

insert into public.unidades (id, nome, cidade, uf) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Centro',          'Caxias do Sul',   'RS'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Bento Gonçalves', 'Bento Gonçalves', 'RS')
on conflict do nothing;

-- O trigger on_auth_user_created já criou profiles; ajustamos papel/unidade/status.
insert into public.profiles (id, nome, email, role, unidade_id, status) values
  ('11111111-1111-1111-1111-111111111111', 'Paulo Amaral',  'paulo@zonanova.com.br',   'supervisor', null, 'ativo'),
  ('22222222-2222-2222-2222-222222222222', 'Carla Seibert', 'carla@zonanova.com.br',   'gestor',     'aaaaaaaa-0000-0000-0000-000000000001', 'ativo'),
  ('33333333-3333-3333-3333-333333333333', 'Denis Farias',  'denis@zonanova.com.br',   'gestor',     'aaaaaaaa-0000-0000-0000-000000000002', 'ativo'),
  ('44444444-4444-4444-4444-444444444444', 'Rafael Moura',  'rafael@zonanova.com.br',  'vendedor',   'aaaaaaaa-0000-0000-0000-000000000001', 'ativo'),
  ('55555555-5555-5555-5555-555555555555', 'Letícia Brum',  'leticia@zonanova.com.br', 'vendedor',   'aaaaaaaa-0000-0000-0000-000000000001', 'ativo'),
  ('66666666-6666-6666-6666-666666666666', 'Ivete Pozzobon','ivete@zonanova.com.br',   'vendedor',   'aaaaaaaa-0000-0000-0000-000000000002', 'ativo'),
  ('77777777-7777-7777-7777-777777777777', 'Vera Klein',    'vera@zonanova.com.br',    'vendedor',   'aaaaaaaa-0000-0000-0000-000000000001', 'pendente')
on conflict (id) do update set
  nome = excluded.nome, role = excluded.role,
  unidade_id = excluded.unidade_id, status = excluded.status;

insert into public.gestor_unidades (gestor_id, unidade_id) values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.conversas (id, user_id, unidade_id, cliente_telefone, cliente_nome, ultima_mensagem_em) values
  ('cccccccc-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', '5554991347702', 'Márcia Toledo', now()),
  ('cccccccc-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', '5554991112233', 'Joel Bastos',   now()),
  ('cccccccc-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000002', '5554994445566', 'Ademir Boff',   now())
on conflict do nothing;

insert into public.mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, enviada_em) values
  ('cccccccc-0000-0000-0000-000000000001', 'wa-centro-1', 'entrada', 'texto', 'Preciso de tinta para 180 m2', now()),
  ('cccccccc-0000-0000-0000-000000000003', 'wa-bento-1',  'entrada', 'texto', 'Tem argamassa AC-III?',       now())
on conflict do nothing;

insert into public.conexoes_whatsapp (user_id, unidade_id, instance_name, instance_token, numero, status) values
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', 'zn-rafael',  '\\xdeadbeef'::bytea, '5554997113082', 'conectada'),
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', 'zn-leticia', '\\xcafebabe'::bytea, '5554998887766', 'conectada'),
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000002', 'zn-ivete',   '\\xfeedface'::bytea, '5554996665544', 'caida')
on conflict do nothing;

insert into public.relatorios_diarios (user_id, unidade_id, data_ref, score_geral, leads_atendidos) values
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, 78, 14),
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, 89, 16),
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000002', current_date, 63, 11)
on conflict do nothing;

insert into public.relatorios_unidade (unidade_id, data_ref, score_geral, vendedores_ativos) values
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date, 84, 2),
  ('aaaaaaaa-0000-0000-0000-000000000002', current_date, 63, 1)
on conflict do nothing;

insert into public.relatorios_rede (data_ref, score_geral, unidades_ativas) values
  (current_date, 71, 2) on conflict do nothing;

commit;
