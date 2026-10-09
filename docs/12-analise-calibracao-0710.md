# Análise por conversa — calibração com a auditoria de 07/10/2026

Sete agentes leram, mensagem por mensagem, as 186 conversas de 07/10 e
compararam com as análises gravadas. As contas batiam com o código; o erro
estava nas análises: quem é o contato, o status e o texto. Com base nisso,
montamos um gabarito e ajustamos o prompt, o schema e algumas conferências em
código.

```bash
npm run analise:calibracao -- /caminho/fora/do/repo/gabarito.json saida.json 2
```

O gabarito fica fora do repositório (tem nome e trecho de conversa). O script
roda a análise de produção (`lib/pedido-analise.ts`: mesmo prompt, mesmo
schema e mesmo `ajustarResultado`) sobre o transcript do dia, sem mídia e sem o
detalhe do MEC. Ele só lê o banco e confere cada expectativa (natureza, tipo,
status aceitos ou proibidos, objeção ou erro que não podem aparecer).

## Amostra

- **Gabarito: 66 conversas** de 07/10 apontadas pela auditoria, em 8
  categorias de erro, mais 9 controles que já estavam certos.
- **Controle: 53 conversas** de 07/10 que os agentes leram e não apontaram. A
  expectativa é manter o que estava gravado: natureza, tipo, venda continua
  venda e não-venda não vira venda.
- Duas rodadas de cada (temperatura 0 ainda varia de 2 a 3 conversas entre
  rodadas). Modelo: gpt-4.1-mini.

## Resultado (acertos em 2 rodadas)

| Categoria do erro | Gravado | Prompt anterior | Novo |
|---|---|---|---|
| 1. Papéis invertidos (vendedor pedindo ao estoque, ao fornecedor ou ao motorista) | 0/28 | 2/28 | 14/28 |
| 2. Pós-venda como negociação ou venda | 0/18 | 15/18 | 16/18 |
| 3. Venda não contada ("separa no nome", comprovante depois do Pix) | 0/20 | 10/20 | 17/20 |
| 4. Vários pedidos no dia | 0/2 | 0/2 | 2/2 |
| 5. Fala do vendedor como objeção | 0/6 | 0/6 | 6/6 |
| 6. `erros_vendedor` de checklist ("não sondou", "não cumprimentou") | 2/18 | 14/18 | 17/18 |
| 7. Critério de status (sem_resposta, perdida) | 4/14 | 6/14 | 12/14 |
| 8. Sem sinal de negociação (link, robô, "boa tarde") | 0/8 | 3/8 | 6/8 |
| Controles do gabarito | 18/18 | 18/18 | 16/18 |
| **Total do gabarito** | **24/132** | **68/132** | **106/132** |
| Controle (53 conversas não apontadas) | — | 97/106 | 99/106 |

"Gravado" é a análise de 07/10, feita antes dos commits 8425832 e e125bf9.
"Prompt anterior" é o HEAD antes desta mudança, rodado nas mesmas conversas.
Custo: de US$ 0,0024 para US$ 0,0032 por análise (+35%, os dois campos novos e
as regras): menos de US$ 1 por semana no volume atual.

## O que mudou

**Schema** (`lib/analise.ts`). Dois campos antes das decisões que erravam, porque o
modelo escreve na ordem do schema:

- `quem_pede`: `contato_pede_a_loja`, `vendedor_pede_ao_contato` ou
  `ninguem_pede`. Fica antes da natureza.
- `assuntos_do_dia`: de 1 a 6 pedidos, cada um com a situação em que terminou
  (`compra_nova_fechada`, `compra_nova_em_aberto`, `compra_nova_perdida`,
  `encaminhado`, `pos_venda`, `interno`, `social`). Fica antes da natureza e do
  status, e o status sai deles.

**Prompt** (`lib/pedido-analise.ts`, `lib/natureza.ts`):

- Natureza em ordem: primeiro os sinais de colega (inclusive motorista e
  expedição falando de "entrega tua de Fulano"), depois fornecedor (inclusive
  representante que manda tabela e estoque), depois pessoal (inclusive pedido
  de emprego). Cliente só se nada disso serviu.
- Áudio transcrito numa linha `V:` é do vendedor, mesmo quando começa chamando
  o contato pelo nome.
- Um assunto é o pedido inteiro. O status é venda se qualquer assunto fechou.
  Pós-venda inclui liberar mais uma parte do que já foi comprado. Comprovante
  é imagem ou documento depois do Pix. Pix pedido sem comprovante continua em
  aberto.
- Regras próprias para tipo, objeções e erros do vendedor, com os exemplos da
  auditoria.

**Código** (`ajustarResultado`, aplicado no schema que `pedidoAnalise` devolve
ao worker e às calibrações):

- Compra nova fechada entre os assuntos de um cliente vira `venda_feita`. Com
  contato interno, não: "pode vender" do estoque não é venda.
- Pix ou comprovante seguido, em até 3 falas, de imagem ou documento do
  contato, numa conversa com compra nova, também vira venda. Mensagem
  automática não dispara a regra. Mídia com legenda ou descrição só conta se
  falar de pagamento.
- Compra nova de cliente é sempre negociação.
- Cliente com confiança abaixo de 50 (`LIMIAR_CLIENTE`) não é negociação: vira
  social. Na auditoria, todos os casos assim eram link, robô, motorista ou
  credencial. Entre 60 e 70 há muitos clientes reais, por isso o limiar não sobe.
- Objeção cujas palavras vêm do vendedor e não do cliente sai.

**Transcript.** Cerca de 17 mídias por dia chegavam com o JSON da UAZAPI (URL,
chaves, miniatura em base64) no lugar do texto. O `montarTranscript` agora
guarda só a legenda e o nome do arquivo.

## O que continua errando

- **Natureza nos casos de fronteira** (14 de 28 ainda erram): motorista,
  representante e fornecedor citado por áudio mal transcrito. Nesses casos a
  confiança fica em 60–70 e oscila entre rodadas. Elas continuam contando como
  cliente; a lista manual de contatos internos segue sendo a ferramenta principal.
- **Controles que mudaram.** No controle, o prompt anterior perdia 3 vendas
  (Pix com comprovante e "toca ficha"); o novo recupera as 3. Em compensação:
  - dois contatos internos saíram como cliente: um com confiança 40, que fica
    fora da negociação, e outro com 70;
  - uma conversa com Pix ainda pendente virou venda em 1 de 2 rodadas;
  - no gabarito, uma conversa pessoal (pedido de emprego) sai como cliente com
    confiança 60, como suporte, fora da nota;
  - uma venda "digitada antes e liberada hoje" sai como pós-venda nas duas
    versões, o que é uma questão de critério.
- **Precisa de contexto de fora do dia:** "peguei noutra loja" só fica claro
  com o "perdemos a venda" escrito em outra conversa. Também há o comprovante
  provável cuja imagem chega sem nenhum texto.
- Alguns exemplos do prompt vêm dos próprios casos do gabarito. Por isso o
  número do controle (99/106 contra 97/106) mede melhor a generalização do que
  o do gabarito.

## Para acompanhar depois do deploy

- Distribuição de `tipo_conversa` e de `venda_feita` por loja na primeira
  semana: o "social" deve crescer, porque cliente sem prova sai da negociação.
- Quantas vendas vêm só da regra do comprovante. Hoje não fica marcado; se
  precisar, dá para gravar a marca no payload.

## Quem é o contato: sinais de fora da conversa (09/10)

Depois do reprocessamento de 05 a 08/10, seis contatos ainda saíam como
cliente e entravam na nota e nas vendas: Bongo 84 (motorista, venda),
Sergio (cobrança de nota antiga, venda), Mateus Xavier com Rafael e com Ana
Paula (compras, perdida), Uilian Nemecek (compras, sem resposta), Silas MKT
(marketing, negociação com 90) e Adenilza (representante, 60).

**Por que o `quem_pede` não decidia.** Ele é só um passo do prompt; nenhum
código o lê. Quando dizia `vendedor_pede_ao_contato` com natureza cliente, 3
de 4 eram clientes de verdade (Jasson e Jair recebendo orçamento), então ele
não serve para decidir sozinho. Nos casos que erravam, o modelo trocava quem
falou ("O Maicon me pediu uma botina", linha V:, virava "o cliente pediu") ou
acertava o `quem_pede` e mesmo assim punha cliente/70.

**O que decide agora** (`lib/natureza.ts`, aplicado em `pedidoAnalise`, por
cima da IA, a não ser que ela já tenha visto alguém de fora com 80+):

- **Cadastro em qualquer loja da rede** (95). A lista é da loja e é ela que
  barra a mensagem, mas os gestores cadastram o mesmo número em várias lojas,
  e o de uma não valia na outra: "MATHEUS COMPRAS" e "UILIAN NEMECEC COMPRAS"
  na Venda Externa, conversando com Capão; "SILAS MARK." na Venda Externa,
  conversando com Pisos Matriz. Com o 9º dígito ou sem ele.
- **Cargo ou setor no nome** (85): MKT, Marketing, Motora, Motorista, Bongo +
  número (os caminhões), CD, Compras, Crediário, Financeiro, Expedição,
  Gerente, Recursos Humanos, Zona Nova, Redemac → colega; Representante →
  fornecedor. Fica de fora o que pode ser empresa de cliente (Depósito,
  Construtora, Entregas).
- **Oferta do contato** (85): fala do contato com preço e estoque dele
  ("R$32,56M² / Estoque 273,60m2") → fornecedor.

Tipo e status ficam como a IA disse: o contato sai das contas inteiro
(`naturezaSuspeita`), aparece em "Sugeridos pela IA" no Perfil com a
evidência ("Cadastrado como contato interno em Venda Externa: …"), e o "É
cliente" do gestor devolve a conversa com o que ela tinha.

**Nota antiga** (`ajustarResultado`): o contato fala de nota tirada antes
("Tiraram nota meses", "aquela nota") e não há comprovante no dia → a compra
"fechada" é pós-venda. O modelo alternava entre venda e pós-venda no Sergio.

**Bloqueio vale para trás.** O relatório do vendedor não olhava
`conversas.bloqueada`: a análise feita antes do cadastro continuava contando
como lead e venda (Silas, Uilian, Mateus). Agora a conversa bloqueada fica
fora, como a dispensada, e cadastrar ou remover um contato interno refaz o
relatório dos dias fechados em que ela teve análise.

### Calibração

O gabarito e o controle de 08/10 se perderam com o /tmp e foram remontados
das sessões: 59 dos 66 casos (7 conversas sumiram na unificação LID da 0031)
mais Mateus com Ana Paula. O controle passou a ser o que está em produção
(735d9d8) para as 54 conversas de 07/10 que a auditoria não apontou; três
delas o gestor já cadastrou como internas (Crediário, RH, Silas) e contam como
interno. Bongo 84 passou a esperar interno (o nome prova). Mesmo critério nas
duas versões, 2 rodadas:

| | HEAD (735d9d8 + dados) | Agora |
|---|---|---|
| Gabarito (120) | 97 | 111 |
| Os 6 casos (14 análises) | 3 | 14 |
| Controle (108) | 98 | 105 |
| Gabarito só com a IA, sem cadastro nem nome (`SEM_SINAL=1`, 60) | — | 52 |

No controle, as falhas que sobram: Samuel (venda na IA, em andamento em
produção) nas duas versões; "trabalho" (Pix pedido sem comprovante) saiu
venda em 1 de 2 rodadas — oscilação do modelo, não da natureza.

Em produção (05–08/10, leitura): o sinal tiraria das contas 55 análises hoje
cliente — 25 negociações e 3 vendas (Bongo 84, Crediário, Mateus 08/10) —,
todas de número interno. E 39 análises de conversas já bloqueadas ainda
contavam no relatório (24 negociações, 4 vendas). Nada disso muda sem
reprocessar.
