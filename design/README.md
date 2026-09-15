# Telas do ZonaNova

Mockups de alta fidelidade das 22 telas do sistema, autorados como artboards
`.dc.html` e publicados como canvas de design.

## Arquivos

| Arquivo | Tela | Largura |
|---|---|---|
| `Login.dc.html` | 0 · Login + 3 estados de erro | 390 |
| `Senha.dc.html` | 0b · Recuperar senha (3 passos) | 1300 |
| `Cadastro.dc.html` | 1 · Cadastro com seleção de unidade | 390 |
| `Aguardando.dc.html` | 2 · Aguardando aprovação do gestor | 390 |
| `Conectar.dc.html` | 3 · Conectar WhatsApp (QR + 4 estados) | 390 |
| `Main.dc.html` | 4 · Dashboard do vendedor | 390 |
| `Conversa.dc.html` | 5 · Conversa e análise com evidências | 1180 |
| `Conversas.dc.html` | 5b · Lista de conversas | 390 |
| `Evolucao.dc.html` | 5c · Evolução no período | 390 |
| `Perfil.dc.html` | 5d · Perfil, conexão e contatos bloqueados | 390 |
| `Equipe.dc.html` | 6 · Unidade — serve gestor **e** supervisor | 1440 |
| `VendedorGestor.dc.html` | 7 · Vendedor visto pelo gestor | 1180 |
| `Aprovacoes.dc.html` | 6b · Aprovação de cadastro (gestor) | 1440 |
| `Rede.dc.html` | 8 · Rede (supervisor) | 1440 |
| `Admin.dc.html` | 9 · Operação (admin) | 1440 |
| `AdminUnidades.dc.html` | 9b · Unidades, papéis e conexões | 1440 |
| `Vazios.dc.html` | 9 estados vazios e de erro | 1180 |
| `MeuMec.dc.html` | 10 · Meu MEC (vendedor) | 390 |
| `AderenciaUnidade.dc.html` | 11 · Aderência da unidade (gestor) | 1440 |
| `MecRede.dc.html` | 12 · O MEC está pegando? (supervisor) | 1440 |
| `Descobertas.dc.html` | 13 · Descobertas (supervisor) | 1440 |
| `Contestacao.dc.html` | 14 · Contestação: gestor → supervisor | 1240 |
| `DirecaoB.dc.html` | Alternativa · Placar | 620 |
| `DirecaoC.dc.html` | Alternativa · Caderno | 620 |
| `canvas.json` | Layout, páginas e anotações do canvas | — |

`zona-nova-telas.html` é o canvas montado (gerado — não editar à mão).

## Direção visual (A · Papel e petróleo)

A marca da Zona Nova é **placeholder**: não havia logo, cores nem tipografia da
empresa. O "ZN" e toda a paleta abaixo são proposta, não a identidade real.

| Token | Valor | Uso |
|---|---|---|
| Papel | `#faf8f4` | fundo |
| Superfície | `#ffffff` | cartões |
| Tinta | `#161b1d` | texto |
| Tinta suave | `#5f686b` / `#8a9296` | texto auxiliar |
| Linha | `#e7e2d9` | bordas |
| Petróleo (primário) | `#0f5c6b` | marca, CTA, destaque |
| Petróleo escuro | `#0d4b58` | sidebar |
| Ocre (acento) | `#b8712a` · fundo `#fdf4e7` | coaching, treino |
| Dourado | `#d9a441` | marca sobre fundo escuro, evidência |
| Verde | `#2f7d52` · fundo `#e4f2ea` | bom, conversão |
| Âmbar | `#b07d10` · fundo `#fbf0d8` | atenção |
| Vermelho | `#b3382f` · fundo `#fbe8e6` | perda, risco |

Raio 10-14px. Tipografia: **Bricolage Grotesque** (títulos e números),
**Instrument Sans** (texto e interface).

O primário fica deliberadamente **fora da faixa vermelho/âmbar/verde**: nesse
sistema essas cores carregam significado de nota boa ou ruim, e uma marca
nessa faixa brigaria com a semântica em toda tela. Também fica fora do azul do
MetricsIA (`oklch(0.55 0.16 260)`) para os dois produtos não se confundirem.

## Decisões de desenho

- **9 telas, não 10.** A tela de unidade do supervisor e a de equipe do gestor
  são a mesma — muda só o escopo que a RLS deixa passar.
- **Vendedor a 390px**, gestão a 1440px: reflete como cada papel usa o sistema.
- **Nenhuma chrome falsa de celular** (status bar, teclado) — no aparelho real
  o sistema desenha isso por cima.
- **Evidências ligadas ao transcript** na tela 5. Sem esse vínculo visível a
  nota vira opinião de robô.
- **Estado vazio nunca é nota zero**: vendedor sem movimento aparece como
  ausência de dado, não como desempenho ruim.
- Dados dos mockups são fictícios mas do domínio certo: **Zona Nova é Redemac,
  material de construção**. Obra, tinta, argamassa, laje, rejunte, crediário,
  frete com guindaste. Escritos para exercitar os casos difíceis da doutrina
  (áudio, mensagem automática, mídia ilegível, cliente sem resposta) e as
  violações típicas do MEC (frase proibida, objeção sem o método, sondagem rasa).
- **Aderência é aplicadas ÷ aplicáveis**, e as telas dizem isso em voz alta. O
  que o sistema não vê — ligação, balcão, desconto no Carrinho — aparece como
  não verificável, nunca como descumprimento.
- O canvas tem três páginas: telas do sistema, MEC e aderência, direções.

## Ainda não desenhadas

Deliberadamente fora, porque reaproveitam tela existente ou dependem de decisão:

| Item de navegação | Por quê |
|---|---|
| Supervisor · Pessoas | é a tabela de papéis de `AdminUnidades`, com escopo de supervisor |
| Supervisor · Comparativo | é o gráfico de `Rede` com seletor de indicador — vira variação, não tela |
| Gestor · Configurações | é `Perfil` no papel de gestor |
| Admin · Registro de ações | já existe como cartão em `Admin`; vira tabela cheia na aba |

Quem revisa uma contestação: **o supervisor**. É julgamento de negócio, não
questão técnica — o admin mexe em fila e custo, não em nota de gente. O gestor
não revisa a própria contestação, e o vendedor não contesta direto: fala com o
gestor, que decide se registra.
