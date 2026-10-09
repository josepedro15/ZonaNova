-- =============================================================================
-- ZonaNova — resposta automática reconhecida pelo texto (auditoria de 07/10/2026)
--
-- `mensagens.automatica` só ficava verdadeiro para mensagem disparada pela
-- API (`fromApi`). A saudação e a ausência do WhatsApp Business saem do próprio
-- aparelho, sem essa marca: em 08/10 as 188 mil mensagens do banco estavam
-- todas com `automatica = false`, inclusive 416 "Você entrou em contato com o
-- televendas…" e 332 "Agradecemos sua mensagem. Não estamos disponíveis…".
-- Contavam como resposta humana — encurtavam o tempo médio e viravam elogio
-- ou crítica à vendedora — e, do lado do cliente, a ausência automática da
-- empresa dele virava "cliente esperando".
--
-- 1. Marca o que já está no banco com as MESMAS regras de
--    lib/uazapi/normalizar.ts `REGRAS_AUTOMATICA` (mudou lá, muda aqui). Em
--    08/10 eram 759 saídas e 76 entradas.
-- 2. A ausência automática do cliente não tira mais a conversa do
--    "Não é atendimento" (0027): não é o cliente escrevendo de novo.
-- 3. Mídia gravada com o objeto do WhatsApp em texto no `conteudo`
--    ({"URL":…,"mediaKey":…}; 124 em 07/10, quase todas do `history`). Fica a
--    legenda, quando houver, e o nome do documento vai para `midia_nome`, como
--    lib/uazapi/normalizar.ts `midiaSerializada` faz daqui em diante.
--
-- Relatórios já fechados não mudam sozinhos: reprocessar o dia na Operação.
-- =============================================================================

create or replace function public.zn_eh_resposta_automatica(texto text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(t ~* 'n[aã]o estamos dispon[ií]ve(l|is)'
        or t ~* 'voc[eê] entrou em contato com'
        or t ~* '(mensagem|resposta) autom[aá]tica'
        or t ~* 'fora d[oe] (nosso )?hor[aá]rio de atendimento'
        or (t ~* 'agradece(mos)? (a |o )?(sua|seu|pela sua|pelo seu|por entrar em) (mensagem|contato)'
            and t ~* '(retorn|respond|hor[aá]rio|em breve|assim que poss)')
        or (t ~* 'receb(emos|eu) (a )?sua mensagem' and t ~* '(retorn|respond|em breve)')
        or t ~* 'retornaremos (o |a )?(seu |sua )?(contato|mensagem|solicita)', false)
    from (select regexp_replace(texto, '\s+', ' ', 'g') as t) x
$$;

revoke execute on function public.zn_eh_resposta_automatica(text) from public, anon, authenticated;

update public.mensagens
set automatica = true
where automatica = false
  and conteudo is not null
  and public.zn_eh_resposta_automatica(conteudo);

-- Mesma função de 0027, só com a condição nova no WHEN do trigger.
drop trigger if exists trg_mensagem_reativa_dispensada on public.mensagens;
create trigger trg_mensagem_reativa_dispensada
    after insert on public.mensagens
    for each row
    when (new.direcao = 'entrada' and not new.automatica)
    execute function public.conversas_reativa_dispensada();

-- 3. Uma a uma: linha que não for JSON válido fica como está, sem derrubar a migração.
do $$
declare
    r record;
    o jsonb;
begin
    for r in select id, tipo, conteudo, midia_nome from public.mensagens
             where conteudo ~ '^\{"(URL|mediaKey|directPath)"' loop
        begin
            o := r.conteudo::jsonb;
        exception when others then
            continue;
        end;
        update public.mensagens
        set conteudo = nullif(btrim(o->>'caption'), ''),
            midia_nome = case when r.tipo = 'documento' and r.midia_nome is null
                then left(nullif(btrim(regexp_replace(coalesce(o->>'fileName', o->>'title', ''), '\s+', ' ', 'g')), ''), 120)
                else r.midia_nome end
        where id = r.id;
    end loop;
end $$;
