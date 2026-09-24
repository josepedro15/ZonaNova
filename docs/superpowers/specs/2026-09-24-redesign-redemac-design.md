# Redesign da plataforma com a identidade Redemac Zona Nova

**Data:** 24 set 2026 · **Branch:** `redesign/redemac` · **Task:** [ClickUp 868m9n9a5](https://app.clickup.com/t/868m9n9a5)
**Mockups aprovados:** [canvas "Zona Nova · Redesign"](https://claude.ai/artifact/SeoF9wFCWtMz9AtQL1ZK5T) — Meu dia (1440 e 390), Sistema visual, Conversa, Minha equipe, Rede.

## 1. Por quê

A plataforma em produção usa uma marca provisória ("ZN", papel/petróleo/ocre)
e cada página monta cartões, KPIs e tabelas à mão em Tailwind inline. O
resultado, visto no `/dashboard` em produção:

- a marca aparece duas vezes no desktop, e o conteúdo fica numa coluna de 800px;
- dois conjuntos de números parecidos disputam a mesma tela (relatório fechado
  de ontem × ao vivo de hoje) sem dizer qual é qual;
- o cartão da nota mostra "—/100" quando não houve negociação;
- KPIs sem comparação, treino em bloco de texto, fila de espera escondida;
- hierarquia plana: tudo com o mesmo peso.

O redesign troca a identidade pela real e cria uma biblioteca de componentes,
para que a hierarquia deixe de depender de cada página acertar sozinha.

## 2. Decisões já tomadas

| Decisão | Escolha |
|---|---|
| Identidade | A real, extraída de rede.zonanova.com.br: azul `#002276`, verde `#0F9531`, logo oficial (PNG 428×204) |
| Papel do verde | **Só marca** (logo, losangos). A semântica "bom" usa verde-azulado `#0B7A6E`, sempre com seta ou texto |
| Tipografia | Montserrat (títulos e números) + Inter (interface), empacotadas no build, sem Google Fonts em tempo de build |
| "Meu dia" | **Hoje primeiro** (fila + ao vivo). O relatório de ontem vem abaixo, como bloco com nome e data |
| Entrega | Mockups aprovados → implementação no app |
| Abordagem | Tokens + biblioteca própria em `components/ui/`, migrando tela a tela. Sem shadcn/Radix |

## 3. Fora do escopo

- Nenhuma mudança de schema, RLS, worker, fila ou pipeline de análise.
- Nenhuma feature nova de backend. Todo número novo nas telas é **derivado de
  tabelas que já existem** (§6). O que não puder ser derivado fica fora.
- Nada que dependa de ERP: conversão continua sendo a inferida pela IA.
- Modo escuro.
- CIRCE (fonte paga do site). Entra depois, se a Zona Nova tiver licença web.

## 4. Sistema visual

### 4.1 Tokens (`app/globals.css`, bloco `@theme`)

| Token | Valor | Uso |
|---|---|---|
| `azul` | `#002276` | primário: sidebar, botão principal, link, item ativo, cartão-herói |
| `azul-2` | `#0B3494` | hover |
| `azul-sof` | `#E9EEF9` | fundo de treino, bolha de saída, chip selecionado |
| `verde-marca` | `#0F9531` | **só** logo e losango decorativo. Proibido em dado |
| `fundo` | `#F5F7FA` | fundo da página |
| `superficie` | `#FFFFFF` | cartões |
| `superficie-2` | `#F0F3F8` | avatar, chip neutro, cabeçalho de tabela |
| `linha` / `linha-2` | `#E3E7EF` / `#EEF1F5` | borda de cartão / divisória interna |
| `linha-campo` | `#C5CCD8` | borda de input, tracejado |
| `tinta` / `tinta-2` / `tinta-3` | `#0E1726` / `#4A5568` / `#6B7589` | texto (tinta-3 ≥ 4.5:1 sobre branco) |
| `bom` / `bom-sof` / `bom-texto` | `#0B7A6E` / `#E3F4F1` / `#0B6A60` | acima da média, respondida, conectado |
| `bom-claro` | `#4CC9B0` | ponto de "conectado" sobre o azul da sidebar |
| `atencao` / `atencao-sof` / `atencao-texto` | `#B26B00` / `#FDF1DC` / `#8A5300` | espera 30 min–2 h, queda leve |
| `risco` / `risco-sof` / `risco-texto` | `#C2362B` / `#FCE9E7` / `#A52C22` | espera > 2 h, fora do ar, queda forte |
| `evidencia` / `evidencia-sof` | `#E0A43A` / `#FDF1DC` | grifo de trecho citado pela análise |

Raios: `--radius-card: 12px`, `--radius-ctl: 8px`. Sem sombra: cartão é borda de 1px.

**Transição sem tela quebrada.** Na fase 0, os tokens antigos (`petroleo`,
`papel`, `ocre`, `verde`, `ambar`, `vermelho`...) viram **apelidos** dos novos
valores. Assim toda tela ainda não migrada já sai azul e neutra, e nada fica
meio antigo, meio novo em produção. Os apelidos saem na última fase, quando
`grep` não achar mais nenhum uso.

### 4.2 Tipografia

- `@fontsource-variable/montserrat` e `@fontsource-variable/inter` como
  dependências, importadas em `app/layout.tsx`. As fontes vêm do `node_modules`
  no build, sem rede (o problema que o commit `f39ec52` resolveu não volta).
- `--font-display: 'Montserrat Variable'`, `--font-sans: 'Inter Variable'`.
- Escala: 12 / 13 / 14 / 16 / 20 / 28 / 32 (título de página) / 34–56 (número-herói).
- Números: `font-variant-numeric: tabular-nums` em todo KPI.
- Rótulo de seção: 12px, 700, caixa-alta, `tracking 0.09em`, `azul`, com losango de 8px.

### 4.3 Marca

- `public/marca/logo.png` (original) e `public/marca/logo-branco.png` (letras
  azuis → brancas, losangos intactos, gerado do original).
- `app/marca.tsx` passa a renderizar `<Image>` do logo (`invertida` → branco).
  O monograma "ZN" some.
- O losango arredondado entra em dose pequena: marcador de seção, marcador do
  item ativo na sidebar, estado vazio.

### 4.4 Layout

- Desktop: sidebar azul de 248px + conteúdo com padding 40–48px, grade de 12
  colunas, sem `max-width` estreito (até ~1200px úteis).
- Celular (< 1024px): barra superior branca com logo e status + barra inferior
  com ícone e rótulo (até 5 itens), conteúdo em uma coluna, padding lateral 16px.
- Alvos de toque ≥ 44px.

## 5. Componentes (`components/ui/`)

Um ficheiro por componente, Server Components por padrão, sem estado, só props.
A única exceção é o `BotaoCopiar` (client). O nome é em português, como o resto
do código.

| Componente | Faz | Props principais |
|---|---|---|
| `Icone` | conjunto fechado de ícones SVG de traço (casa, conversa, tendência, mec, pessoa, equipe, rede, relógio, seta, sair, check, engrenagem, lâmpada, wifi-off, copiar) | `nome`, `tamanho` |
| `Shell` | substitui `components/app-shell.tsx`: sidebar com logo branco, itens com ícone, badge de pendências, bloco do usuário e status do WhatsApp; no celular, topo + barra inferior | `papel`, `nome`, `legenda`, `atual`, `conexao?`, `pendentes?` |
| `CabecalhoPagina` | sobretítulo, título, ações à direita | `sobre`, `titulo`, `acoes?` |
| `RotuloSecao` | losango + rótulo em caixa-alta + complemento | `children`, `complemento?`, `acao?` |
| `Cartao` | superfície com borda; variantes `padrao`, `heroi` (azul), `suave` (azul-sof), `tracejado` | `variante`, `as?` |
| `Numero` | valor grande tabular com unidade menor | `valor`, `unidade?`, `tamanho` |
| `Comparacao` | "▲ 4 acima da sua média" com tom derivado do sinal e de `melhorQuando` | `delta`, `texto`, `melhorQuando: 'maior'\|'menor'` |
| `Kpi` | rótulo + `Numero` + `Comparacao` ou legenda | `rotulo`, `valor`, `unidade?`, `comparacao?`, `legenda?`, `link?` |
| `Selo` | pílula com tom (`bom`/`atencao`/`risco`/`neutro`/`azul`) e ponto opcional | `tom`, `ponto?` |
| `TempoEspera` | chip de espera com tom pela regra (< 30 min neutro, até 2 h atenção, > 2 h risco) | `ms` |
| `Botao` / `BotaoLink` | `primario`, `secundario`, `texto` | `variante`, `href?` |
| `Barra` | barra de progresso com tom | `pct`, `tom` |
| `SerieDias` | barras de 14 dias: dia sem relatório = traço, dia sem nota = tracejado (regra já existente em `/dashboard`) | `dias`, `invertida?` |
| `Tabela` | grade de linhas clicáveis com cabeçalho; colunas por `grid-template-columns` | `colunas`, `linhas`, `vazio` |
| `Avatar` | iniciais ou ícone de pessoa quando não há nome (regra atual de `iniciais()`) | `nome` |
| `EstadoVazio` | losango + título + texto; nunca nota zero | `titulo`, `texto`, `acao?` |
| `Segmentado` | seletor segmentado que troca um parâmetro da URL por link (sem JS): indicador da Rede, e depois período | `rotulo`, `opcoes`, `atual`, `base`, `param` |
| `Pagina` | contêiner de conteúdo: largura máxima, padding e espaçamento entre blocos | `children` |
| `Alerta` | faixa colorida com ícone, título, texto e ação (alertas da equipe, "onde você precisa entrar") | `tom`, `icone`, `titulo`, `acao?` |
| `Sparkline` / `GraficoLinhas` | linha simples no cartão-herói; linhas por loja com destaque em duas e rótulo no fim | `valores` / `series`, `formato` |
| `BotaoCopiar` | copia texto para a área de transferência (client) | `texto` |

Regras de tom e comparação viram **funções puras em `lib/visual.ts`**, com
teste unitário: `tomEspera(ms)`, `tomFaixa(valor, risco, atencao)`, `tomDelta(delta, melhorQuando)`,
`setaDoTom(tom)`, `comparaTempo(...)`, `media(...)`, `iniciais(nome)` (movida do dashboard),
`grifar`/`grifarConversa`, `caminhoSvg`, `afastarRotulos`. Derivações de dado
(variação semanal, com quem falar, objeções, séries e destaques da rede) ficam
em `lib/derivacoes.ts`, também testadas. Os componentes
só as chamam.

## 6. Telas

Cada tela mantém as mesmas queries do Supabase. Onde o mockup pede um número
novo, a origem está indicada. Tudo vem de tabela existente, lida pela RLS de sempre.

### 6.1 Prioridade 1: as quatro dos mockups

**`/dashboard` (Meu dia)**, conforme o mockup:
1. Cabeçalho: data, saudação, selo "última mensagem às …", selo de conexão.
2. `RotuloSecao` "Agora" → `Esperando você` (7 col) + `Hoje até agora` (5 col).
   - Comparações de "Hoje até agora": conversas × média de `leads_atendidos`
     dos últimos 7 relatórios; resposta × `tempo_medio_resposta_s` de ontem.
3. `RotuloSecao` "Seu relatório de ontem · <data> · fechado às 00h30":
   cartão-herói da nota (+ `Comparacao` × média de 7 dias + `SerieDias`),
   4 `Kpi`. Sem nota → `EstadoVazio` "Ontem não teve nota", nunca "—/100".
4. Treino (cartão `suave`): resumo como título, 3 melhorias em cartões
   numerados, "O que funcionou" e "Desafio". Seu MEC com barras por etapa
   (`por_etapa` de `aderencia_diaria`); etapa não verificável = barra tracejada "n/v".
5. Conversas de hoje em `Tabela`: cliente, mensagens, áudios, última, situação.
6. Observações do gestor (existe hoje) entram abaixo do treino, como cartão.

**`/conversas/[id]`**: transcript (7 col) + análise (5 col) como no mockup.
- Grifo de evidência: marcar no transcript o trecho de `payload.evidencias[].trecho`
  quando for substring de uma mensagem (função pura `grifar(texto, trechos)`
  em `lib/visual.ts`, com teste). O número do grifo casa com a lista de evidências.
- Próxima ação no cartão-herói, "Responda assim" com `BotaoCopiar`.
- Rodapé de espera quando o cliente falou por último (`esperaDoCliente`).
- Contestação (gestor+) continua dentro de cada etapa do MEC, no novo visual.

**`/equipe` (gestor) e `/unidades/[id]` (supervisor)**: a mesma tela
(componente `VisaoUnidade`), como já diz o doc 5.
- Alertas: números fora do ar (`vw_conexoes_status`), clientes esperando
  (conversas da unidade com `esperaDoCliente`), cadastros pendentes.
- 5 KPIs da unidade × rede (`relatorios_unidade`, `relatorios_rede`), do último
  relatório fechado. O seletor Ontem / 7 dias / 30 dias do mockup fica para a
  fase 3: exige agregar por período, e a fase 2 não mexe nisso.
- Tabela de vendedores com barra de nota e tendência de 7 dias (`relatorios_diarios`).
- **Com quem falar hoje**: os 2 vendedores com maior queda de nota em 7 dias, e
  a etapa do MEC mais fraca de cada um (`aderencia_diaria.por_etapa`). Função
  pura `comQuemFalar(...)` com teste.
- **Objeções da semana**: contagem de `analises_conversa.payload.objecoes` dos
  últimos 7 dias da unidade, top 4. Função pura `contarObjecoes(...)` com teste.

**`/unidades` (Rede)**: nota da rede com série, gráfico de lojas em 12 semanas
(`relatorios_unidade`), com seletor de indicador por `?indicador=`, destacando
a loja que mais subiu e a que mais caiu. Ranking, "Onde você precisa entrar"
(regras: maior queda no período; loja sem gestor ativo) e conexões fora do ar.
Função pura `destaquesDaRede(...)` com teste.

### 6.2 Prioridade 2: vendedor

`/conversas` (lista com filtro atual), `/evolucao`, `/meu-mec`, `/perfil`,
`/conectar` (QR e estados; o `painel.tsx` client mantém a lógica e só troca o visual).

### 6.3 Prioridade 3: gestão

`/equipe/[vendedor]` (Meu dia em modo leitura + observação), `/equipe/mec`
(matriz vendedor × etapa), `/aprovacoes`, `/mec`, `/descobertas`.

### 6.4 Prioridade 4: admin

`/admin`, `/admin/unidades`, `/admin/conexoes`, `/admin/eventos`. São telas
densas de operação: `Tabela` + formulários, sem cartão-herói.

### 6.5 Prioridade 5: acesso

`/login`, `/cadastro`, `/aguardando-aprovacao`, `/recuperar-senha`,
`/nova-senha`. Coluna de 400px centrada sobre `fundo`, logo oficial no topo.
No desktop, painel azul à esquerda com os losangos.

## 7. Como fica o código de página

As páginas hoje minificadas numa linha (`/equipe`, `/unidades`, `/admin/*`...)
são reescritas legíveis ao migrar. A regra de cada tela:

```
page.tsx (server)  → busca dados (queries atuais) → deriva com lib/ (puro, testado)
                   → compõe com components/ui/ (sem regra de negócio)
```

Nenhuma cor em hex e nenhuma classe de token antigo em página migrada.

## 8. Fases e entrega

| Fase | Conteúdo | Pronto quando |
|---|---|---|
| 0 · Fundação | tokens novos + apelidos, fontes, logo, `Marca` | build ok; todas as telas já azuis, sem quebra |
| 1 · Componentes | `components/ui/*` + `lib/visual.ts` com testes | testes ok; página `/dev/ui` (só em dev) mostra todos |
| 2 · Telas P1 | Meu dia, Conversa, Equipe/Unidade, Rede | conferidas a 390 e 1440 contra o mockup |
| 3 · Telas P2–P3 | vendedor e gestão | idem |
| 4 · Telas P4–P5 | admin e acesso | idem |
| 5 · Limpeza | remove apelidos e `app-shell.tsx`; atualiza `design/README.md` e doc 5 | `grep` sem token antigo; build, lint, typecheck, testes |

Um commit por tela ou componente; um PR por fase (ou por fase agrupada, se preferir).

## 9. Verificação

- A cada fase: `npm run typecheck`, `npm run lint`, `npm run test:unidade`, `npm run build`.
- Funções de `lib/visual.ts` e de derivação: TDD (`node --test`, padrão de `tests/unidade/`).
- Visual: dev server (`.claude/launch.json` → `zonanova`) no painel do browser,
  cada tela a 390 e 1440, sem erro no console, comparada com o mockup.
- **Login no browser**: as telas exigem sessão. Quem entra na conta é você, no
  painel do browser. Eu não digito senha. Com a sessão aberta, eu navego e confiro.
- Estados vazios conferidos: sem conexão, sem relatório, dia sem nota, sem conversas.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Número novo sem dado suficiente (loja com 1 dia de histórico) | Toda derivação retorna `null` e a tela mostra ausência, não zero |
| Consultas extras deixam o dashboard lento | Só a janela de 7–30 dias, com os `limit` atuais; sem N+1 |
| Grifo de evidência não bate (IA parafraseou) | Sem match → a evidência aparece só na lista, sem grifo; nunca grifa errado |
| Logo PNG pixelado em tela retina | 428px de largura servidos a 150px (2,8×): suficiente. Troca por SVG quando a Zona Nova enviar |
