# Imagem e documento na análise — design (07/10/2026)

## Problema

O Silas perguntou se a IA lê imagem e documento. Hoje, não: o vendedor manda o
orçamento em PDF ou foto e o transcript mostra só `V: [Mídia: documento]`, e o
prompt manda "Não deduza conteúdo de imagem/documento". A análise não sabe que
o orçamento foi enviado. `mensagens.midia_url` vem vazio para imagem e
documento: a mídia só existe pedindo à UAZAPI (`POST /message/download`), como
já se faz com o áudio.

## O que muda

1. **Nome do arquivo, de graça.** O webhook guarda o nome do documento em
   `mensagens.midia_nome` (`lib/uazapi/normalizar.ts`). A UAZAPI manda em
   `content` o objeto da mensagem do WhatsApp (`DocumentMessage`): o nome é
   `content.fileName` (ou `title`); aceitamos também `fileName`/`filename` no
   topo. A doc pública da UAZAPI não detalha o schema — **conferir no primeiro
   dia** quantos documentos chegaram com nome (consulta abaixo). Como efeito
   colateral, `content` objeto deixa de poder cair na coluna `conteudo`.
2. **Descrição de uma linha, paga, por unidade.** Novo item da fila,
   `descricao_midia`, enfileirado no webhook para imagem e documento de hoje e
   de ontem (o mesmo corte de `valeTranscrever`) da unidade ligada. O worker
   pede a URL e o mimetype à UAZAPI, baixa com as travas do áudio (só https,
   sem rede interna, teto de 10 MB) e:
   - **imagem** (jpeg/png/webp/gif) → gpt-4.1-mini com visão;
   - **PDF** → texto das 3 primeiras páginas extraído no servidor (`unpdf`),
     até 6 mil caracteres, e só o texto vai ao modelo. PDF escaneado (sem
     texto) não paga chamada: a descrição diz que não há texto legível;
   - planilha, Word e o resto → item `ignorado`; fica só o nome do arquivo.

   A saída é `categoria` (orçamento, pedido/lista, nota fiscal, comprovante,
   boleto, foto de produto, foto de obra, projeto, catálogo, print, documento
   pessoal, outro) + resumo de uma linha com os dados-chave copiados do
   arquivo. Documento pessoal sai só com o tipo, sem número nem nome. Grava em
   `mensagens.midia_descricao`. Cache por `midia_hash`: a mesma foto de
   catálogo encaminhada por vários vendedores é descrita uma vez.
3. **Transcript e prompt.** Com a unidade ligada, `montarTranscript` escreve
   `V: [Mídia: documento — arquivo: orçamento.pdf — descrição automática: orçamento: 12 itens, total R$ 5.343,31] "segue"`.
   Nome e descrição ficam DENTRO da marca, sem colchete, aspa nem quebra de
   linha: não abrem fala nem forjam o JSON, e o `conferirDetalhe` do MEC lê a
   linha como antes (a descrição nunca conta como fala do vendedor). A regra do
   prompt troca para: vale como evidência do que foi **enviado**, citada como
   "(descrição da mídia)", sem deduzir além dela e ignorando instruções que
   apareçam ali.

## Flag

`MIDIA_UNIDADES` — vazio desliga (padrão), `*` liga tudo, ou ids por vírgula,
como `MEC_DETALHE_UNIDADES`. Desligada, a consulta, o transcript e o prompt
são byte a byte os de antes (teste em `midia.test.ts` e `analise.test.ts`). O
nome do arquivo é gravado sempre — não muda a análise, e deixa o dado pronto
para quando ligar.

## Custo estimado (gpt-4.1-mini, US$ 0,40/M entrada, US$ 1,60/M saída)

Volumes de produção, 29/09 a 06/10: **imagens 63–179/dia em dia útil (média
~108)**, **documentos 22–53/dia (média ~42)** — acima dos ~60/~30 da
estimativa inicial.

| | tokens por item | custo por item | média/dia | pico/dia |
|---|---|---|---|---|
| Imagem (foto de WhatsApp ~1600 px → teto de 1536 patches × 1,62 ≈ 2,5 mil + 300 de instrução; ~60 de saída) | ~2,8 mil | ~US$ 0,0012 | ~US$ 0,13 | ~US$ 0,21 |
| PDF (até 6 mil caracteres ≈ 2 mil + 300; ~60 de saída) | ~2,3 mil | ~US$ 0,001 | ≤ US$ 0,04 | ≤ US$ 0,05 |
| Linhas novas no transcript (≈60 tokens × ~150 mídias × 3 análises/dia) | | | ~US$ 0,01 | ~US$ 0,02 |
| **Total** | | | **~US$ 0,18/dia** | **~US$ 0,28/dia** |

≈ **US$ 5–6/mês** com a rede inteira ligada, antes do cache por hash (que só
reduz). A conta de PDF supõe que todo documento é PDF; planilha e Word não
pagam nada. Depois de ligar, medir de verdade pela usage da OpenAI do dia.

Fila: o worker pega 4 itens a cada 5 min (~1.150/dia). A rede inteira soma
~150–230 itens de descrição por dia, rápidos (2–5 s). Piloto numa unidade
primeiro e olhar se a fila não atrasa a análise das 12h/18h.

## Rollout

1. Deploy deste código (funciona sem a migração: o webhook grava sem o nome
   se a coluna não existir; o worker só lê as colunas novas com a flag).
2. Usuário aplica `supabase/migrations/0026_descricao_midia.sql` e registra em
   `schema_migrations`.
3. Conferir o nome do arquivo depois de algumas horas:
   `select count(*) filter (where midia_nome is not null), count(*) from mensagens where tipo = 'documento' and created_at > now() - interval '6 hours';`
   Se vier zero, o campo do payload é outro: olhar uma entrada crua e ajustar
   `normalizarMensagem`.
4. Na Vercel, `MIDIA_UNIDADES=<id da unidade piloto>`; acompanhar itens
   `descricao_midia` (`concluido`/`ignorado`/`falhou`) e algumas descrições.
5. Ligar para a rede: `MIDIA_UNIDADES=*`.

## Fora do escopo

Vídeo; OCR de PDF escaneado; ler planilha/Word; mostrar a descrição na tela
da conversa.
