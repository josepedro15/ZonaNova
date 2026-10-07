# Natureza do contato — calibração (07/10/2026)

A análise passou a dizer quem é o contato (`natureza_contato`: `cliente`,
`colega_ou_loja`, `fornecedor_ou_parceiro`, `pessoal`) com confiança e trecho
literal. Com natureza ≠ `cliente` e confiança ≥ 80 (`lib/natureza.ts`), a
conversa vira sugestão em **Perfil → Contatos internos → Sugeridos pela IA** e
sai das objeções da semana e do relatório do vendedor até o gestor decidir.
Nada é bloqueado sozinho.

Antes de ligar, rodamos a análise de produção (mesmo prompt e schema,
`lib/pedido-analise.ts`) em conversas reais, só lendo o banco:

```bash
npm run natureza:calibracao -- 7 100 /caminho/fora/do/repo.json
```

## Amostra

- Janela de 30/09 a 07/10, um dia por conversa, sem imagem/documento (a flag
  `MIDIA_UNIDADES` está desligada) e sem o detalhe do MEC.
- **Positivos: 31 conversas** com número da lista `contatos_internos`
  (Venda Externa 22, Pisos Matriz 7, Capão 2). A lista tem 65 números, mas
  depois de cadastrado o número não tem mais mensagem guardada: só sobram os
  dias anteriores ao cadastro.
- **Negativos: 69 dias analisados** de outras conversas, sorteados (amostra A),
  e uma segunda amostra nova de 69 (amostra B) para conferir a versão final.
  "Negativo" é só "fora da lista": cada sugestão nele foi revisada à mão.

## Rodadas

| Versão do prompt | Da lista achados (≥ 80) | Sugeridos fora da lista |
|---|---|---|
| v1 — campo no fim do JSON | 1/31 | 2/69 |
| v2 — natureza como **primeiro** campo do JSON + sinais concretos | 11/31 | 15/69 |
| v3 — "cliente da loja" (sinal de colega) × "cliente do profissional" (continua cliente) | 12/31 | 15/69 |
| **v4 — formato do transcript diz "C: o contato", não "C: cliente"** (final) | 14/31 e 11/31 em duas rodadas | 16/69 |
| v5 — sinais também na fala do vendedor (descartada) | 11/31 | 16/69 |
| v4 na amostra nova B | 12/31 | 11/69 |

O que mais pesou: decidir a natureza antes de avaliar a venda (com o campo no
fim, o modelo respondia "cliente, 90" para tudo) e tirar do prompt a frase
que dizia que `C:` é o cliente. Entre v3, v4 e v5 a diferença está dentro do
ruído: o mesmo prompt, rodado duas vezes com temperatura 0, mudou 3 de 100
conversas de lado.

O limiar não muda nada nesta faixa: o modelo dá 90 a quase toda suspeita, e
50, 60, 70, 80 e 90 deram o mesmo resultado. Fica 80.

## Resultado da versão final

**Precisão: alta.** Nenhum cliente claro entre as 21 conversas distintas
sugeridas fora da lista em todas as rodadas, revisadas à mão. Eram equipe de marketing e agência
falando pelo número conectado de Capão, mãe e amigos, envio de login da
plataforma, saldo do Meta Ads, representante de energia solar, convite de
evento e outra loja da rede ("tem um cliente teu aqui pra retirar", em
Xangri-Lá — número que não está na lista). Duas são duvidosas ("passa o
contato daquele outro vendedor", uma pergunta sobre "apartado de notas"). Alguns rótulos saem trocados (agência como
"colega"), mas o gestor vê o trecho e escreve a descrição.

**Cobertura: baixa, ~40% da lista (11–14 de 31).**

- 6 das 31 não têm como: o dia tem só imagem, link ou "oi".
- 20 das 31 a análise chama de **negociação** (colega de compras ou do CD
  falando de produto e estoque) — são estas que poluem as objeções — e a IA só
  reconhece 2 ou 3 delas. Os acertos são quase todos conversas que já eram
  "social" ou "suporte" e, por isso, já estavam fora das objeções.

**Conclusão:** seguro para ligar como sugestão, porque não marca cliente como
interno. Mas sozinho não limpa as objeções da matriz: a lista manual continua
sendo a ferramenta principal, e a sugestão serve para o gestor achar números
que ninguém cadastrou. Um sinal sem IA — o mesmo número falando com 3 ou mais
vendedores da loja — também não ajuda: só 2 dos 42 números da lista com
conversa nos últimos 60 dias passam disso.

## Custo

~US$ 0,20 por 100 análises na calibração. Em produção, o campo novo soma ~500
tokens de entrada e ~60 de saída por análise: menos de US$ 0,03 por semana no
volume atual (~800 dias-conversa).

## Para acompanhar depois do deploy

- Em 9 a 12 das 69 conversas sorteadas o `tipo_conversa` saiu diferente do
  gravado no banco. Não dá para atribuir à mudança (a análise gravada pode ser
  de outro recorte do dia ou de prompt anterior), mas vale olhar a distribuição
  negociação/suporte/social na primeira semana.
- Quantas sugestões cada loja recebe e quantas o gestor confirma.
