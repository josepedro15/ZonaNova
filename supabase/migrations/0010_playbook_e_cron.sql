-- Book 1 v1: conteúdo mínimo verificável. As seções ainda provisórias ficam
-- marcadas na descrição para a interface não apresentá-las como verdade final.
insert into public.playbooks (id, versao, nome, vigente_de, notas)
values ('10000000-0000-0000-0000-000000000001', 'book1-v1', 'MEC Book 1 — Do atendimento ao fechamento', current_date,
        'Estratégia de preço e contorno de objeções têm trechos provisórios no documento-fonte.')
on conflict (versao) do nothing;

insert into public.playbook_etapas (id, playbook_id, chave, ordem, nome, descricao, criterios) values
('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','acolhida',1,'Acolhida','Cumprimentar e manter tom cordial. Mensagem automática não conta como acolhida humana.','[]'),
('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','sondagem',2,'Sondagem','Capturar informações da obra com perguntas abertas.','[]'),
('11000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','solucao_completa',3,'Solução completa','Oferecer complementares específicos e informar entrega e condição. Evitar frases vagas como algo mais.','[]'),
('11000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','contorno_objecoes',4,'Contorno de objeções','Aplicar cachorro, papagaio e minhoca nessa ordem, sem concordar nem criticar a objeção. Seção provisória do Book.','[]'),
('11000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','estrategia_preco',5,'Estratégia de preço','Respeitar alçada e conferir itens, prazo e frete do orçamento concorrente. Seção provisória do Book.','[]'),
('11000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','fechamento',6,'Fechamento','Fazer pergunta de fechamento direta ou limitar opções e terminar positivamente.','[]'),
('11000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','acompanhamento',7,'Acompanhamento','Retomar no turno seguinte. Ligação que não aparece no WhatsApp é não verificável.','[]')
on conflict (playbook_id, chave) do nothing;

insert into public.playbook_itens (etapa_id, chave, tipo, rotulo, ordem) values
('11000000-0000-0000-0000-000000000002','sondagem_a','informacao','O que está construindo',1),
('11000000-0000-0000-0000-000000000002','sondagem_b','informacao','Em que etapa está a obra',2),
('11000000-0000-0000-0000-000000000002','sondagem_c','informacao','Andamento e prazo da obra',3),
('11000000-0000-0000-0000-000000000002','sondagem_d','informacao','Tem orientação profissional',4),
('11000000-0000-0000-0000-000000000002','sondagem_e','informacao','Compra todas as categorias conosco',5),
('11000000-0000-0000-0000-000000000002','sondagem_f','informacao','Prefere preço ou condição',6),
('11000000-0000-0000-0000-000000000002','sondagem_g','informacao','Uso pretendido do produto',7),
('11000000-0000-0000-0000-000000000003','algo_mais','frase_proibida','Algo mais?',1),
('11000000-0000-0000-0000-000000000004','preco_alto','objecao','Preço alto',1),
('11000000-0000-0000-0000-000000000004','concorrente','objecao','Preço maior que o concorrente',2),
('11000000-0000-0000-0000-000000000004','confianca','objecao','Confiança abalada',3),
('11000000-0000-0000-0000-000000000004','pensar','objecao','Vou pensar',4),
('11000000-0000-0000-0000-000000000004','internet','objecao','Na internet é mais barato',5),
('11000000-0000-0000-0000-000000000004','entrega_hoje','objecao','Só se entregar hoje',6),
('11000000-0000-0000-0000-000000000004','permuta','objecao','Já tenho permuta',7),
('11000000-0000-0000-0000-000000000004','marca_pedreiro','objecao','Meu pedreiro só usa outra marca',8),
('11000000-0000-0000-0000-000000000006','direto','tecnica','Fechamento direto',1),
('11000000-0000-0000-0000-000000000006','opcoes','tecnica','Limitação de opções',2)
on conflict (etapa_id, chave) do nothing;

-- A rota agora existe; passa a fazer parte do agendamento oficial.
select cron.schedule('zn-fechar-dia', '30 2 * * *', $$ select public.disparar_rota_cron('/api/cron/fechar-dia') $$);
