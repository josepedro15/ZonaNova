# Redesign Redemac — Fases 0 a 2 · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a marca provisória pela identidade Redemac Zona Nova, criar a biblioteca `components/ui/` e reescrever as quatro telas dos mockups aprovados (Meu dia, Conversa, Minha equipe/Unidade, Rede).

**Architecture:** Tokens novos em `app/globals.css`, com os antigos como apelidos, para nenhuma tela ficar metade velha. Regras de apresentação e derivações de dado são funções puras em `lib/visual.ts` e `lib/derivacoes.ts`, feitas com TDD. Os componentes em `components/ui/` são Server Components sem regra de negócio. As páginas mantêm as queries do Supabase e só compõem.

**Tech Stack:** Next 16.3.6 (App Router, `typedRoutes`), React 19.2, Tailwind v4 (`@theme`), Supabase JS, `node --test` com TS nativo (Node 25), `@fontsource-variable/*`.

**Spec:** `docs/superpowers/specs/2026-09-24-redesign-redemac-design.md` · **Mockups:** https://claude.ai/artifact/SeoF9wFCWtMz9AtQL1ZK5T

**Fora deste plano:** telas P2 a P5 (vendedor, gestão, admin, acesso) e a limpeza da fase 5. Ficam para o segundo plano, escrito depois deste entrar.

## Global Constraints

- Branch `redesign/redemac`. Não commitar os `docs/0*.md` que já estavam modificados antes. Faça `git add` só dos arquivos da tarefa.
- Nenhuma mudança de schema, RLS, worker, fila, `proxy.ts` ou actions.
- Nenhuma cor em hex em página nem em componente. Só tokens (`bg-azul`, `text-risco-texto`...). A única exceção é `app/globals.css`.
- O verde da marca (`verde-marca`) só aparece no logo e nos losangos, nunca num dado.
- Toda cor semântica vem acompanhada de seta ou texto (`▲`/`▼`/`=`, "Esperando 42min").
- Ausência de dado aparece como ausência ("Não teve nota", "—", "sem dado"), nunca como zero.
- Conversão é sempre a inferida pela IA. Nada depende de ERP.
- Imports entre arquivos de `lib/` usam extensão `.ts` (`'./visual.ts'`), porque `node --test` exige. Componentes e páginas importam por `@/lib/...`.
- Textos da interface em português do Brasil, com linguagem de vendas.
- Alvos de toque ≥ 44px (`min-h-11`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `app/globals.css` | tokens novos + apelidos antigos |
| `app/layout.tsx` | importa as fontes do `@fontsource-variable` |
| `app/marca.tsx` | logo oficial via `next/image` (mesma API de hoje) |
| `public/marca/logo.png`, `logo-branco.png` | logo oficial e versão para fundo azul |
| `lib/visual.ts` + `tests/unidade/visual.test.ts` | tons, setas, comparação de tempo, média, iniciais, grifo, SVG |
| `lib/derivacoes.ts` + `tests/unidade/derivacoes.test.ts` | etapas do MEC, variação semanal, com quem falar, objeções, séries e destaques da rede |
| `components/ui/*.tsx` + `components/ui/index.ts` | biblioteca de componentes |
| `components/app-shell.tsx` | vira reexport do `Shell` (transição) |
| `app/dev/ui/page.tsx` | vitrine dos componentes, só em desenvolvimento |
| `app/(app)/dashboard/page.tsx`, `secoes.tsx`, `formato.ts` | Meu dia |
| `app/(app)/conversas/[id]/page.tsx`, `transcricao.tsx` | Conversa e análise |
| `app/(app)/equipe/visao-unidade.tsx`, `page.tsx`; `app/(app)/unidades/[id]/page.tsx` | Minha equipe / Unidade |
| `app/(app)/unidades/page.tsx` | A rede |

## Como verificar visualmente (vale para as Tasks 4 a 10)

1. `preview_start` com `{name: "zonanova"}` (o `.claude/launch.json` já tem `npm run dev` na porta 3000).
2. As telas exigem sessão. **Peça ao usuário para entrar na conta no painel do browser.** Não digite senha nem e-mail de ninguém.
3. Para cada tela: `resize_window` com `preset: "mobile"` (390) e depois `width: 1440, height: 900`, `read_console_messages` com `onlyErrors: true`, e uma `screenshot`. Compare com o artboard do mockup.
4. Volte com `resize_window` e `preset: "desktop"` no fim.

---

### Task 1: Fundação — tokens, fontes e logo oficial

**Files:**
- Create: `public/marca/logo.png`, `public/marca/logo-branco.png`
- Modify: `app/globals.css` (arquivo inteiro), `app/layout.tsx`, `app/marca.tsx` (arquivo inteiro), `package.json` (via npm)

**Interfaces:**
- Produces: classes Tailwind `bg-azul`, `bg-azul-2`, `bg-azul-sof`, `bg-verde-marca`, `bg-fundo`, `bg-superficie`, `bg-superficie-2`, `border-linha`, `border-linha-2`, `border-linha-campo`, `text-tinta`, `text-tinta-2`, `text-tinta-3`, `*-bom`, `*-bom-sof`, `*-bom-texto`, `*-bom-claro`, `*-atencao(-sof|-texto)`, `*-risco(-sof|-texto)`, `*-evidencia(-sof)`, `rounded-card`, `rounded-ctl`, `font-display`, `font-sans`, e utilitário `.num` (algarismos tabulares). `Marca` com a mesma assinatura de hoje: `{ tamanho?: 'sm'|'md'; orientacao?: 'horizontal'|'vertical'; legenda?: string; invertida?: boolean }`.

- [ ] **Step 1: Baixar o logo e gerar a versão branca**

```bash
mkdir -p public/marca
curl -sSL -o public/marca/logo.png https://rede.zonanova.com.br/wp-content/uploads/2024/10/logo.png
file public/marca/logo.png
```
Expected: `PNG image data, 428 x 204, 8-bit/color RGBA`

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open('public/marca/logo.png').convert('RGBA')
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        # Letras são azuis (b > g); losangos são verdes (g > b) e ficam como estão.
        if a and b > g:
            px[x, y] = (255, 255, 255, a)
im.save('public/marca/logo-branco.png')
EOF
```
Abra `public/marca/logo-branco.png` com a ferramenta Read. O esperado são letras brancas e 4 losangos verdes.

- [ ] **Step 2: Instalar as fontes**

```bash
npm install @fontsource-variable/montserrat @fontsource-variable/inter
```

- [ ] **Step 3: Reescrever `app/globals.css`**

```css
@import "tailwindcss";

/* =============================================================================
 * Identidade Redemac Zona Nova — valores de rede.zonanova.com.br.
 * Spec: docs/superpowers/specs/2026-09-24-redesign-redemac-design.md §4.
 * O verde da marca é só marca: nunca em dado, para não ser lido como "bom".
 * ========================================================================== */

@theme {
  --color-azul:        #002276;
  --color-azul-2:      #0B3494;
  --color-azul-sof:    #E9EEF9;
  --color-verde-marca: #0F9531;

  --color-fundo:        #F5F7FA;
  --color-superficie:   #FFFFFF;
  --color-superficie-2: #F0F3F8;
  --color-linha:        #E3E7EF;
  --color-linha-2:      #EEF1F5;
  --color-linha-campo:  #C5CCD8;
  --color-tinta:        #0E1726;
  --color-tinta-2:      #4A5568;
  --color-tinta-3:      #6B7589;

  --color-bom:           #0B7A6E;
  --color-bom-sof:       #E3F4F1;
  --color-bom-texto:     #0B6A60;
  --color-bom-claro:     #4CC9B0;
  --color-atencao:       #B26B00;
  --color-atencao-sof:   #FDF1DC;
  --color-atencao-texto: #8A5300;
  --color-risco:         #C2362B;
  --color-risco-sof:     #FCE9E7;
  --color-risco-texto:   #A52C22;
  --color-evidencia:     #E0A43A;
  --color-evidencia-sof: #FDF1DC;

  /* Apelidos da marca provisória. Existem só para as telas ainda não migradas
   * saírem na cor nova; somem na fase 5, quando o grep não achar mais uso. */
  --color-papel:          #F5F7FA;
  --color-papel-2:        #F0F3F8;
  --color-petroleo:       #002276;
  --color-petroleo-esc:   #002276;
  --color-petroleo-sof:   #E9EEF9;
  --color-ocre:           #0B3494;
  --color-ocre-sof:       #E9EEF9;
  --color-ocre-texto:     #002276;
  --color-ocre-texto-2:   #1E2B45;
  --color-dourado:        #E0A43A;
  --color-linha-quente:   #D5DEF2;
  --color-verde:          #0B7A6E;
  --color-verde-sof:      #E3F4F1;
  --color-ambar:          #B26B00;
  --color-ambar-sof:      #FDF1DC;
  --color-ambar-texto:    #8A5300;
  --color-vermelho:       #C2362B;
  --color-vermelho-sof:   #FCE9E7;
  --color-vermelho-linha: #F2CCC8;
  --color-vermelho-texto: #A52C22;

  /* Vêm do node_modules (@fontsource-variable), importadas em app/layout.tsx:
   * o build não depende de rede. */
  --font-display: 'Montserrat Variable', Montserrat, 'Helvetica Neue', Arial, sans-serif;
  --font-sans:    'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;

  --radius-card: 12px;
  --radius-ctl:  8px;
  --radius-lg:   14px;
}

:root { color-scheme: light; }

body {
  background: var(--color-fundo);
  color: var(--color-tinta);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

.display { font-family: var(--font-display); letter-spacing: -0.02em; }
.num { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Importar as fontes em `app/layout.tsx`**

Acrescente as duas linhas antes de `import './globals.css';`:

```tsx
import '@fontsource-variable/montserrat';
import '@fontsource-variable/inter';
import './globals.css';
```

- [ ] **Step 5: Reescrever `app/marca.tsx`**

```tsx
import Image from 'next/image';
import logo from '@/public/marca/logo.png';
import logoBranco from '@/public/marca/logo-branco.png';

/**
 * A marca, num sítio só: o logo oficial da Redemac Zona Nova (PNG do site,
 * 428×204). `invertida` usa a versão de letras brancas, para fundo azul.
 * A API é a mesma da marca provisória, e as páginas não precisaram mudar.
 */
export default function Marca({
    tamanho = 'sm',
    orientacao = 'horizontal',
    legenda,
    invertida = false,
}: {
    tamanho?: 'sm' | 'md';
    orientacao?: 'horizontal' | 'vertical';
    legenda?: string;
    invertida?: boolean;
}) {
    const largura = tamanho === 'md' ? 168 : 104;
    const imagem = (
        <Image src={invertida ? logoBranco : logo} alt="Redemac Zona Nova" width={largura} priority />
    );
    if (!legenda) return imagem;
    const texto = (
        <span className={`text-xs ${invertida ? 'text-white/65' : 'text-tinta-3'}`}>{legenda}</span>
    );
    return orientacao === 'vertical' ? (
        <div className="flex flex-col items-center gap-3">{imagem}{texto}</div>
    ) : (
        <div className="flex items-center gap-3">
            {imagem}
            <span className={`h-7 w-px ${invertida ? 'bg-white/25' : 'bg-linha'}`} aria-hidden="true" />
            {texto}
        </div>
    );
}
```

- [ ] **Step 6: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: os três terminam sem erro.

- [ ] **Step 7: Conferir no browser**

`preview_start {name: "zonanova"}` e navegue até `http://localhost:3000/login`. Essa rota não exige sessão. Tire uma `screenshot` e confira: logo oficial, fundo `#F5F7FA`, botão azul `#002276`, fonte Inter (`javascript_tool`: `getComputedStyle(document.body).fontFamily` começa com `"Inter Variable"`).

- [ ] **Step 8: Commit**

```bash
git add public/marca app/globals.css app/layout.tsx app/marca.tsx package.json package-lock.json
git commit -m "feat: identidade Redemac — tokens, fontes empacotadas e logo oficial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/visual.ts` — regras de apresentação (TDD)

**Files:**
- Create: `lib/visual.ts`
- Test: `tests/unidade/visual.test.ts`

**Interfaces:**
- Produces:
  - `type Tom = 'bom' | 'atencao' | 'risco' | 'neutro' | 'azul'`
  - `type Sentido = 'maior' | 'menor'`
  - `tomEspera(ms: number): Tom`
  - `tomFaixa(valor: number, risco: number, atencao: number): Tom`
  - `tomDelta(delta: number | null, melhorQuando: Sentido): Tom`
  - `setaDoTom(tom: Tom): '▲' | '▼' | '='`
  - `comparaTempo(atual: number, base: number, referencia?: string): string`
  - `media(valores: readonly (number | string | null | undefined)[]): number | null`
  - `iniciais(nome: string | null | undefined): string | null`
  - `type Pedaco = { texto: string; grifo: number | null }`
  - `grifar(texto: string, trechos: readonly string[]): Pedaco[]`
  - `grifarConversa(textos: readonly string[], trechos: readonly string[]): Pedaco[][]`
  - `caminhoSvg(pontos: readonly ([number, number] | null)[]): string`
  - `afastarRotulos(ys: readonly number[], distancia: number): number[]`

- [ ] **Step 1: Escrever os testes**

`tests/unidade/visual.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    afastarRotulos, caminhoSvg, comparaTempo, grifar, grifarConversa, iniciais, media,
    setaDoTom, tomDelta, tomEspera, tomFaixa,
} from '../../lib/visual.ts';

const MIN = 60 * 1000;

// --- tons -------------------------------------------------------------------

test('espera: até 30 min é neutra, até 2 h pede atenção, depois é risco', () => {
    assert.equal(tomEspera(12 * MIN), 'neutro');
    assert.equal(tomEspera(30 * MIN), 'neutro');
    assert.equal(tomEspera(31 * MIN), 'atencao');
    assert.equal(tomEspera(120 * MIN), 'atencao');
    assert.equal(tomEspera(121 * MIN), 'risco');
});

test('faixa: abaixo do risco, entre risco e atenção, acima', () => {
    assert.equal(tomFaixa(29, 35, 50), 'risco');
    assert.equal(tomFaixa(40, 35, 50), 'atencao');
    assert.equal(tomFaixa(50, 35, 50), 'azul');
});

test('delta: subir é bom quando maior é melhor', () => {
    assert.equal(tomDelta(4, 'maior'), 'bom');
    assert.equal(tomDelta(-4, 'maior'), 'risco');
});

// Tempo de resposta melhora caindo: a mesma queda é boa notícia.
test('delta: cair é bom quando menor é melhor', () => {
    assert.equal(tomDelta(-10, 'menor'), 'bom');
    assert.equal(tomDelta(10, 'menor'), 'risco');
});

test('delta nulo ou zero é neutro', () => {
    assert.equal(tomDelta(null, 'maior'), 'neutro');
    assert.equal(tomDelta(0, 'menor'), 'neutro');
});

test('seta acompanha o tom, não o sinal', () => {
    assert.equal(setaDoTom('bom'), '▲');
    assert.equal(setaDoTom('risco'), '▼');
    assert.equal(setaDoTom('neutro'), '=');
});

// --- comparação de tempo ------------------------------------------------------

test('tempo: o dobro ou mais vira "N× mais lenta"', () => {
    assert.equal(comparaTempo(125, 41), '3× mais lenta que sua média (41 min)');
});

test('tempo: metade ou menos vira "N× mais rápida", com a referência nomeada', () => {
    assert.equal(comparaTempo(14, 125, 'ontem'), '9× mais rápida que ontem (125 min)');
});

test('tempo: diferença pequena vira minutos', () => {
    assert.equal(comparaTempo(18, 12), '6 min mais lenta que sua média');
    assert.equal(comparaTempo(9, 12), '3 min mais rápida que sua média');
});

test('tempo: igual diz sem mudança', () => {
    assert.equal(comparaTempo(12.2, 11.8), 'sem mudança (sua média: 12 min)');
});

// --- média --------------------------------------------------------------------

test('média ignora nulos e aceita número que chega como texto do PostgREST', () => {
    assert.equal(media([10, null, '20', undefined]), 15);
});

test('média sem valor nenhum é null, nunca zero', () => {
    assert.equal(media([null, undefined, '']), null);
    assert.equal(media([]), null);
});

// --- iniciais -----------------------------------------------------------------

test('iniciais: primeiro e último nome', () => {
    assert.equal(iniciais('Marcos da Silva Teixeira'), 'MT');
    assert.equal(iniciais('Nexo'), 'NE');
});

// Sem nome, um ícone de pessoa é mais honesto que dígitos de telefone.
test('iniciais: sem nome devolve null', () => {
    assert.equal(iniciais(null), null);
    assert.equal(iniciais('   '), null);
});

// --- grifo de evidência ---------------------------------------------------------

test('grifa o trecho citado, ignorando aspas, reticências e maiúsculas', () => {
    assert.deepEqual(grifar('Bom dia! É obra nova ou repintura?', ['"é obra nova ou repintura?"']), [
        { texto: 'Bom dia! ', grifo: null },
        { texto: 'É obra nova ou repintura?', grifo: 1 },
    ]);
});

test('o número do grifo é a posição da evidência na lista', () => {
    const p = grifar('a obra tá atrasada e eu preciso pintar', ['outro trecho', 'a obra tá atrasada…']);
    assert.deepEqual(p[0], { texto: 'a obra tá atrasada', grifo: 2 });
});

// Grifar errado é pior que não grifar.
test('sem correspondência exata, não grifa nada', () => {
    assert.deepEqual(grifar('Consigo 1.310 à vista', ['consigo fazer por 1.310']), [
        { texto: 'Consigo 1.310 à vista', grifo: null },
    ]);
});

test('trecho curto demais é ignorado', () => {
    assert.deepEqual(grifar('ok, fechado', ['ok']), [{ texto: 'ok, fechado', grifo: null }]);
});

test('na conversa, cada evidência grifa só a primeira mensagem onde aparece', () => {
    const r = grifarConversa(['tem argamassa?', 'tem argamassa sim'], ['tem argamassa']);
    assert.equal(r[0].find((p) => p.grifo !== null)?.grifo, 1);
    assert.equal(r[1].every((p) => p.grifo === null), true);
});

// --- SVG ----------------------------------------------------------------------

test('caminho SVG recomeça depois de um buraco', () => {
    assert.equal(caminhoSvg([[0, 10], [5, 20], null, [15, 5]]), 'M0 10 L5 20 M15 5');
});

test('rótulos próximos são afastados, mantendo a ordem original', () => {
    assert.deepEqual(afastarRotulos([100, 60, 104], 14), [100, 60, 114]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unidade/visual.test.ts`
Expected: FAIL, `Cannot find module '.../lib/visual.ts'`.

- [ ] **Step 3: Implementar `lib/visual.ts`**

```ts
/**
 * Regras de apresentação, puras e testadas: que tom uma espera tem, se uma
 * variação é boa ou ruim, onde grifar uma evidência. Os componentes de
 * components/ui só chamam estas funções — regra de negócio não mora em JSX.
 */

export type Tom = 'bom' | 'atencao' | 'risco' | 'neutro' | 'azul';
export type Sentido = 'maior' | 'menor';

const MINUTO = 60 * 1000;

/** Até 30 min é o normal do balcão; até 2 h pede atenção; depois o lead esfria. */
export function tomEspera(ms: number): Tom {
    if (ms <= 30 * MINUTO) return 'neutro';
    if (ms <= 120 * MINUTO) return 'atencao';
    return 'risco';
}

/** Faixa de nota ou percentual: abaixo de `risco` é risco; abaixo de `atencao`, atenção. */
export function tomFaixa(valor: number, risco: number, atencao: number): Tom {
    if (valor < risco) return 'risco';
    if (valor < atencao) return 'atencao';
    return 'azul';
}

/** Tom de uma variação. `menor` é para o que melhora caindo (tempo de resposta). */
export function tomDelta(delta: number | null, melhorQuando: Sentido): Tom {
    if (delta === null || delta === 0) return 'neutro';
    return (melhorQuando === 'maior') === (delta > 0) ? 'bom' : 'risco';
}

/** A seta acompanha a cor: quem não distingue as cores lê a seta. */
export function setaDoTom(tom: Tom): '▲' | '▼' | '=' {
    if (tom === 'bom') return '▲';
    if (tom === 'risco') return '▼';
    return '=';
}

/** Compara dois tempos em minutos, em português de balcão. */
export function comparaTempo(atual: number, base: number, referencia = 'sua média'): string {
    const a = Math.round(atual);
    const b = Math.round(base);
    if (a === b) return `sem mudança (${referencia}: ${b} min)`;
    if (b > 0 && a >= 2 * b) return `${Math.round(a / b)}× mais lenta que ${referencia} (${b} min)`;
    if (a > 0 && b >= 2 * a) return `${Math.round(b / a)}× mais rápida que ${referencia} (${b} min)`;
    return `${Math.abs(a - b)} min mais ${a > b ? 'lenta' : 'rápida'} que ${referencia}`;
}

/** Média do que é número. O PostgREST às vezes manda `numeric` como texto. */
export function media(valores: readonly (number | string | null | undefined)[]): number | null {
    const xs = valores
        .map((v) => (typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

/**
 * Duas letras para o avatar, ou null quando o cliente ainda não tem nome.
 * Sem nome, um ícone de pessoa é mais honesto do que dígitos de telefone
 * disfarçados de iniciais.
 */
export function iniciais(nome: string | null | undefined): string | null {
    const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return null;
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export type Pedaco = { texto: string; grifo: number | null };

/** Tira aspas e reticências que a IA põe em volta do trecho citado. */
function limparTrecho(trecho: string): string {
    let t = trecho.trim();
    for (let i = 0; i < 2; i++) {
        t = t.replace(/^["“”'«»]+|["“”'«»]+$/g, '').replace(/^(\.\.\.|…)+|(\.\.\.|…)+$/g, '').trim();
    }
    return t;
}

const TRECHO_MINIMO = 4;

/**
 * Parte o texto de uma mensagem nos pedaços que a análise citou. `grifo` é o
 * número da evidência (a ordem da lista, a partir de 1). Só grifa com
 * correspondência exata, ignorando maiúsculas: grifar errado é pior que não
 * grifar. Trecho curto ("ok") casaria em todo lado e é ignorado.
 */
export function grifar(texto: string, trechos: readonly string[]): Pedaco[] {
    const baixo = texto.toLocaleLowerCase('pt-BR');
    const achados: { ini: number; fim: number; grifo: number }[] = [];
    trechos.forEach((trecho, i) => {
        const alvo = limparTrecho(trecho);
        if (alvo.length < TRECHO_MINIMO) return;
        const ini = baixo.indexOf(alvo.toLocaleLowerCase('pt-BR'));
        if (ini < 0) return;
        const fim = ini + alvo.length;
        if (achados.some((a) => ini < a.fim && fim > a.ini)) return;
        achados.push({ ini, fim, grifo: i + 1 });
    });
    achados.sort((a, b) => a.ini - b.ini);
    const pedacos: Pedaco[] = [];
    let pos = 0;
    for (const a of achados) {
        if (a.ini > pos) pedacos.push({ texto: texto.slice(pos, a.ini), grifo: null });
        pedacos.push({ texto: texto.slice(a.ini, a.fim), grifo: a.grifo });
        pos = a.fim;
    }
    if (pos < texto.length || pedacos.length === 0) pedacos.push({ texto: texto.slice(pos), grifo: null });
    return pedacos;
}

/** Grifa a conversa inteira: cada evidência só na primeira mensagem onde aparece. */
export function grifarConversa(textos: readonly string[], trechos: readonly string[]): Pedaco[][] {
    const usados = new Set<number>();
    return textos.map((texto) => {
        const disponiveis = trechos.map((t, i) => (usados.has(i + 1) ? '' : t));
        const pedacos = grifar(texto, disponiveis);
        for (const p of pedacos) if (p.grifo !== null) usados.add(p.grifo);
        return pedacos;
    });
}

const um = (n: number) => Math.round(n * 10) / 10;

/** `d` de um <path>: `null` é buraco na série, e a linha recomeça depois dele. */
export function caminhoSvg(pontos: readonly ([number, number] | null)[]): string {
    const partes: string[] = [];
    let aberto = false;
    for (const p of pontos) {
        if (!p) { aberto = false; continue; }
        partes.push(`${aberto ? 'L' : 'M'}${um(p[0])} ${um(p[1])}`);
        aberto = true;
    }
    return partes.join(' ');
}

/** Empurra para baixo rótulos que ficariam a menos de `distancia` um do outro. */
export function afastarRotulos(ys: readonly number[], distancia: number): number[] {
    const ordem = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ordem.length; k++) {
        if (ordem[k].y - ordem[k - 1].y < distancia) ordem[k].y = ordem[k - 1].y + distancia;
    }
    const saida = new Array<number>(ys.length);
    for (const o of ordem) saida[o.i] = o.y;
    return saida;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unidade/visual.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Suíte inteira + typecheck**

Run: `npm run test:unidade && npm run typecheck`
Expected: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add lib/visual.ts tests/unidade/visual.test.ts
git commit -m "feat: regras de apresentação puras em lib/visual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/derivacoes.ts` — números novos a partir das tabelas atuais (TDD)

**Files:**
- Create: `lib/derivacoes.ts`
- Test: `tests/unidade/derivacoes.test.ts`

**Interfaces:**
- Consumes: `media` de `lib/visual.ts`.
- Produces:
  - `NOMES_ETAPA: Record<Etapa, string>`, `type Etapa`, `ETAPAS: Etapa[]` (ordem do MEC)
  - `type Valor = number | string | null | undefined`
  - `diaMenos(dia: string, n: number): string`
  - `type NotaDia = { data_ref: string; score_geral: Valor }`
  - `variacaoSemanal(dias: readonly NotaDia[]): number | null`: nota do último dia com nota menos a média dos 7 dias anteriores, arredondada
  - `type EtapaFraca = { etapa: Etapa; nome: string; pct: number }`
  - `etapaMaisFraca(porEtapa: Record<string, Valor> | null | undefined): EtapaFraca | null`
  - `type Identificado = { id: string; nome: string }`
  - `type Sugestao = { pessoa: Identificado; queda: number; etapaFraca: EtapaFraca | null }`
  - `comQuemFalar(pessoas, notas: ReadonlyMap<string, readonly NotaDia[]>, etapas: ReadonlyMap<string, Record<string, Valor> | null>, quantos = 2): Sugestao[]`
  - `type ContagemObjecao = { objecao: string; total: number }`
  - `contarObjecoes(payloads: readonly unknown[], quantas = 4): ContagemObjecao[]`
  - `variacaoDoPeriodo<T extends { data_ref: string }>(linhas, valor: (l: T) => Valor, fim: string, janela: number): number | null`
  - `serieSemanal<T extends { data_ref: string }>(linhas, valor, fim: string, semanas = 12): (number | null)[]`
  - `type Destaque = { id: string; nome: string; variacao: number }`
  - `destaquesDaRede<T extends { data_ref: string; unidade_id: string }>(unidades: readonly Identificado[], linhas: readonly T[], valor, melhorQuando: 'maior' | 'menor', fim: string, janela: number, comGestor: ReadonlySet<string>): { variacoes: Map<string, number | null>; subiu: Destaque | null; caiu: Destaque | null; semGestor: Identificado[] }`

- [ ] **Step 1: Escrever os testes**

`tests/unidade/derivacoes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    comQuemFalar, contarObjecoes, destaquesDaRede, diaMenos, etapaMaisFraca,
    serieSemanal, variacaoDoPeriodo, variacaoSemanal, type NotaDia,
} from '../../lib/derivacoes.ts';

const nd = (data_ref: string, score_geral: number | string | null): NotaDia => ({ data_ref, score_geral });

test('diaMenos atravessa mês e ano', () => {
    assert.equal(diaMenos('2026-03-01', 1), '2026-02-28');
    assert.equal(diaMenos('2026-01-03', 7), '2025-12-27');
});

// --- variação semanal ---------------------------------------------------------

test('variação: último dia contra a média dos 7 anteriores', () => {
    const dias = [nd('2026-09-23', 72), nd('2026-09-22', 66), nd('2026-09-21', 70), nd('2026-09-10', 20)];
    // 72 − média(66, 70) = 4; o dia 10 está fora da janela.
    assert.equal(variacaoSemanal(dias), 4);
});

test('variação: dia sem nota não conta, e texto do PostgREST vira número', () => {
    assert.equal(variacaoSemanal([nd('2026-09-23', '60'), nd('2026-09-22', null), nd('2026-09-21', 70)]), -10);
});

test('variação: sem histórico não há tendência', () => {
    assert.equal(variacaoSemanal([nd('2026-09-23', 72)]), null);
    assert.equal(variacaoSemanal([nd('2026-09-23', 72), nd('2026-09-01', 50)]), null);
});

// --- etapa mais fraca e com quem falar -------------------------------------------

test('etapa mais fraca ignora etapa sem dado', () => {
    assert.deepEqual(etapaMaisFraca({ acolhida: 100, sondagem: '20', fechamento: null }), {
        etapa: 'sondagem', nome: 'Sondagem', pct: 20,
    });
    assert.equal(etapaMaisFraca({}), null);
    assert.equal(etapaMaisFraca(null), null);
});

test('com quem falar: só quem caiu, da maior queda para a menor, no máximo 2', () => {
    const pessoas = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Beto' }, { id: 'c', nome: 'Caio' }, { id: 'd', nome: 'Dani' }];
    const notas = new Map([
        ['a', [nd('2026-09-23', 60), nd('2026-09-22', 67)]],
        ['b', [nd('2026-09-23', 80), nd('2026-09-22', 70)]],
        ['c', [nd('2026-09-23', 50), nd('2026-09-22', 54)]],
        ['d', [nd('2026-09-23', 40), nd('2026-09-22', 49)]],
    ]);
    const etapas = new Map([['a', { sondagem: 20 }]]);
    const r = comQuemFalar(pessoas, notas, etapas);
    assert.deepEqual(r.map((s) => [s.pessoa.id, s.queda]), [['d', -9], ['a', -7]]);
    assert.equal(r[1].etapaFraca?.etapa, 'sondagem');
    assert.equal(r[0].etapaFraca, null);
});

// --- objeções -------------------------------------------------------------------

test('objeções: conta por conversa, junta maiúsculas e ordena', () => {
    const r = contarObjecoes([
        { objecoes: ['Preço', 'preço', 'Prazo de entrega'] },
        { objecoes: ['preço'] },
        { objecoes: 'não é lista' },
        null,
        { objecoes: ['frete', 42] },
    ]);
    assert.deepEqual(r, [
        { objecao: 'Preço', total: 2 },
        { objecao: 'Frete', total: 1 },
        { objecao: 'Prazo de entrega', total: 1 },
    ]);
});

// --- períodos e séries -------------------------------------------------------------

type L = { data_ref: string; unidade_id: string; v: number | null };
const l = (data_ref: string, unidade_id: string, v: number | null): L => ({ data_ref, unidade_id, v });

test('variação do período: janela atual contra a anterior', () => {
    const linhas = [l('2026-09-23', 'x', 70), l('2026-09-20', 'x', 74), l('2026-09-10', 'x', 60), l('2026-08-01', 'x', 10)];
    // últimos 10 dias: média 72; 10 anteriores: 60.
    assert.equal(variacaoDoPeriodo(linhas, (x) => x.v, '2026-09-23', 10), 12);
});

test('variação do período sem um dos lados é null', () => {
    assert.equal(variacaoDoPeriodo([l('2026-09-23', 'x', 70)], (x) => x.v, '2026-09-23', 10), null);
});

test('série semanal: da mais antiga à mais recente, semana vazia é null', () => {
    const linhas = [l('2026-09-23', 'x', 70), l('2026-09-17', 'x', 60), l('2026-09-16', 'x', 64)];
    // Semanas (fim − 7k, fim]: 16/09 cai na do meio; 17/09 e 23/09 na última.
    assert.deepEqual(serieSemanal(linhas, (x) => x.v, '2026-09-23', 3), [null, 64, 65]);
});

// --- destaques da rede ----------------------------------------------------------

test('destaques: quem mais subiu, quem mais caiu e loja sem gestor', () => {
    const unidades = [{ id: 'n', nome: 'Noiva do Mar' }, { id: 't', nome: 'Tramandaí' }, { id: 'a', nome: 'Atlântida' }];
    const linhas = [
        l('2026-09-23', 'n', 81), l('2026-09-05', 'n', 72),
        l('2026-09-23', 't', 63), l('2026-09-05', 't', 71),
        l('2026-09-23', 'a', 61), l('2026-09-05', 'a', 61),
    ];
    const r = destaquesDaRede(unidades, linhas, (x) => x.v, 'maior', '2026-09-23', 14, new Set(['n', 't']));
    assert.deepEqual(r.subiu, { id: 'n', nome: 'Noiva do Mar', variacao: 9 });
    assert.deepEqual(r.caiu, { id: 't', nome: 'Tramandaí', variacao: -8 });
    assert.equal(r.variacoes.get('a'), 0);
    assert.deepEqual(r.semGestor, [{ id: 'a', nome: 'Atlântida' }]);
});

// Para tempo de resposta, subir é piorar.
test('destaques: com "menor é melhor", quem mais caiu é quem mais melhorou', () => {
    const unidades = [{ id: 'n', nome: 'N' }, { id: 't', nome: 'T' }];
    const linhas = [l('2026-09-23', 'n', 4), l('2026-09-05', 'n', 10), l('2026-09-23', 't', 20), l('2026-09-05', 't', 9)];
    const r = destaquesDaRede(unidades, linhas, (x) => x.v, 'menor', '2026-09-23', 14, new Set(['n', 't']));
    assert.equal(r.subiu?.id, 'n');
    assert.equal(r.caiu?.id, 't');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unidade/derivacoes.test.ts`
Expected: FAIL, `Cannot find module '.../lib/derivacoes.ts'`.

- [ ] **Step 3: Implementar `lib/derivacoes.ts`**

```ts
import { media } from './visual.ts';

/**
 * Números que as telas novas mostram e que o banco não guarda pronto. Tudo
 * sai de tabelas que já existem (spec §6): nenhum backend novo. Toda função
 * devolve null quando falta dado — ausência nunca vira zero.
 */

export const NOMES_ETAPA = {
    acolhida: 'Acolhida',
    sondagem: 'Sondagem',
    solucao_completa: 'Solução completa',
    contorno_objecoes: 'Contorno de objeções',
    estrategia_preco: 'Estratégia de preço',
    fechamento: 'Fechamento',
    acompanhamento: 'Acompanhamento',
} as const;
export type Etapa = keyof typeof NOMES_ETAPA;
export const ETAPAS = Object.keys(NOMES_ETAPA) as Etapa[];

export type Valor = number | string | null | undefined;

const num = (v: Valor): number | null => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** AAAA-MM-DD menos n dias. Aritmética de calendário, sem fuso. */
export function diaMenos(dia: string, n: number): string {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}

export type NotaDia = { data_ref: string; score_geral: Valor };

/** Nota do último dia com nota menos a média dos 7 dias anteriores a ele. */
export function variacaoSemanal(dias: readonly NotaDia[]): number | null {
    const comNota = dias
        .filter((d) => num(d.score_geral) !== null)
        .sort((a, b) => b.data_ref.localeCompare(a.data_ref));
    if (comNota.length < 2) return null;
    const [ultimo, ...resto] = comNota;
    const limite = diaMenos(ultimo.data_ref, 7);
    const anterior = media(resto.filter((d) => d.data_ref >= limite).map((d) => num(d.score_geral)));
    return anterior === null ? null : Math.round(num(ultimo.score_geral)! - anterior);
}

export type EtapaFraca = { etapa: Etapa; nome: string; pct: number };

/** A etapa do MEC com menor aderência. Etapa sem dado (não cabia) não conta. */
export function etapaMaisFraca(porEtapa: Record<string, Valor> | null | undefined): EtapaFraca | null {
    let pior: EtapaFraca | null = null;
    for (const etapa of ETAPAS) {
        const v = num(porEtapa?.[etapa]);
        if (v === null) continue;
        const pct = Math.round(v);
        if (!pior || pct < pior.pct) pior = { etapa, nome: NOMES_ETAPA[etapa], pct };
    }
    return pior;
}

export type Identificado = { id: string; nome: string };
export type Sugestao = { pessoa: Identificado; queda: number; etapaFraca: EtapaFraca | null };

/** Quem mais caiu na semana, e onde. É a resposta de "com quem eu falo hoje". */
export function comQuemFalar(
    pessoas: readonly Identificado[],
    notas: ReadonlyMap<string, readonly NotaDia[]>,
    etapas: ReadonlyMap<string, Record<string, Valor> | null>,
    quantos = 2,
): Sugestao[] {
    return pessoas
        .map((pessoa) => ({ pessoa, queda: variacaoSemanal(notas.get(pessoa.id) ?? []) }))
        .filter((x): x is { pessoa: Identificado; queda: number } => x.queda !== null && x.queda < 0)
        .sort((a, b) => a.queda - b.queda || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'))
        .slice(0, quantos)
        .map(({ pessoa, queda }) => ({ pessoa, queda, etapaFraca: etapaMaisFraca(etapas.get(pessoa.id)) }));
}

export type ContagemObjecao = { objecao: string; total: number };

/** Objeções mais frequentes em `analises_conversa.payload.objecoes`, uma vez por conversa. */
export function contarObjecoes(payloads: readonly unknown[], quantas = 4): ContagemObjecao[] {
    const contagem = new Map<string, ContagemObjecao>();
    for (const p of payloads) {
        const bruto = p && typeof p === 'object' ? (p as { objecoes?: unknown }).objecoes : undefined;
        if (!Array.isArray(bruto)) continue;
        const vistas = new Set<string>();
        for (const item of bruto) {
            if (typeof item !== 'string') continue;
            const texto = item.trim();
            if (!texto) continue;
            const chave = texto.toLocaleLowerCase('pt-BR');
            if (vistas.has(chave)) continue;
            vistas.add(chave);
            const atual = contagem.get(chave);
            if (atual) atual.total += 1;
            else contagem.set(chave, { objecao: texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1), total: 1 });
        }
    }
    return [...contagem.values()]
        .sort((a, b) => b.total - a.total || a.objecao.localeCompare(b.objecao, 'pt-BR'))
        .slice(0, quantas);
}

type ComData = { data_ref: string };

/** Média de (fim − janela, fim] menos a média de (fim − 2·janela, fim − janela]. */
export function variacaoDoPeriodo<T extends ComData>(
    linhas: readonly T[], valor: (l: T) => Valor, fim: string, janela: number,
): number | null {
    const corte = diaMenos(fim, janela);
    const inicio = diaMenos(fim, 2 * janela);
    const agora = media(linhas.filter((l) => l.data_ref > corte && l.data_ref <= fim).map((l) => num(valor(l))));
    const antes = media(linhas.filter((l) => l.data_ref > inicio && l.data_ref <= corte).map((l) => num(valor(l))));
    return agora === null || antes === null ? null : agora - antes;
}

/** Médias semanais terminando em `fim`, da mais antiga à mais recente. */
export function serieSemanal<T extends ComData>(
    linhas: readonly T[], valor: (l: T) => Valor, fim: string, semanas = 12,
): (number | null)[] {
    return Array.from({ length: semanas }, (_, w) => {
        const ate = diaMenos(fim, 7 * (semanas - 1 - w));
        const de = diaMenos(fim, 7 * (semanas - w));
        return media(linhas.filter((l) => l.data_ref > de && l.data_ref <= ate).map((l) => num(valor(l))));
    });
}

export type Destaque = { id: string; nome: string; variacao: number };

/** A loja que mais melhorou, a que mais piorou e as sem gestor ativo. */
export function destaquesDaRede<T extends ComData & { unidade_id: string }>(
    unidades: readonly Identificado[],
    linhas: readonly T[],
    valor: (l: T) => Valor,
    melhorQuando: 'maior' | 'menor',
    fim: string,
    janela: number,
    comGestor: ReadonlySet<string>,
): { variacoes: Map<string, number | null>; subiu: Destaque | null; caiu: Destaque | null; semGestor: Identificado[] } {
    const ganho = (v: number) => (melhorQuando === 'maior' ? v : -v);
    const variacoes = new Map<string, number | null>();
    let subiu: Destaque | null = null;
    let caiu: Destaque | null = null;
    for (const u of unidades) {
        const v = variacaoDoPeriodo(linhas.filter((l) => l.unidade_id === u.id), valor, fim, janela);
        variacoes.set(u.id, v);
        if (v === null || v === 0) continue;
        if (ganho(v) > 0 && (!subiu || ganho(v) > ganho(subiu.variacao))) subiu = { id: u.id, nome: u.nome, variacao: v };
        if (ganho(v) < 0 && (!caiu || ganho(v) < ganho(caiu.variacao))) caiu = { id: u.id, nome: u.nome, variacao: v };
    }
    return { variacoes, subiu, caiu, semGestor: unidades.filter((u) => !comGestor.has(u.id)) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unidade/derivacoes.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Suíte + typecheck**

Run: `npm run test:unidade && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/derivacoes.ts tests/unidade/derivacoes.test.ts
git commit -m "feat: derivações das telas novas a partir das tabelas atuais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Componentes básicos + vitrine `/dev/ui`

Componentes visuais não têm infraestrutura de teste de React no projeto. A verificação é typecheck, lint e a vitrine no browser.

**Files:**
- Create: `components/ui/tom.ts`, `icone.tsx`, `cartao.tsx`, `numero.tsx`, `selo.tsx`, `barra.tsx`, `avatar.tsx`, `rotulo-secao.tsx`, `cabecalho-pagina.tsx`, `botao.tsx`, `estado-vazio.tsx`, `pagina.tsx`, `index.ts`
- Create: `app/dev/ui/page.tsx`

**Interfaces:**
- Consumes: `Tom`, `iniciais` de `@/lib/visual`.
- Produces (todos exportados por `@/components/ui`):
  - `SELO`, `TEXTO`, `PREENCHIMENTO: Record<Tom, string>` (classes)
  - `Icone({ nome: NomeIcone; tamanho?: number; className?: string })`, `type NomeIcone`
  - `Cartao({ variante?: 'padrao'|'heroi'|'suave'|'tracejado'|'risco'|'atencao'; recuo?: 'normal'|'nenhum'; as?: 'section'|'div'|'aside'|'article'; className?; children })`
  - `Numero({ valor: ReactNode; unidade?: string; tamanho?: 'md'|'lg'|'xl'; className? })`
  - `Selo({ tom?: Tom; ponto?: boolean; className?; children })`
  - `Barra({ pct: number | null; tom?: Tom; rotulo: string })`
  - `Avatar({ nome: string | null | undefined; tamanho?: 32 | 38 | 48 })`
  - `Losango({ className? })`, `RotuloSecao({ children; complemento?; acao? })`
  - `CabecalhoPagina({ sobre?; titulo; acoes?; voltar?: { href: Route; rotulo: string } })`
  - `Botao(props de <button> & { variante?: 'primario'|'secundario'|'texto' })`, `BotaoLink({ href: string; externo?: boolean; variante?; className?; children })`
  - `EstadoVazio({ titulo: string; children: ReactNode; acao?: ReactNode })`
  - `Pagina({ children; className? })`

- [ ] **Step 1: `components/ui/tom.ts`**

```ts
import type { Tom } from '@/lib/visual';

// Classes escritas por extenso: o Tailwind só gera o que encontra literal no código.
export const SELO: Record<Tom, string> = {
    bom: 'bg-bom-sof text-bom-texto',
    atencao: 'bg-atencao-sof text-atencao-texto',
    risco: 'bg-risco-sof text-risco-texto',
    neutro: 'bg-superficie-2 text-tinta-2',
    azul: 'bg-azul-sof text-azul',
};

export const TEXTO: Record<Tom, string> = {
    bom: 'text-bom-texto',
    atencao: 'text-atencao-texto',
    risco: 'text-risco-texto',
    neutro: 'text-tinta-2',
    azul: 'text-azul',
};

export const PREENCHIMENTO: Record<Tom, string> = {
    bom: 'bg-bom',
    atencao: 'bg-atencao',
    risco: 'bg-risco',
    neutro: 'bg-tinta-3',
    azul: 'bg-azul',
};
```

- [ ] **Step 2: `components/ui/icone.tsx`**

```tsx
import type { ReactNode } from 'react';

const TRACOS = {
    casa: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    conversa: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    tendencia: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
    mec: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" /></>,
    pessoa: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
    equipe: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" /><circle cx="17" cy="9" r="2.8" /><path d="M16.5 14.2c2.4.2 4.2 1.8 5 4.3" /></>,
    rede: <><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M9 21v-6h6v6" /></>,
    relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    seta_direita: <path d="M9 6l6 6-6 6" />,
    seta_esquerda: <path d="M15 6l-6 6 6 6" />,
    externo: <path d="M7 17L17 7M9 7h8v8" />,
    sair: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />,
    check: <path d="M20 6L9 17l-5-5" />,
    engrenagem: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
    lampada: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
    wifi: <path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0M12 19.5h.01" />,
    wifi_off: <><path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0M12 19.5h.01" /><path d="M3 3l18 18" /></>,
    copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
    alerta: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></>,
    operacao: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    lista: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    microfone: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    cadastro: <><circle cx="10" cy="8" r="3.6" /><path d="M3 20c1.3-3.4 3.9-5.2 7-5.2 1.3 0 2.5.3 3.5.9" /><path d="M18 14v6M15 17h6" /></>,
} satisfies Record<string, ReactNode>;

export type NomeIcone = keyof typeof TRACOS;

/** Conjunto fechado de ícones de traço. Ícone novo entra aqui, nunca solto numa página. */
export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
    return (
        <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
            {TRACOS[nome]}
        </svg>
    );
}
```

- [ ] **Step 3: `cartao.tsx`, `numero.tsx`, `selo.tsx`, `barra.tsx`, `avatar.tsx`**

`components/ui/cartao.tsx`:
```tsx
import type { HTMLAttributes, ReactNode } from 'react';

const VARIANTE = {
    padrao: 'border border-linha bg-superficie',
    heroi: 'bg-azul text-white',
    suave: 'bg-azul-sof',
    tracejado: 'border border-dashed border-linha-campo bg-superficie',
    risco: 'bg-risco-sof',
    atencao: 'bg-atencao-sof',
} as const;

export function Cartao({
    variante = 'padrao', recuo = 'normal', as: Tag = 'section', className = '', children, ...resto
}: {
    variante?: keyof typeof VARIANTE;
    recuo?: 'normal' | 'nenhum';
    as?: 'section' | 'div' | 'aside' | 'article';
    className?: string;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
    return (
        <Tag className={`rounded-card ${VARIANTE[variante]} ${recuo === 'normal' ? 'p-5 lg:p-6' : ''} ${className}`} {...resto}>
            {children}
        </Tag>
    );
}
```

`components/ui/numero.tsx`:
```tsx
import type { ReactNode } from 'react';

const TAMANHO = { md: 'text-[26px]', lg: 'text-[34px]', xl: 'text-[48px] lg:text-[56px]' } as const;

/** Número de KPI: Montserrat, algarismos tabulares, unidade menor e mais apagada. */
export function Numero({ valor, unidade, tamanho = 'lg', className = '' }: {
    valor: ReactNode; unidade?: string; tamanho?: keyof typeof TAMANHO; className?: string;
}) {
    return (
        <span className={`display num font-bold leading-none ${TAMANHO[tamanho]} ${className}`}>
            {valor}
            {unidade && <span className="text-[0.45em] font-semibold opacity-60">{unidade}</span>}
        </span>
    );
}
```

`components/ui/selo.tsx`:
```tsx
import type { ReactNode } from 'react';
import type { Tom } from '@/lib/visual';
import { PREENCHIMENTO, SELO } from './tom';

export function Selo({ tom = 'neutro', ponto = false, className = '', children }: {
    tom?: Tom; ponto?: boolean; className?: string; children: ReactNode;
}) {
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${SELO[tom]} ${className}`}>
            {ponto && <span className={`size-[7px] rounded-full ${PREENCHIMENTO[tom]}`} aria-hidden="true" />}
            {children}
        </span>
    );
}
```

`components/ui/barra.tsx`:
```tsx
import type { Tom } from '@/lib/visual';
import { PREENCHIMENTO } from './tom';

/** Barra de progresso. `null` é "sem dado": fica tracejada, nunca vazia como se fosse zero. */
export function Barra({ pct, tom = 'azul', rotulo }: { pct: number | null; tom?: Tom; rotulo: string }) {
    if (pct === null) {
        return <span role="img" aria-label={`${rotulo}: sem dado`} className="block h-1.5 rounded-full border border-dashed border-linha-campo" />;
    }
    const largura = Math.max(0, Math.min(100, pct));
    return (
        <span role="img" aria-label={`${rotulo}: ${Math.round(largura)}%`} className="block h-1.5 overflow-hidden rounded-full bg-linha-2">
            <span className={`block h-full rounded-full ${PREENCHIMENTO[tom]}`} style={{ width: `${largura}%` }} />
        </span>
    );
}
```

`components/ui/avatar.tsx`:
```tsx
import { iniciais } from '@/lib/visual';
import { Icone } from './icone';

export function Avatar({ nome, tamanho = 38 }: { nome: string | null | undefined; tamanho?: 32 | 38 | 48 }) {
    const letras = iniciais(nome);
    return (
        <span aria-hidden="true" style={{ width: tamanho, height: tamanho }}
              className={`display flex shrink-0 items-center justify-center rounded-full bg-superficie-2 font-bold text-azul ${tamanho === 48 ? 'text-base' : 'text-[12.5px]'}`}>
            {letras ?? <Icone nome="pessoa" tamanho={tamanho === 48 ? 20 : 16} />}
        </span>
    );
}
```

- [ ] **Step 4: `rotulo-secao.tsx`, `cabecalho-pagina.tsx`, `botao.tsx`, `estado-vazio.tsx`, `pagina.tsx`**

`components/ui/rotulo-secao.tsx`:
```tsx
import type { ReactNode } from 'react';

/** O losango da marca, em dose pequena. */
export function Losango({ className = '' }: { className?: string }) {
    return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rotate-45 rounded-[1.5px] bg-azul ${className}`} />;
}

export function RotuloSecao({ children, complemento, acao }: { children: ReactNode; complemento?: ReactNode; acao?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Losango />
                <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-azul">{children}</h2>
                {complemento && <span className="text-[12.5px] text-tinta-3">{complemento}</span>}
            </div>
            {acao}
        </div>
    );
}
```

`components/ui/cabecalho-pagina.tsx`:
```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Icone } from './icone';

export function CabecalhoPagina({ sobre, titulo, acoes, voltar }: {
    sobre?: ReactNode; titulo: ReactNode; acoes?: ReactNode; voltar?: { href: Route; rotulo: string };
}) {
    return (
        <header className="flex flex-col gap-3">
            {voltar && (
                <Link href={voltar.href} className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-azul">
                    <Icone nome="seta_esquerda" tamanho={14} />{voltar.rotulo}
                </Link>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    {sobre && <p className="text-[13.5px] text-tinta-3">{sobre}</p>}
                    <h1 className="display mt-1.5 text-[26px] font-bold lg:text-[32px]">{titulo}</h1>
                </div>
                {acoes && <div className="flex flex-wrap items-center gap-2.5">{acoes}</div>}
            </div>
        </header>
    );
}
```

`components/ui/botao.tsx`:
```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icone } from './icone';

const VARIANTE = {
    primario: 'bg-azul px-4 text-white hover:bg-azul-2',
    secundario: 'border border-linha bg-superficie px-4 text-azul hover:bg-superficie-2',
    texto: 'text-azul hover:text-azul-2',
} as const;
const BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl text-[13.5px] font-semibold transition disabled:opacity-50';

export function Botao({ variante = 'primario', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTE }) {
    return <button className={`${BASE} ${VARIANTE[variante]} ${className}`} {...props} />;
}

/** `externo` abre em outra aba (WhatsApp) e ganha o ícone de saída. */
export function BotaoLink({ href, externo = false, variante = 'primario', className = '', children }: {
    href: string; externo?: boolean; variante?: keyof typeof VARIANTE; className?: string; children: ReactNode;
}) {
    const classe = `${BASE} ${VARIANTE[variante]} ${className}`;
    if (externo) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className={classe}>{children}<Icone nome="externo" tamanho={14} /></a>;
    }
    return <Link href={href as Route} className={classe}>{children}</Link>;
}
```

`components/ui/estado-vazio.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Cartao } from './cartao';

/** Ausência de dado é tela de verdade, nunca nota zero (design/README). */
export function EstadoVazio({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
    return (
        <Cartao variante="tracejado" className="flex flex-col items-start gap-2.5">
            <span aria-hidden="true" className="ml-1 mt-1 inline-block size-[22px] rotate-45 rounded-[5px] border-2 border-azul" />
            <h3 className="display text-base font-bold">{titulo}</h3>
            <div className="text-[13px] leading-relaxed text-tinta-2">{children}</div>
            {acao}
        </Cartao>
    );
}
```

`components/ui/pagina.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Pagina({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:gap-7 lg:px-12 lg:pb-14 lg:pt-9 ${className}`}>
            {children}
        </div>
    );
}
```

- [ ] **Step 5: `components/ui/index.ts`**

```ts
export { SELO, TEXTO, PREENCHIMENTO } from './tom';
export { Icone, type NomeIcone } from './icone';
export { Cartao } from './cartao';
export { Numero } from './numero';
export { Selo } from './selo';
export { Barra } from './barra';
export { Avatar } from './avatar';
export { Losango, RotuloSecao } from './rotulo-secao';
export { CabecalhoPagina } from './cabecalho-pagina';
export { Botao, BotaoLink } from './botao';
export { EstadoVazio } from './estado-vazio';
export { Pagina } from './pagina';
```

- [ ] **Step 6: Vitrine `app/dev/ui/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import {
    Avatar, Barra, Botao, BotaoLink, CabecalhoPagina, Cartao, EstadoVazio, Icone, Numero, Pagina, RotuloSecao, Selo,
} from '@/components/ui';

// Vitrine dos componentes para conferir no browser. Não existe em produção.
export default function VitrineUi() {
    if (process.env.NODE_ENV === 'production') notFound();
    return (
        <Pagina>
            <CabecalhoPagina sobre="Só em desenvolvimento" titulo="Componentes" acoes={<Botao>Primário</Botao>} />
            <RotuloSecao complemento="complemento">Rótulo de seção</RotuloSecao>
            <div className="grid gap-5 lg:grid-cols-3">
                <Cartao className="flex flex-col gap-3">
                    <Numero valor={72} unidade="/100" tamanho="xl" />
                    <Numero valor={125} unidade=" min" />
                    <div className="flex flex-wrap gap-2">
                        <Selo tom="bom" ponto>Conectado</Selo><Selo tom="risco" ponto>Fora do ar</Selo>
                        <Selo tom="atencao">42min</Selo><Selo>12min</Selo><Selo tom="azul">Negociação</Selo>
                    </div>
                </Cartao>
                <Cartao variante="heroi" className="flex flex-col gap-3"><span>Cartão herói</span><Numero valor={71} tamanho="xl" /></Cartao>
                <Cartao variante="suave">Cartão suave (treino)</Cartao>
                <Cartao className="flex flex-col gap-3">
                    <Barra pct={100} rotulo="Acolhida" /><Barra pct={29} tom="risco" rotulo="Sondagem" />
                    <Barra pct={40} tom="atencao" rotulo="Solução" /><Barra pct={null} rotulo="Acompanhamento" />
                </Cartao>
                <Cartao className="flex items-center gap-3"><Avatar nome="Marcos Teixeira" /><Avatar nome={null} /><Avatar nome="Nexo" tamanho={48} /></Cartao>
                <Cartao className="flex flex-col items-start gap-3">
                    <Botao variante="secundario">Secundário</Botao>
                    <BotaoLink href="https://wa.me/5551999999999" externo variante="secundario">Responder</BotaoLink>
                    <Botao variante="texto">Texto <Icone nome="seta_direita" tamanho={14} /></Botao>
                </Cartao>
            </div>
            <EstadoVazio titulo="Ontem não teve nota">Só houve suporte e conversa social. Isso não conta contra você.</EstadoVazio>
        </Pagina>
    );
}
```

- [ ] **Step 7: Checar**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 8: Conferir no browser**

Com o dev server rodando e a sessão aberta pelo usuário (ver "Como verificar visualmente"), abra `http://localhost:3000/dev/ui` a 390 e a 1440. Confira: cores dos selos, barra tracejada no "sem dado", avatar com ícone quando não há nome, nenhum erro no console.

- [ ] **Step 9: Commit**

```bash
git add components/ui app/dev
git commit -m "feat: componentes básicos da identidade nova e vitrine /dev/ui

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Componentes de dado — Kpi, Comparação, Espera, Série, Tabela, Segmentado, Alerta, gráficos, Copiar

**Files:**
- Create: `components/ui/comparacao.tsx`, `kpi.tsx`, `tempo-espera.tsx`, `serie-dias.tsx`, `tabela.tsx`, `segmentado.tsx`, `alerta.tsx`, `sparkline.tsx`, `grafico-linhas.tsx`, `botao-copiar.tsx`
- Modify: `components/ui/index.ts`, `app/dev/ui/page.tsx`

**Interfaces:**
- Consumes: `tomDelta`, `setaDoTom`, `tomEspera`, `caminhoSvg`, `afastarRotulos`, `Sentido` de `@/lib/visual`; `esperaEmTexto` de `@/lib/painel`; componentes da Task 4.
- Produces:
  - `Comparacao({ delta: number | null; melhorQuando?: Sentido; children; className? })`
  - `Kpi({ rotulo: string; valor: ReactNode; unidade?: string; comparacao?: ReactNode; legenda?: ReactNode; heroi?: boolean })`
  - `TempoEspera({ ms: number; prefixo?: string })`
  - `type DiaSerie = { dia: string; nota: number | null; temRelatorio: boolean }`, `SerieDias({ dias: DiaSerie[]; invertida?: boolean })`
  - `type LinhaTabela = { chave: string; href?: string; celulas: ReactNode[]; resumo?: ReactNode; atenuada?: boolean }`, `Tabela({ titulo?; acao?; colunas: string[]; grade: string; linhas: LinhaTabela[]; vazio: ReactNode; larguraMin?: number })`
  - `Segmentado({ rotulo: string; opcoes: { valor: string; rotulo: string }[]; atual: string; base: string; param: string })`
  - `Alerta({ tom: 'risco'|'atencao'|'azul'; icone: NomeIcone; titulo: string; children?: ReactNode; acao?: { href: string; rotulo: string } })`
  - `Sparkline({ valores: (number | null)[]; rotulo: string; invertida?: boolean })`
  - `type SerieGrafico = { id: string; nome: string; valores: (number | null)[]; destaque?: 'azul' | 'risco' }`, `GraficoLinhas({ series: SerieGrafico[]; formato: (n: number) => string; rotulosX: [string, string]; rotulo: string })`
  - `BotaoCopiar({ texto: string })` (client)

- [ ] **Step 1: `comparacao.tsx`, `kpi.tsx`, `tempo-espera.tsx`**

`components/ui/comparacao.tsx`:
```tsx
import type { ReactNode } from 'react';
import { setaDoTom, tomDelta, type Sentido } from '@/lib/visual';
import { TEXTO } from './tom';

/** "▲ 4 acima da sua média": cor e seta saem do sinal e do que é melhorar. */
export function Comparacao({ delta, melhorQuando = 'maior', className = '', children }: {
    delta: number | null; melhorQuando?: Sentido; className?: string; children: ReactNode;
}) {
    const tom = tomDelta(delta, melhorQuando);
    return (
        <span className={`text-[12.5px] font-semibold ${TEXTO[tom]} ${className}`}>
            {delta !== null && <span aria-hidden="true">{setaDoTom(tom)} </span>}{children}
        </span>
    );
}
```

`components/ui/kpi.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Cartao } from './cartao';
import { Numero } from './numero';

/** Número nunca vem solto: ou traz comparação, ou uma legenda que o situe. */
export function Kpi({ rotulo, valor, unidade, comparacao, legenda, heroi = false }: {
    rotulo: string; valor: ReactNode; unidade?: string; comparacao?: ReactNode; legenda?: ReactNode; heroi?: boolean;
}) {
    return (
        <Cartao variante={heroi ? 'heroi' : 'padrao'} as="div" className="flex flex-col gap-2">
            <span className={`text-[13px] ${heroi ? 'text-white/75' : 'text-tinta-2'}`}>{rotulo}</span>
            <Numero valor={valor} unidade={unidade} />
            {comparacao}
            {legenda && <span className={`text-[12.5px] ${heroi ? 'text-white/75' : 'text-tinta-3'}`}>{legenda}</span>}
        </Cartao>
    );
}
```

`components/ui/tempo-espera.tsx`:
```tsx
import { esperaEmTexto } from '@/lib/painel';
import { tomEspera } from '@/lib/visual';
import { SELO } from './tom';

export function TempoEspera({ ms, prefixo }: { ms: number; prefixo?: string }) {
    return (
        <span className={`whitespace-nowrap rounded-ctl px-2.5 py-1 text-[12.5px] font-bold ${SELO[tomEspera(ms)]}`}>
            {prefixo && `${prefixo} `}{esperaEmTexto(ms)}
        </span>
    );
}
```

- [ ] **Step 2: `serie-dias.tsx`**

```tsx
export type DiaSerie = { dia: string; nota: number | null; temRelatorio: boolean };

/**
 * Nota diária em barras. Dia sem relatório é um traço no chão; dia com
 * relatório e sem nota (só suporte ou social) é tracejado. Nota zero e "não
 * houve nota" não são a mesma coisa.
 */
export function SerieDias({ dias, invertida = false }: { dias: DiaSerie[]; invertida?: boolean }) {
    const cor = invertida
        ? { cheia: 'bg-white/35', ultima: 'bg-white', vazia: 'bg-white/20', tracejo: 'border-white/45' }
        : { cheia: 'bg-azul/30', ultima: 'bg-azul', vazia: 'bg-linha', tracejo: 'border-tinta-3' };
    return (
        <div className="flex h-12 items-end gap-1.5" role="img" aria-label={`Nota dos últimos ${dias.length} dias`}>
            {dias.map((d, i) => {
                const rotulo = `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${!d.temRelatorio ? 'sem relatório' : d.nota === null ? 'sem nota' : `nota ${d.nota}`}`;
                if (!d.temRelatorio) return <span key={d.dia} title={rotulo} className={`h-0.5 min-w-1.5 flex-1 rounded ${cor.vazia}`} />;
                if (d.nota === null) return <span key={d.dia} title={rotulo} className={`h-1/4 min-w-1.5 flex-1 rounded-sm border border-dashed ${cor.tracejo}`} />;
                return <span key={d.dia} title={rotulo} className={`min-w-1.5 flex-1 rounded-sm ${i === dias.length - 1 ? cor.ultima : cor.cheia}`} style={{ height: `${Math.max(8, d.nota)}%` }} />;
            })}
        </div>
    );
}
```

- [ ] **Step 3: `tabela.tsx`**

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Cartao } from './cartao';

export type LinhaTabela = { chave: string; href?: string; celulas: ReactNode[]; resumo?: ReactNode; atenuada?: boolean };

/**
 * Tabela em grade: `grade` é o grid-template-columns. Com `resumo` nas linhas,
 * o celular mostra o resumo empilhado no lugar da grade; sem ele, a grade
 * rola na horizontal a partir de `larguraMin`.
 */
export function Tabela({ titulo, acao, colunas, grade, linhas, vazio, larguraMin }: {
    titulo?: ReactNode; acao?: ReactNode; colunas: string[]; grade: string; linhas: LinhaTabela[]; vazio: ReactNode; larguraMin?: number;
}) {
    const compacta = linhas.some((l) => l.resumo !== undefined);
    const grid = compacta ? 'hidden sm:grid' : 'grid';
    return (
        <Cartao recuo="nenhum" className="overflow-hidden">
            {(titulo || acao) && (
                <div className="flex items-center justify-between gap-3 px-5 py-4 lg:px-6">
                    {titulo && <h2 className="display text-lg font-bold">{titulo}</h2>}
                    {acao}
                </div>
            )}
            {linhas.length === 0 ? (
                <div className="border-t border-linha-2 px-5 py-6 text-sm text-tinta-3 lg:px-6">{vazio}</div>
            ) : (
                <div className={compacta ? '' : 'overflow-x-auto'}>
                    <div style={{ minWidth: compacta ? undefined : larguraMin }}>
                        <div className={`${grid} gap-3 bg-fundo px-5 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-tinta-3 lg:px-6`}
                             style={{ gridTemplateColumns: grade }}>
                            {colunas.map((c) => <span key={c}>{c}</span>)}
                        </div>
                        {linhas.map((l) => {
                            const cor = l.atenuada ? 'bg-fundo/60 text-tinta-3' : '';
                            const celulas = l.celulas.map((c, i) => <span key={i} className="min-w-0">{c}</span>);
                            const linhaGrade = `${grid} items-center gap-3 border-t border-linha-2 px-5 py-3.5 text-sm lg:px-6 ${cor} ${l.href ? 'hover:bg-fundo' : ''}`;
                            const resumo = compacta && (
                                <div className={`border-t border-linha-2 px-5 py-3 sm:hidden ${cor}`}>{l.resumo}</div>
                            );
                            if (l.href) {
                                return (
                                    <Link key={l.chave} href={l.href as Route} className="block text-tinta">
                                        {resumo}
                                        <span className={linhaGrade} style={{ gridTemplateColumns: grade }}>{celulas}</span>
                                    </Link>
                                );
                            }
                            return (
                                <div key={l.chave}>
                                    {resumo}
                                    <div className={linhaGrade} style={{ gridTemplateColumns: grade }}>{celulas}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Cartao>
    );
}
```

- [ ] **Step 4: `segmentado.tsx`, `alerta.tsx`**

`components/ui/segmentado.tsx`:
```tsx
import Link from 'next/link';
import type { Route } from 'next';

/** Troca um parâmetro da URL por link: funciona sem JavaScript e fica no histórico. */
export function Segmentado({ rotulo, opcoes, atual, base, param }: {
    rotulo: string; opcoes: { valor: string; rotulo: string }[]; atual: string; base: string; param: string;
}) {
    return (
        <nav aria-label={rotulo} className="inline-flex rounded-[10px] border border-linha bg-superficie p-[3px]">
            {opcoes.map((o) => (
                <Link key={o.valor} href={`${base}?${param}=${o.valor}` as Route} aria-current={o.valor === atual ? 'page' : undefined}
                      className={`flex min-h-9 items-center rounded-[7px] px-3.5 text-[13px] font-semibold ${o.valor === atual ? 'bg-azul text-white' : 'text-tinta-2 hover:bg-superficie-2'}`}>
                    {o.rotulo}
                </Link>
            ))}
        </nav>
    );
}
```

`components/ui/alerta.tsx`:
```tsx
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './icone';

const FUNDO = { risco: 'bg-risco-sof', atencao: 'bg-atencao-sof', azul: 'bg-azul-sof' } as const;
const ICONE = { risco: 'text-risco', atencao: 'text-atencao', azul: 'text-azul' } as const;
const TITULO = { risco: 'text-risco-texto', atencao: 'text-atencao-texto', azul: 'text-tinta' } as const;
const ACAO = { risco: 'text-risco-texto', atencao: 'text-atencao-texto', azul: 'text-azul' } as const;

export function Alerta({ tom, icone, titulo, children, acao }: {
    tom: keyof typeof FUNDO; icone: NomeIcone; titulo: string; children?: ReactNode; acao?: { href: string; rotulo: string };
}) {
    return (
        <div className={`flex items-center gap-3.5 rounded-card p-4 ${FUNDO[tom]}`}>
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-superficie ${ICONE[tom]}`}>
                <Icone nome={icone} />
            </span>
            <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className={`text-sm font-bold ${TITULO[tom]}`}>{titulo}</span>
                {children && <span className="text-[12.5px] leading-snug text-tinta-2">{children}</span>}
            </div>
            {acao && (
                <Link href={acao.href as Route} className={`flex min-h-11 shrink-0 items-center text-[13px] font-bold ${ACAO[tom]}`}>
                    {acao.rotulo}
                </Link>
            )}
        </div>
    );
}
```

- [ ] **Step 5: `sparkline.tsx`, `grafico-linhas.tsx`**

`components/ui/sparkline.tsx`:
```tsx
import { caminhoSvg } from '@/lib/visual';

export function Sparkline({ valores, rotulo, invertida = false }: { valores: (number | null)[]; rotulo: string; invertida?: boolean }) {
    const nums = valores.filter((v): v is number => v !== null);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const amp = Math.max(...nums) - min || 1;
    const x = (i: number) => (i / (valores.length - 1)) * 300;
    const y = (v: number) => 70 - ((v - min) / amp) * 60;
    return (
        <svg viewBox="0 0 300 80" preserveAspectRatio="none" className={`h-16 w-full ${invertida ? 'text-white' : 'text-azul'}`} role="img" aria-label={rotulo}>
            <path d={caminhoSvg(valores.map((v, i) => (v === null ? null : [x(i), y(v)])))} fill="none" stroke="currentColor"
                  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}
```

`components/ui/grafico-linhas.tsx`:
```tsx
import { afastarRotulos, caminhoSvg } from '@/lib/visual';

export type SerieGrafico = { id: string; nome: string; valores: (number | null)[]; destaque?: 'azul' | 'risco' };

const X0 = 8, X1 = 590, Y0 = 16, Y1 = 196;

/**
 * Linhas por loja. Só as séries com `destaque` ganham cor; as outras ficam
 * cinza, para o gráfico não virar arco-íris. O rótulo vai no fim de cada linha.
 */
export function GraficoLinhas({ series, formato, rotulosX, rotulo }: {
    series: SerieGrafico[]; formato: (n: number) => string; rotulosX: [string, string]; rotulo: string;
}) {
    const todos = series.flatMap((s) => s.valores).filter((v): v is number => v !== null);
    if (todos.length === 0) return <p className="text-sm text-tinta-3">Ainda não há semanas suficientes para comparar.</p>;
    const min = Math.min(...todos);
    const amp = Math.max(...todos) - min || 1;
    const n = Math.max(...series.map((s) => s.valores.length));
    const x = (i: number) => X0 + (n <= 1 ? 0 : (i / (n - 1)) * (X1 - X0));
    const y = (v: number) => Y1 - ((v - min) / amp) * (Y1 - Y0);
    const cinzaPrimeiro = [...series].sort((a, b) => Number(!!a.destaque) - Number(!!b.destaque));
    const finais = series.flatMap((s) => {
        for (let i = s.valores.length - 1; i >= 0; i--) { const v = s.valores[i]; if (v !== null) return [{ s, v }]; }
        return [];
    });
    const ys = afastarRotulos(finais.map((f) => y(f.v) + 4), 14);
    return (
        <figure className="m-0">
            <svg viewBox="0 0 780 212" className="h-auto w-full" role="img" aria-label={rotulo}>
                {[Y0, (Y0 + Y1) / 2, Y1].map((g) => <line key={g} x1={X0} x2={X1} y1={g} y2={g} className="stroke-linha-2" />)}
                {cinzaPrimeiro.map((s) => (
                    <path key={s.id} d={caminhoSvg(s.valores.map((v, i) => (v === null ? null : [x(i), y(v)])))} fill="none"
                          strokeWidth={s.destaque ? 3 : 2} strokeLinecap="round" strokeLinejoin="round"
                          className={s.destaque === 'azul' ? 'stroke-azul' : s.destaque === 'risco' ? 'stroke-risco' : 'stroke-linha-campo'} />
                ))}
                {finais.map((f, k) => (
                    <text key={f.s.id} x={X1 + 12} y={ys[k]}
                          className={`text-[12px] ${f.s.destaque === 'azul' ? 'fill-azul font-bold' : f.s.destaque === 'risco' ? 'fill-risco-texto font-bold' : 'fill-tinta-2'}`}>
                        {f.s.nome} {formato(f.v)}{f.s.destaque === 'risco' ? ' ▼' : f.s.destaque === 'azul' ? ' ▲' : ''}
                    </text>
                ))}
            </svg>
            <figcaption className="flex w-3/4 justify-between text-xs text-tinta-3"><span>{rotulosX[0]}</span><span>{rotulosX[1]}</span></figcaption>
        </figure>
    );
}
```

- [ ] **Step 6: `botao-copiar.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Icone } from './icone';

export function BotaoCopiar({ texto }: { texto: string }) {
    const [copiado, setCopiado] = useState(false);
    return (
        <button type="button" aria-live="polite"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(texto);
                        setCopiado(true);
                        setTimeout(() => setCopiado(false), 2000);
                    } catch {
                        setCopiado(false);
                    }
                }}
                className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-ctl border border-linha bg-superficie px-3 text-[13px] font-semibold text-azul">
            <Icone nome={copiado ? 'check' : 'copiar'} tamanho={14} />{copiado ? 'Copiado' : 'Copiar texto'}
        </button>
    );
}
```

- [ ] **Step 7: Exportar no `index.ts`**

Acrescente:
```ts
export { Comparacao } from './comparacao';
export { Kpi } from './kpi';
export { TempoEspera } from './tempo-espera';
export { SerieDias, type DiaSerie } from './serie-dias';
export { Tabela, type LinhaTabela } from './tabela';
export { Segmentado } from './segmentado';
export { Alerta } from './alerta';
export { Sparkline } from './sparkline';
export { GraficoLinhas, type SerieGrafico } from './grafico-linhas';
export { BotaoCopiar } from './botao-copiar';
```

- [ ] **Step 8: Estender a vitrine**

Em `app/dev/ui/page.tsx`, acrescente aos imports `Alerta, BotaoCopiar, Comparacao, GraficoLinhas, Kpi, Segmentado, SerieDias, Sparkline, Tabela, TempoEspera` e, antes do `<EstadoVazio>`, o bloco:

```tsx
<div className="grid gap-5 lg:grid-cols-4">
    <Kpi rotulo="Resposta média" valor={125} unidade=" min"
         comparacao={<Comparacao delta={84} melhorQuando="menor">3× mais lenta que sua média (41 min)</Comparacao>} />
    <Kpi rotulo="Leads" valor={13} legenda="sua média: 11 por dia" />
    <Kpi heroi rotulo="Nota da equipe" valor={74} legenda="▲ 3 · rede: 71" />
    <Cartao className="flex flex-col gap-2"><TempoEspera ms={12 * 60000} /><TempoEspera ms={42 * 60000} /><TempoEspera ms={192 * 60000} prefixo="Esperando" /></Cartao>
</div>
<Cartao variante="heroi" className="flex flex-col gap-3">
    <SerieDias invertida dias={Array.from({ length: 14 }, (_, i) => ({ dia: `2026-09-${String(i + 10).padStart(2, '0')}`, nota: i % 5 === 4 ? null : 55 + i, temRelatorio: i !== 2 }))} />
    <Sparkline invertida rotulo="Série" valores={[58, 60, 55, 57, 52, 50, 47, 45, 40, 36, 33, 30]} />
</Cartao>
<div className="grid gap-4 lg:grid-cols-3">
    <Alerta tom="risco" icone="wifi_off" titulo="WhatsApp do Tiago caiu" acao={{ href: '/equipe', rotulo: 'Avisar' }}>ontem às 16h</Alerta>
    <Alerta tom="atencao" icone="relogio" titulo="9 clientes esperando">4 há mais de 2 horas</Alerta>
    <Alerta tom="azul" icone="cadastro" titulo="2 cadastros aguardando" acao={{ href: '/aprovacoes', rotulo: 'Aprovar' }} />
</div>
<Segmentado rotulo="Indicador" base="/dev/ui" param="indicador" atual="nota"
            opcoes={[{ valor: 'nota', rotulo: 'Nota' }, { valor: 'conversao', rotulo: 'Conversões' }, { valor: 'resposta', rotulo: 'Resposta' }]} />
<Cartao>
    <GraficoLinhas rotulo="Exemplo" rotulosX={['jun', 'set']} formato={(v) => String(Math.round(v))} series={[
        { id: 'a', nome: 'Noiva do Mar', valores: [72, 74, 76, 78, 81], destaque: 'azul' },
        { id: 'b', nome: 'Tramandaí', valores: [71, 69, 66, 64, 63], destaque: 'risco' },
        { id: 'c', nome: 'Capão', valores: [66, 69, 71, 73, 74] },
        { id: 'd', nome: 'Xangri-lá', valores: [69, 70, 70, null, 70] },
    ]} />
</Cartao>
<Tabela titulo="Tabela" colunas={['Cliente', 'Mensagens', 'Situação']} grade="minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)" vazio="Nada."
        linhas={[
            { chave: '1', href: '/dev/ui', celulas: ['Carlos Henrique', '214', <Selo key="s" tom="bom">Respondida</Selo>], resumo: 'Carlos Henrique · respondida' },
            { chave: '2', celulas: ['Tiago Feltrin', '—', 'sem dado'], resumo: 'Tiago Feltrin · sem dado', atenuada: true },
        ]} />
<Cartao><BotaoCopiar texto="Márcia, consigo te entregar hoje." /></Cartao>
```

- [ ] **Step 9: Checar e conferir**

Run: `npm run typecheck && npm run lint && npm run test:unidade`
Expected: sem erro.
Browser: `/dev/ui` a 390 e 1440. A tabela vira resumo empilhado no celular. O gráfico mostra só duas linhas coloridas, com rótulos sem sobreposição. "Copiar texto" vira "Copiado".

- [ ] **Step 10: Commit**

```bash
git add components/ui app/dev
git commit -m "feat: componentes de dado — KPI, comparação, espera, tabela, gráficos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Shell — sidebar azul, barra inferior com ícones

**Files:**
- Create: `components/ui/shell.tsx`
- Modify: `components/app-shell.tsx` (arquivo inteiro), `components/ui/index.ts`

**Interfaces:**
- Consumes: `Icone`, `Selo`, `iniciais`, `sair` de `@/app/actions/auth`, logos de `@/public/marca/`.
- Produces: `default export Shell({ papel: Papel; nome: string; unidade?: string | null; atual: string; conexao?: 'conectada' | 'fora' | null; pendentes?: number; children })`, `type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin'`. `components/app-shell.tsx` continua exportando o mesmo default, e as 17 páginas não mudam.

- [ ] **Step 1: `components/ui/shell.tsx`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import logo from '@/public/marca/logo.png';
import logoBranco from '@/public/marca/logo-branco.png';
import { sair } from '@/app/actions/auth';
import { iniciais } from '@/lib/visual';
import { Icone, type NomeIcone } from './icone';
import { Selo } from './selo';

export type Papel = 'vendedor' | 'gestor' | 'supervisor' | 'admin';
type Item = { href: string; rotulo: string; curto?: string; icone: NomeIcone };

const ITENS: Record<Papel, Item[]> = {
    vendedor: [
        { href: '/dashboard', rotulo: 'Meu dia', icone: 'casa' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        { href: '/evolucao', rotulo: 'Evolução', icone: 'tendencia' },
        { href: '/meu-mec', rotulo: 'Meu MEC', icone: 'mec' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
    gestor: [
        { href: '/equipe', rotulo: 'Minha equipe', curto: 'Equipe', icone: 'equipe' },
        { href: '/equipe/mec', rotulo: 'Aderência ao MEC', curto: 'MEC', icone: 'mec' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Configurações', curto: 'Ajustes', icone: 'engrenagem' },
    ],
    supervisor: [
        { href: '/unidades', rotulo: 'Rede', icone: 'rede' },
        { href: '/mec', rotulo: 'O MEC', icone: 'mec' },
        { href: '/descobertas', rotulo: 'Descobertas', icone: 'lampada' },
        { href: '/conversas', rotulo: 'Conversas', icone: 'conversa' },
        // Só supervisor e admin aprovam alguém como gestor, e só eles resolvem
        // cadastro de unidade que ainda não tem gestor.
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
    admin: [
        { href: '/admin', rotulo: 'Operação', icone: 'operacao' },
        { href: '/admin/unidades', rotulo: 'Unidades e papéis', curto: 'Unidades', icone: 'equipe' },
        { href: '/admin/conexoes', rotulo: 'Conexões', icone: 'wifi' },
        { href: '/admin/eventos', rotulo: 'Registro de ações', curto: 'Registro', icone: 'lista' },
        { href: '/aprovacoes', rotulo: 'Aprovações', icone: 'check' },
        { href: '/perfil', rotulo: 'Perfil', icone: 'pessoa' },
    ],
};

const NOME_PAPEL: Record<Papel, string> = { vendedor: 'Vendedor', gestor: 'Gestão', supervisor: 'Supervisão', admin: 'Administração' };

export default function Shell({ papel, nome, unidade, atual, conexao, pendentes = 0, children }: {
    papel: Papel; nome: string; unidade?: string | null; atual: string;
    conexao?: 'conectada' | 'fora' | null; pendentes?: number; children: ReactNode;
}) {
    const itens = ITENS[papel];
    const legenda = [NOME_PAPEL[papel], unidade].filter(Boolean).join(' · ');
    const badge = (href: string) => href === '/aprovacoes' && pendentes > 0;

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
            <aside className="sticky top-0 hidden h-screen flex-col gap-9 bg-azul px-[18px] pb-6 pt-[30px] text-white lg:flex">
                <Link href="/" className="px-2"><Image src={logoBranco} alt="Redemac Zona Nova" width={150} priority /></Link>
                <nav aria-label="Navegação principal" className="flex flex-col gap-1">
                    {itens.map((item) => {
                        const ativo = atual === item.href;
                        return (
                            <Link key={item.href} href={item.href as Route} aria-current={ativo ? 'page' : undefined}
                                  className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition ${ativo ? 'bg-white/13 font-semibold text-white' : 'font-medium text-white/75 hover:bg-white/8 hover:text-white'}`}>
                                <Icone nome={item.icone} />
                                {item.rotulo}
                                {badge(item.href) ? (
                                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11.5px] font-bold text-azul">{pendentes}</span>
                                ) : ativo && (
                                    <span aria-hidden="true" className="ml-auto size-[7px] rotate-45 rounded-[1.5px] bg-verde-marca" />
                                )}
                            </Link>
                        );
                    })}
                </nav>
                <div className="mt-auto flex flex-col gap-3.5 border-t border-white/15 px-2 pt-[18px]">
                    <div className="flex items-center gap-2.5">
                        <span className="display flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-[13px] font-bold">{iniciais(nome) ?? '·'}</span>
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[13.5px] font-semibold">{nome}</span>
                            <span className="truncate text-xs text-white/65">{legenda}</span>
                        </div>
                    </div>
                    {conexao && (
                        <span className="flex items-center gap-2 text-[12.5px] text-white/85">
                            <span className={`size-2 rounded-full ${conexao === 'conectada' ? 'bg-bom-claro' : 'bg-risco'}`} aria-hidden="true" />
                            {conexao === 'conectada' ? 'WhatsApp conectado' : 'WhatsApp fora do ar'}
                        </span>
                    )}
                    <form action={sair}>
                        <button type="submit" className="flex min-h-9 items-center gap-2 text-[13px] text-white/75 hover:text-white">
                            <Icone nome="sair" tamanho={16} />Sair
                        </button>
                    </form>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-linha bg-superficie/95 px-4 py-2 backdrop-blur lg:hidden">
                    <Link href="/"><Image src={logo} alt="Redemac Zona Nova" width={92} priority /></Link>
                    <div className="flex items-center gap-1">
                        {conexao && <Selo tom={conexao === 'conectada' ? 'bom' : 'risco'} ponto>{conexao === 'conectada' ? 'Conectado' : 'Fora do ar'}</Selo>}
                        <Link href="/perfil" aria-label="Perfil" className="flex size-11 items-center justify-center text-azul"><Icone nome="pessoa" /></Link>
                        <form action={sair}>
                            <button type="submit" aria-label="Sair" className="flex size-11 items-center justify-center text-tinta-2"><Icone nome="sair" /></button>
                        </form>
                    </div>
                </header>
                <main className="pb-24 lg:pb-0">{children}</main>
                <nav aria-label="Navegação inferior"
                     className="fixed inset-x-0 bottom-0 z-20 grid border-t border-linha bg-superficie px-1.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
                     style={{ gridTemplateColumns: `repeat(${Math.min(itens.length, 5)}, minmax(0, 1fr))` }}>
                    {itens.slice(0, 5).map((item) => {
                        const ativo = atual === item.href;
                        return (
                            <Link key={item.href} href={item.href as Route} aria-current={ativo ? 'page' : undefined}
                                  className={`relative flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] ${ativo ? 'font-bold text-azul' : 'font-semibold text-tinta-3'}`}>
                                <Icone nome={item.icone} tamanho={22} />
                                <span className="max-w-full truncate">{item.curto ?? item.rotulo}</span>
                                {badge(item.href) && <span className="absolute right-[22%] top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-risco px-1 text-[10px] font-bold text-white">{pendentes}</span>}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Transição em `components/app-shell.tsx`**

Substitua o arquivo inteiro por:
```tsx
// Transição (spec §8): as telas ainda não migradas importam o shell daqui.
// Sai na fase 5, quando todas importarem @/components/ui/shell.
export { default } from '@/components/ui/shell';
```

- [ ] **Step 3: Exportar o tipo**

Em `components/ui/index.ts`: `export { default as Shell, type Papel } from './shell';`

- [ ] **Step 4: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erro. As 17 páginas compilam sem mudança, porque a API é a mesma.

- [ ] **Step 5: Conferir**

Browser com sessão: `/conversas` e `/perfil` (telas ainda antigas) a 390 e 1440. Confira: sidebar azul com logo branco, ícones, losango verde no item ativo, barra inferior com ícones no celular, nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
git add components/ui/shell.tsx components/ui/index.ts components/app-shell.tsx
git commit -m "feat: shell novo com sidebar azul e navegação com ícones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Meu dia (`/dashboard`)

Conforme o artboard "Meu dia · desktop" e "Meu dia · celular". As queries são as mesmas de hoje. Só a do `relatorios_diarios` ganha `.returns<>`.

**Files:**
- Create: `app/(app)/dashboard/formato.ts`, `app/(app)/dashboard/secoes.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: componentes das Tasks 4 a 6; `media`, `comparaTempo`, `tomDelta`, `setaDoTom`, `tomEspera`, `tomFaixa` de `@/lib/visual`; `variacaoSemanal`, `ETAPAS`, `NOMES_ETAPA` de `@/lib/derivacoes`; `desde`, `diasAte`, `esperaDoCliente`, `esperaEmTexto`, `foiRespondido`, `primeiroNome`, `respostaMediaEmMinutos`, `semTelefone`, `telefoneBonito`, `temposDeResposta`, `type Msg` de `@/lib/painel`; `dataEmSaoPaulo` de `@/lib/analise`.
- Produces: nada consumido por outras tarefas.

- [ ] **Step 1: `app/(app)/dashboard/formato.ts`** (funções movidas do page.tsx atual, sem mudança de comportamento)

```ts
export const FUSO = 'America/Sao_Paulo';

/** Meia-noite de hoje em Brasília, como instante. */
export function inicioDoDia(agora: Date): Date {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
    return new Date(`${dia}T00:00:00-03:00`);
}

export function horaBrasilia(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(':', 'h');
}

export function dataCurtaBrasilia(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "quarta, 23 de setembro" de um AAAA-MM-DD. */
export function diaPorExtenso(dataRef: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(`${dataRef}T12:00:00-03:00`));
}

export function saudacao(agora: Date): string {
    const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(agora));
    if (hora < 12) return 'Bom dia';
    return hora < 18 ? 'Boa tarde' : 'Boa noite';
}

export function dataPorExtenso(agora: Date): string {
    const texto = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(agora);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}
```

- [ ] **Step 2: `app/(app)/dashboard/secoes.tsx`**

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
    Avatar, Barra, BotaoLink, Cartao, Comparacao, Icone, Kpi, Numero, Selo, SerieDias, Tabela, TEXTO, TempoEspera,
    type DiaSerie,
} from '@/components/ui';
import { comparaTempo, setaDoTom, tomDelta, tomEspera, tomFaixa } from '@/lib/visual';
import { ETAPAS, NOMES_ETAPA } from '@/lib/derivacoes';
import { esperaDoCliente, esperaEmTexto, semTelefone, telefoneBonito, type Msg } from '@/lib/painel';
import { dataCurtaBrasilia, horaBrasilia } from './formato';

export type ConversaComMensagens = {
    id: string;
    cliente_nome: string | null;
    cliente_telefone: string;
    ultima_mensagem_em: string;
    mensagens: (Msg & { tipo: string; conteudo: string | null })[];
};

export type RelatorioDiario = {
    data_ref: string;
    score_geral: number | null;
    leads_atendidos: number;
    conversoes_confirmadas: number;
    oportunidades_perdidas: number;
    tempo_medio_resposta_s: number | null;
    taxa_resposta: number | null;
    payload: Record<string, unknown> | null;
};

export type AderenciaDia = { data_ref: string; aderencia_geral: number | null; por_etapa: Record<string, number | null> | null };
export type Coaching = { resumo?: string; melhorias?: string[]; elogio?: string; desafio?: string };

/**
 * Quem espera há quatro horas quer resposta, e resposta acontece no WhatsApp:
 * o wa.me abre aquela conversa no celular. Contato `@lid` não tem telefone, e
 * um wa.me com aqueles dígitos abriria uma pessoa qualquer; aí vai para a conversa.
 */
function destinoDaEspera(c: ConversaComMensagens): { href: string; target?: string; rel?: string } {
    return semTelefone(c.cliente_telefone)
        ? { href: `/conversas/${c.id}` }
        : { href: `https://wa.me/${c.cliente_telefone.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener noreferrer' };
}

/** A última coisa que o cliente disse, para o item da fila ter contexto. */
function ultimaFalaDoCliente(c: ConversaComMensagens): string {
    const dele = c.mensagens.filter((m) => m.direcao === 'entrada').sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const ultima = dele[dele.length - 1];
    if (!ultima) return '';
    if (ultima.tipo === 'audio') return 'Áudio';
    if (ultima.tipo !== 'texto') return ultima.tipo;
    const texto = (ultima.conteudo ?? '').trim();
    return texto.length > 60 ? `"${texto.slice(0, 60)}…"` : `"${texto}"`;
}

const nomeDaConversa = (c: ConversaComMensagens) => c.cliente_nome ?? telefoneBonito(c.cliente_telefone);

export function AvisoConexao({ conexao }: { conexao: { ultimo_evento_em: string | null } | null }) {
    return (
        <Cartao variante="risco" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Icone nome="alerta" tamanho={22} className="shrink-0 text-risco" />
            <div className="flex grow flex-col gap-1">
                <span className="display text-[17px] font-bold text-risco-texto">{conexao ? 'Seu WhatsApp saiu do ar' : 'Nenhum WhatsApp conectado'}</span>
                <span className="text-[13px] text-risco-texto">
                    Nada está sendo lido nem analisado{conexao?.ultimo_evento_em && ` desde ${horaBrasilia(conexao.ultimo_evento_em)}`}.
                </span>
            </div>
            <BotaoLink href="/conectar">Reconectar agora</BotaoLink>
        </Cartao>
    );
}

export function AvisoAprovacoes({ pendentes }: { pendentes: number }) {
    return (
        <Link href="/aprovacoes" className="flex min-h-11 items-center justify-between rounded-card border border-linha bg-superficie p-5">
            <span className="flex flex-col"><span className="display text-[15px] font-bold">Aprovações</span>
                <span className="text-[12.5px] text-tinta-3">{pendentes ? `${pendentes} esperando você` : 'ninguém esperando'}</span></span>
            {pendentes > 0 && <Selo tom="azul">{pendentes}</Selo>}
        </Link>
    );
}

const VISIVEIS = 5;

function ItemEspera({ conversa, espera }: { conversa: ConversaComMensagens; espera: number }) {
    const destino = destinoDaEspera(conversa);
    return (
        <li className="border-t border-linha-2">
            <a {...destino} className="flex min-h-11 items-center gap-3.5 py-3 text-tinta">
                <Avatar nome={conversa.cliente_nome} />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{nomeDaConversa(conversa)}</span>
                    <span className="truncate text-[13px] text-tinta-3">{ultimaFalaDoCliente(conversa)}</span>
                </span>
                <TempoEspera ms={espera} />
                <span className="hidden items-center gap-1.5 rounded-ctl border border-linha px-3 py-2 text-[12.5px] font-semibold text-azul sm:inline-flex">
                    Responder<Icone nome={destino.target ? 'externo' : 'seta_direita'} tamanho={14} />
                </span>
            </a>
        </li>
    );
}

export function EsperandoVoce({ className = '', titulo, esperando }: {
    className?: string; titulo: string; esperando: { conversa: ConversaComMensagens; espera: number }[];
}) {
    return (
        <Cartao className={`flex flex-col gap-2 ${className}`}>
            <div>
                <h3 className="display flex items-center gap-2.5 text-lg font-bold">{titulo}{esperando.length > 0 && <Selo tom="risco">{esperando.length}</Selo>}</h3>
                <p className="mt-1 text-[13px] text-tinta-3">
                    {esperando.length ? 'O cliente falou por último e ninguém respondeu. Quem espera há mais tempo vem primeiro.' : 'Ninguém esperando resposta agora.'}
                </p>
            </div>
            {esperando.length > 0 && <ul className="flex flex-col">{esperando.slice(0, VISIVEIS).map((e) => <ItemEspera key={e.conversa.id} {...e} />)}</ul>}
            {esperando.length > VISIVEIS && (
                // O selo conta todos; sem isto, "20" ao lado de cinco itens parecia erro de conta.
                <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-azul group-open:hidden">
                        Ver os outros {esperando.length - VISIVEIS}<Icone nome="seta_direita" tamanho={14} />
                    </summary>
                    <ul className="flex flex-col">{esperando.slice(VISIVEIS).map((e) => <ItemEspera key={e.conversa.id} {...e} />)}</ul>
                </details>
            )}
        </Cartao>
    );
}

function LinhaHoje({ rotulo, detalhe, valor, children }: { rotulo: string; detalhe?: ReactNode; valor: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex flex-col gap-2.5 border-t border-linha-2 py-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1"><span className="text-[13px] text-tinta-2">{rotulo}</span>{detalhe && <span className="text-[12.5px] text-tinta-3">{detalhe}</span>}</div>
                {valor}
            </div>
            {children}
        </div>
    );
}

export function HojeAteAgora({ className = '', conversas, respostaMedia, respostaOntemMin, taxa, respondidos, escreveram, mediaLeads, ligado }: {
    className?: string; conversas: number; respostaMedia: number | null; respostaOntemMin: number | null;
    taxa: number | null; respondidos: number; escreveram: number; mediaLeads: number | null; ligado: boolean;
}) {
    if (conversas === 0) {
        // Ausência de dado, nunca nota zero — design/README.
        return (
            <Cartao variante="tracejado" className={`flex flex-col gap-2 ${className}`}>
                <h3 className="display text-lg font-bold">Sem movimento hoje</h3>
                <p className="text-[13px] leading-relaxed text-tinta-2">
                    {ligado
                        ? 'Nenhuma conversa nova. Seu número está conectado e ouvindo — quando um cliente chamar, ele aparece aqui.'
                        : 'Nenhuma conversa nova, e o número está fora do ar. Reconecte para voltar a receber.'}
                </p>
                <p className="text-xs leading-relaxed text-tinta-3">Dia sem conversa não vira nota. Isto é ausência de dado, não desempenho ruim.</p>
            </Cartao>
        );
    }
    return (
        <Cartao className={`flex flex-col ${className}`}>
            <h3 className="display mb-2 text-lg font-bold">Hoje até agora</h3>
            <LinhaHoje rotulo="Conversas" detalhe={mediaLeads === null ? undefined : `sua média: ${Math.round(mediaLeads)} leads por dia`} valor={<Numero valor={conversas} />} />
            <LinhaHoje rotulo="Resposta média"
                       detalhe={respostaMedia !== null && respostaOntemMin !== null
                           ? <Comparacao delta={respostaMedia - respostaOntemMin} melhorQuando="menor">{comparaTempo(respostaMedia, respostaOntemMin, 'ontem')}</Comparacao>
                           : undefined}
                       valor={<Numero valor={respostaMedia ?? '—'} unidade={respostaMedia === null ? undefined : ' min'} />} />
            <LinhaHoje rotulo="Clientes respondidos" detalhe={escreveram > 0 ? `${respondidos} de ${escreveram} que escreveram hoje` : undefined}
                       valor={<Numero valor={taxa ?? '—'} unidade={taxa === null ? undefined : '%'} />}>
                {taxa !== null && <Barra pct={taxa} rotulo="Clientes respondidos" />}
            </LinhaHoje>
            <p className="mt-auto rounded-[10px] bg-fundo px-3.5 py-3 text-[12.5px] leading-relaxed text-tinta-2">
                Números ao vivo. A nota de hoje sai no fechamento, às 00h30.
            </p>
        </Cartao>
    );
}

export function RelatorioDoDia({ relatorio, variacao, historico, mediaLeads, mediaRespostaMin }: {
    relatorio: RelatorioDiario; variacao: number | null; historico: DiaSerie[]; mediaLeads: number | null; mediaRespostaMin: number | null;
}) {
    const nota = relatorio.score_geral == null ? null : Math.round(Number(relatorio.score_geral));
    const respostaMin = relatorio.tempo_medio_resposta_s == null ? null : Math.round(Number(relatorio.tempo_medio_resposta_s) / 60);
    return (
        <div className="grid gap-5 lg:grid-cols-12">
            <Cartao variante="heroi" className="flex flex-col gap-3.5 lg:col-span-4">
                <span className="text-[13px] text-white/75">Sua nota</span>
                {nota === null ? (
                    <>
                        <span className="display text-2xl font-bold">Não teve nota</span>
                        <span className="text-[12.5px] leading-relaxed text-white/75">Só houve suporte e conversa social. Isso não conta contra você.</span>
                    </>
                ) : (
                    <>
                        <span className="flex items-baseline gap-1.5"><Numero valor={nota} tamanho="xl" /><span className="text-base text-white/60">/100</span></span>
                        {variacao !== null && (
                            <span className="self-start rounded-full bg-white/12 px-2.5 py-1 text-[12.5px] font-semibold">
                                {setaDoTom(tomDelta(variacao, 'maior'))} {variacao === 0 ? 'igual à sua média de 7 dias' : `${Math.abs(variacao)} ${variacao > 0 ? 'acima' : 'abaixo'} da sua média de 7 dias`}
                            </span>
                        )}
                    </>
                )}
                <SerieDias dias={historico} invertida />
                <span className="text-xs leading-relaxed text-white/65">14 dias. Tracejado: dia só com suporte ou social, sem nota. Só negociação entra na nota.</span>
            </Cartao>
            <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:gap-5">
                <Kpi rotulo="Leads atendidos" valor={relatorio.leads_atendidos} legenda={mediaLeads === null ? undefined : `sua média: ${Math.round(mediaLeads)} por dia`} />
                <Kpi rotulo="Conversões" valor={relatorio.conversoes_confirmadas} legenda="identificadas pela IA na conversa" />
                <Kpi rotulo="Oportunidades perdidas" valor={relatorio.oportunidades_perdidas}
                     legenda={<Link href="/conversas" className="font-semibold text-azul">Ver conversas →</Link>} />
                <Kpi rotulo="Resposta média" valor={respostaMin ?? '—'} unidade={respostaMin === null ? undefined : ' min'}
                     comparacao={respostaMin !== null && mediaRespostaMin !== null
                         ? <Comparacao delta={respostaMin - Math.round(mediaRespostaMin)} melhorQuando="menor">{comparaTempo(respostaMin, mediaRespostaMin)}</Comparacao>
                         : undefined} />
            </div>
        </div>
    );
}

export function Treino({ className = '', coaching }: { className?: string; coaching: Coaching }) {
    return (
        <Cartao variante="suave" className={`flex flex-col gap-4 ${className}`}>
            <div>
                <span className="text-xs font-bold uppercase tracking-[0.09em] text-azul">Seu treino de hoje</span>
                {coaching.resumo && <p className="display mt-2 text-[17px] font-bold leading-snug">{coaching.resumo}</p>}
            </div>
            {!!coaching.melhorias?.length && (
                <ol className="grid gap-3 lg:grid-cols-3">
                    {coaching.melhorias.map((m, i) => (
                        <li key={m} className="flex gap-3 rounded-[10px] bg-superficie p-4 lg:flex-col">
                            <span className="display flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-azul text-[13px] font-bold text-white">{i + 1}</span>
                            <span className="text-[13.5px] leading-snug">{m}</span>
                        </li>
                    ))}
                </ol>
            )}
            {(coaching.elogio || coaching.desafio) && (
                <div className="grid gap-3 lg:grid-cols-2">
                    {coaching.elogio && <p className="text-[13px] leading-relaxed"><strong className="text-azul">O que funcionou:</strong> {coaching.elogio}</p>}
                    {coaching.desafio && <p className="text-[13px] leading-relaxed"><strong className="text-azul">Desafio:</strong> {coaching.desafio}</p>}
                </div>
            )}
        </Cartao>
    );
}

export function MecResumo({ className = '', aderencia }: { className?: string; aderencia: AderenciaDia | null }) {
    const geral = aderencia?.aderencia_geral == null ? null : Math.round(Number(aderencia.aderencia_geral));
    return (
        <Cartao className={`flex flex-col gap-3 ${className}`}>
            <div className="flex items-baseline justify-between">
                <h3 className="display text-lg font-bold">Seu MEC</h3>
                <Numero valor={geral ?? '—'} unidade={geral === null ? undefined : '%'} tamanho="md" />
            </div>
            {aderencia ? (
                <ul className="flex flex-col gap-2.5">
                    {ETAPAS.map((e) => {
                        const bruto = aderencia.por_etapa?.[e];
                        const pct = bruto == null ? null : Math.round(Number(bruto));
                        const tom = pct === null ? 'neutro' : tomFaixa(pct, 35, 50);
                        return (
                            <li key={e} className="grid grid-cols-[118px_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px]">
                                <span className={pct === null ? 'text-tinta-3' : ''}>{NOMES_ETAPA[e]}</span>
                                <Barra pct={pct} tom={tom} rotulo={NOMES_ETAPA[e]} />
                                <span className={`text-right ${pct === null ? 'text-tinta-3' : `font-semibold ${tom === 'azul' ? '' : TEXTO[tom]}`}`}>{pct === null ? '—' : `${pct}%`}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="text-[13px] text-tinta-3">A aderência aparece depois do primeiro relatório analisado.</p>
            )}
            <Link href="/meu-mec" className="mt-auto flex min-h-11 items-center text-[13px] font-semibold text-azul">Ver as sete etapas →</Link>
        </Cartao>
    );
}

export function DoGestor({ observacoes }: { observacoes: { id: string; texto: string; created_at: string }[] }) {
    return (
        <Cartao className="flex flex-col gap-3">
            <h3 className="display text-lg font-bold">Do seu gestor</h3>
            <ul className="flex flex-col gap-3">
                {observacoes.map((o) => (
                    <li key={o.id} className="text-[13.5px] leading-relaxed">
                        <span className="whitespace-pre-line">{o.texto}</span>
                        <span className="mt-0.5 block text-xs text-tinta-3">{dataCurtaBrasilia(o.created_at)}</span>
                    </li>
                ))}
            </ul>
        </Cartao>
    );
}

export function ConversasDeHoje({ conversas, agora }: { conversas: ConversaComMensagens[]; agora: Date }) {
    return (
        <Tabela titulo="Conversas de hoje" vazio="Nenhuma conversa hoje ainda."
                acao={<Link href="/conversas" className="flex min-h-11 items-center text-[13px] font-semibold text-azul">Todas as conversas →</Link>}
                colunas={['Cliente', 'Mensagens', 'Áudios', 'Última', 'Situação']}
                grade="minmax(0,2.2fr) repeat(3,minmax(0,0.8fr)) minmax(0,1.4fr)"
                linhas={conversas.map((c) => {
                    const espera = esperaDoCliente(c.mensagens, agora);
                    const audios = c.mensagens.filter((m) => m.tipo === 'audio').length;
                    const situacao = espera === null
                        ? <Selo tom="bom">Respondida</Selo>
                        : <Selo tom={tomEspera(espera)}>Esperando {esperaEmTexto(espera)}</Selo>;
                    return {
                        chave: c.id,
                        href: `/conversas/${c.id}`,
                        celulas: [
                            <span key="n" className="font-semibold">{nomeDaConversa(c)}</span>,
                            <span key="m" className="num">{c.mensagens.length}</span>,
                            <span key="a" className="num">{audios}</span>,
                            <span key="u" className="num">{horaBrasilia(c.ultima_mensagem_em)}</span>,
                            situacao,
                        ],
                        resumo: (
                            <span className="flex items-center gap-3">
                                <span className="flex min-w-0 grow flex-col gap-0.5">
                                    <span className="truncate text-sm font-semibold">{nomeDaConversa(c)}</span>
                                    <span className="text-xs text-tinta-3">{c.mensagens.length} mensagens · {audios} áudios · {horaBrasilia(c.ultima_mensagem_em)}</span>
                                </span>
                                {situacao}
                            </span>
                        ),
                    };
                })} />
    );
}
```

- [ ] **Step 3: `app/(app)/dashboard/page.tsx`** (arquivo inteiro)

```tsx
import Link from 'next/link';
import { criarClienteServidor } from '@/lib/supabase/server';
import { CabecalhoPagina, EstadoVazio, Icone, Pagina, RotuloSecao, Selo, Shell, type DiaSerie } from '@/components/ui';
import { desde, diasAte, esperaDoCliente, foiRespondido, primeiroNome, respostaMediaEmMinutos, temposDeResposta } from '@/lib/painel';
import { dataEmSaoPaulo } from '@/lib/analise';
import { media } from '@/lib/visual';
import { variacaoSemanal } from '@/lib/derivacoes';
import { dataPorExtenso, diaPorExtenso, horaBrasilia, inicioDoDia, saudacao } from './formato';
import {
    AvisoAprovacoes, AvisoConexao, ConversasDeHoje, DoGestor, EsperandoVoce, HojeAteAgora, MecResumo, RelatorioDoDia, Treino,
    type AderenciaDia, type Coaching, type ConversaComMensagens, type RelatorioDiario,
} from './secoes';

// O painel lê o que chegou há instantes pelo webhook. Gerado uma vez no build
// ele mostraria o dia do deploy para sempre.
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const supabase = await criarClienteServidor();
    const { data: { user } } = await supabase.auth.getUser();

    const agora = new Date();
    const comeco = inicioDoDia(agora);
    // Sete dias para trás: a fila precisa alcançar quem ficou de ontem.
    const janela = new Date(comeco.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dataRef = dataEmSaoPaulo(agora);

    // Tudo já passou pela RLS. Ver tests/rls.sql.
    const [{ data: perfil }, { data: conexao }, { data: conversas }, { data: relatorios }, { data: aderencia }, { data: observacoes }] = await Promise.all([
        supabase.from('profiles').select('nome, role, unidades!profiles_unidade_id_fkey(nome)').eq('id', user!.id)
            .maybeSingle<{ nome: string; role: string; unidades: { nome: string } | null }>(),
        supabase.from('vw_conexoes_status').select('status, numero, ultimo_evento_em').eq('user_id', user!.id)
            .maybeSingle<{ status: string; numero: string | null; ultimo_evento_em: string | null }>(),
        supabase.from('conversas')
            .select('id, cliente_nome, cliente_telefone, ultima_mensagem_em, mensagens(direcao, automatica, enviada_em, tipo, conteudo)')
            .gte('ultima_mensagem_em', janela.toISOString()).eq('bloqueada', false)
            .order('ultima_mensagem_em', { ascending: false }).returns<ConversaComMensagens[]>(),
        supabase.from('relatorios_diarios')
            .select('data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta,payload')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(30).returns<RelatorioDiario[]>(),
        supabase.from('aderencia_diaria').select('data_ref,aderencia_geral,por_etapa')
            .eq('user_id', user!.id).order('data_ref', { ascending: false }).limit(1).maybeSingle<AderenciaDia>(),
        // A tela do gestor promete "ele vê o que você escrever": é aqui.
        supabase.from('observacoes_gestor').select('id,texto,created_at')
            .eq('vendedor_id', user!.id).order('created_at', { ascending: false }).limit(3)
            .returns<{ id: string; texto: string; created_at: string }[]>(),
    ]);

    const todas = conversas ?? [];
    const deHoje = todas.filter((c) => new Date(c.ultima_mensagem_em) >= comeco);
    const esperando = todas
        .map((c) => ({ conversa: c, espera: esperaDoCliente(c.mensagens, agora) }))
        .filter((e): e is { conversa: ConversaComMensagens; espera: number } => e.espera !== null)
        .sort((a, b) => b.espera - a.espera);

    // A fila acima olha o histórico inteiro; as métricas do dia, não.
    const respostaMedia = respostaMediaEmMinutos(deHoje.flatMap((c) => temposDeResposta(desde(c.mensagens, comeco))));
    const comFala = deHoje.map((c) => foiRespondido(desde(c.mensagens, comeco))).filter((r): r is boolean => r !== null);
    const respondidos = comFala.filter(Boolean).length;
    const taxa = comFala.length ? Math.round((respondidos / comFala.length) * 100) : null;

    const gere = ['gestor', 'supervisor', 'admin'].includes(perfil?.role ?? '');
    const { count: pendentes } = gere
        ? await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
        : { count: 0 };

    const ligado = conexao?.status === 'conectada';
    const rels = relatorios ?? [];
    const relatorio = rels.find((r) => r.data_ref === dataRef) ?? rels[0] ?? null;
    const porDia = new Map(rels.map((r) => [r.data_ref, r]));
    const ontem = new Date(Date.parse(`${dataRef}T12:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Catorze dias corridos até ontem, o último que o fechamento cobre.
    const historico: DiaSerie[] = diasAte(ontem, 14).map((dia) => {
        const r = porDia.get(dia);
        return { dia, temRelatorio: !!r, nota: r?.score_geral == null ? null : Math.round(Number(r.score_geral)) };
    });

    const recentes = rels.filter((r) => r.data_ref < dataRef).slice(0, 7);
    const anteriores = relatorio ? rels.filter((r) => r.data_ref < relatorio.data_ref).slice(0, 7) : [];
    const respostaOntem = porDia.get(ontem)?.tempo_medio_resposta_s;
    const coaching = (relatorio?.payload ?? {}) as Coaching;
    const temTreino = !!(coaching.resumo || coaching.melhorias?.length || coaching.elogio || coaching.desafio);

    return (
        <Shell papel="vendedor" nome={perfil?.nome ?? ''} unidade={perfil?.unidades?.nome} atual="/dashboard" conexao={ligado ? 'conectada' : 'fora'}>
            <Pagina>
                <CabecalhoPagina sobre={dataPorExtenso(agora)} titulo={`${saudacao(agora)}, ${primeiroNome(perfil?.nome)}`}
                                 acoes={deHoje.length > 0 && (
                                     <Selo><Icone nome="relogio" tamanho={14} />Última mensagem às {horaBrasilia(deHoje[0].ultima_mensagem_em)}</Selo>
                                 )} />

                {/* O proxy manda vendedor sem conexão para /conectar. Isto é para
                    quem ele não desvia — e para o caso de o proxy não correr. */}
                {!ligado && <AvisoConexao conexao={conexao} />}
                {gere && <AvisoAprovacoes pendentes={pendentes ?? 0} />}

                <RotuloSecao complemento="ao vivo, atualiza a cada mensagem">Agora</RotuloSecao>
                <div className="grid gap-5 lg:grid-cols-12">
                    <EsperandoVoce className="lg:col-span-7" esperando={esperando} titulo={deHoje.length === 0 ? 'Ficou de ontem' : 'Esperando você'} />
                    <HojeAteAgora className="lg:col-span-5" conversas={deHoje.length} respostaMedia={respostaMedia}
                                  respostaOntemMin={respostaOntem == null ? null : Math.round(Number(respostaOntem) / 60)}
                                  taxa={taxa} respondidos={respondidos} escreveram={comFala.length}
                                  mediaLeads={media(recentes.map((r) => r.leads_atendidos))} ligado={ligado} />
                </div>

                <RotuloSecao
                    complemento={relatorio ? `${diaPorExtenso(relatorio.data_ref)} · fecha todo dia às 00h30` : undefined}
                    acao={<Link href="/evolucao" className="flex min-h-11 items-center text-[13px] font-semibold text-azul">Ver evolução →</Link>}>
                    {relatorio?.data_ref === ontem || !relatorio ? 'Seu relatório de ontem' : 'Seu último relatório'}
                </RotuloSecao>
                {relatorio ? (
                    <>
                        <RelatorioDoDia relatorio={relatorio} historico={historico}
                                        variacao={variacaoSemanal(rels.filter((r) => r.data_ref <= relatorio.data_ref))}
                                        mediaLeads={media(anteriores.map((r) => r.leads_atendidos))}
                                        mediaRespostaMin={media(anteriores.map((r) => (r.tempo_medio_resposta_s == null ? null : Number(r.tempo_medio_resposta_s) / 60)))} />
                        <div className="grid gap-5 lg:grid-cols-12">
                            {temTreino && <Treino className="lg:col-span-8" coaching={coaching} />}
                            <MecResumo className={temTreino ? 'lg:col-span-4' : 'lg:col-span-12'} aderencia={aderencia ?? null} />
                        </div>
                    </>
                ) : (
                    <EstadoVazio titulo="O relatório ainda não fechou">
                        Enquanto isso, os números de cima vêm direto das suas conversas. O primeiro relatório sai no fechamento, às 00h30.
                    </EstadoVazio>
                )}

                {!!observacoes?.length && <DoGestor observacoes={observacoes} />}
                <ConversasDeHoje conversas={deHoje} agora={agora} />
            </Pagina>
        </Shell>
    );
}
```

- [ ] **Step 4: Checar**

Run: `npm run typecheck && npm run lint && npm run test:unidade && npm run build`
Expected: sem erro.

- [ ] **Step 5: Conferir contra o mockup**

Browser com sessão de vendedor: `/dashboard` a 390 e 1440, lado a lado com os artboards "Meu dia". Confira:
- "Agora" vem antes do relatório.
- Não aparece "—/100". Dia sem nota mostra "Não teve nota".
- Todo KPI traz comparação ou legenda.
- A fila tem "Ver os outros N" quando passa de 5.
- No celular, a tabela vira lista.
- Nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard"
git commit -m "feat: Meu dia redesenhado — hoje primeiro, relatório com nome e data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Conversa e análise (`/conversas/[id]`)

**Files:**
- Create: `app/(app)/conversas/[id]/transcricao.tsx`
- Modify: `app/(app)/conversas/[id]/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `grifarConversa`, `type Pedaco`, `tomFaixa` de `@/lib/visual`; `NOMES_ETAPA`, `type Etapa` de `@/lib/derivacoes`; `aderenciaPercentual` de `@/lib/analise`; `esperaDoCliente`, `esperaEmTexto`, `semTelefone`, `telefoneBonito` de `@/lib/painel`; `contextoApp`, `dataCurta`, `horaCurta` de `@/lib/contexto-app`; `contestarAderencia` de `@/app/actions/gestao`; `bloquearContato` de `@/app/actions/conexao`.

- [ ] **Step 1: `app/(app)/conversas/[id]/transcricao.tsx`**

```tsx
import { Icone } from '@/components/ui';
import type { Pedaco } from '@/lib/visual';
import { horaCurta } from '@/lib/contexto-app';

export type Mensagem = {
    id: string; direcao: string; tipo: string; conteudo: string | null;
    transcricao: string | null; automatica: boolean; enviada_em: string;
};

export const textoDaMensagem = (m: Mensagem) =>
    m.tipo === 'audio' ? (m.transcricao ?? '') : (m.conteudo || `[${m.tipo}]`);

const FUSO = 'America/Sao_Paulo';
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

function Texto({ pedacos }: { pedacos: Pedaco[] }) {
    return (
        <>
            {pedacos.map((p, i) => p.grifo === null ? <span key={i}>{p.texto}</span> : (
                <mark key={i} className="rounded-[3px] bg-evidencia-sof px-0.5 text-inherit shadow-[inset_0_-2px_0_var(--color-evidencia)]">
                    {p.texto}<sup className="ml-0.5 text-[10.5px] font-bold not-italic text-atencao-texto">{p.grifo}</sup>
                </mark>
            ))}
        </>
    );
}

/** A conversa como o cliente viu, com os trechos que a análise citou grifados e numerados. */
export function Transcricao({ mensagens, grifos }: { mensagens: Mensagem[]; grifos: Pedaco[][] }) {
    return (
        <div className="flex flex-col gap-3">
            {mensagens.map((m, i) => {
                const novoDia = i === 0 || dia(mensagens[i - 1].enviada_em) !== dia(m.enviada_em);
                const saida = m.direcao === 'saida';
                const bolha = m.automatica
                    ? 'self-end border border-dashed border-linha-campo bg-superficie text-tinta-2 rounded-[13px]'
                    : saida
                        ? 'self-end bg-azul-sof rounded-[13px_13px_4px_13px]'
                        : 'self-start border border-linha bg-fundo rounded-[13px_13px_13px_4px]';
                return (
                    <div key={m.id} className="flex flex-col gap-3">
                        {novoDia && <span className="self-center rounded-full bg-superficie-2 px-3 py-1 text-xs text-tinta-2">{dia(m.enviada_em)}</span>}
                        <div className={`flex max-w-[82%] flex-col gap-1 lg:max-w-[76%] ${saida || m.automatica ? 'self-end items-end' : 'self-start items-start'}`}>
                            <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${bolha}`}>
                                {m.automatica && <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-tinta-3">Mensagem automática · fora da nota</span>}
                                {m.tipo === 'audio' && (
                                    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-tinta-2">
                                        <Icone nome="microfone" tamanho={14} />{m.transcricao ? 'Áudio transcrito' : 'Áudio sem transcrição'}
                                    </span>
                                )}
                                <span className={`whitespace-pre-wrap ${m.tipo === 'audio' ? 'italic' : ''}`}><Texto pedacos={grifos[i]} /></span>
                            </div>
                            <span className="text-[11.5px] text-tinta-3">{horaCurta(m.enviada_em)}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: `app/(app)/conversas/[id]/page.tsx`** (arquivo inteiro)

```tsx
import { notFound } from 'next/navigation';
import {
    Avatar, Barra, Botao, BotaoCopiar, BotaoLink, CabecalhoPagina, Cartao, Numero, Pagina, Selo, Shell,
} from '@/components/ui';
import { contextoApp, dataCurta } from '@/lib/contexto-app';
import { esperaDoCliente, esperaEmTexto, semTelefone, telefoneBonito } from '@/lib/painel';
import { aderenciaPercentual } from '@/lib/analise';
import { grifarConversa, type Tom } from '@/lib/visual';
import { NOMES_ETAPA, type Etapa } from '@/lib/derivacoes';
import { contestarAderencia } from '@/app/actions/gestao';
import { bloquearContato } from '@/app/actions/conexao';
import { Transcricao, textoDaMensagem, type Mensagem } from './transcricao';

export const dynamic = 'force-dynamic';

type Payload = {
    resumo?: string; proxima_acao?: string; script_sugerido?: string; evidencias?: { trecho: string; conclusao: string }[];
};
type Marcacao = { id: string; etapa: string; aplicavel: boolean; aplicado: string | null; justificativa: string };

const TIPO: Record<string, string> = { negociacao: 'Negociação', suporte: 'Suporte', social: 'Social' };
const STATUS: Record<string, { rotulo: string; tom: Tom }> = {
    em_andamento: { rotulo: 'Em andamento', tom: 'neutro' },
    venda_feita: { rotulo: 'Venda feita', tom: 'bom' },
    lead_frio: { rotulo: 'Lead frio', tom: 'neutro' },
    sem_resposta: { rotulo: 'Sem resposta', tom: 'risco' },
    perdida: { rotulo: 'Perdida', tom: 'risco' },
    encerrada: { rotulo: 'Encerrada', tom: 'neutro' },
};

function seloDaMarcacao(a: Marcacao): { rotulo: string; tom: Tom; tracejado?: boolean } {
    if (!a.aplicavel) return { rotulo: 'Não cabia', tom: 'neutro' };
    if (a.aplicado === 'sim') return { rotulo: '✓ Aplicou', tom: 'bom' };
    if (a.aplicado === 'parcial') return { rotulo: '◐ Em parte', tom: 'atencao' };
    if (a.aplicado === 'nao') return { rotulo: '✕ Não aplicou', tom: 'risco' };
    // Pode ter acontecido fora do WhatsApp (ligação, balcão): doc 7 §7.3.
    return { rotulo: 'Não dá pra ver aqui', tom: 'neutro', tracejado: true };
}

function Pontuacao({ rotulo, valor, invertida = false }: { rotulo: string; valor: number | null; invertida?: boolean }) {
    // Em "risco de perder", número alto é ruim.
    const tom: Tom = valor === null ? 'neutro' : invertida ? (valor >= 50 ? 'risco' : 'azul') : 'azul';
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[12.5px] text-tinta-2">
                <span>{rotulo}</span>
                <span className={`display num text-base font-bold ${tom === 'risco' ? 'text-risco-texto' : 'text-tinta'}`}>{valor ?? '—'}</span>
            </div>
            <Barra pct={valor} tom={tom} rotulo={rotulo} />
        </div>
    );
}

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { supabase, perfil } = await contextoApp();
    const { data: conversa } = await supabase.from('conversas')
        .select('id,cliente_nome,cliente_telefone,user_id,ultima_mensagem_em,profiles!conversas_user_id_fkey(nome),mensagens(id,direcao,tipo,conteudo,transcricao,automatica,enviada_em)')
        .eq('id', id).eq('bloqueada', false).maybeSingle();
    // Bloqueada some para todo mundo, inclusive por link direto.
    if (!conversa) notFound();
    const { data: analise } = await supabase.from('analises_conversa').select('*').eq('conversa_id', id)
        .order('data_ref', { ascending: false }).limit(1).maybeSingle();
    // O MEC do MESMO dia da análise exibida.
    const { data: aderencia } = analise
        ? await supabase.from('aderencia_conversa').select('id,etapa,aplicavel,aplicado,justificativa')
            .eq('conversa_id', id).eq('data_ref', analise.data_ref).order('etapa').returns<Marcacao[]>()
        : { data: [] as Marcacao[] };
    const { data: contestacoes } = aderencia?.length
        ? await supabase.from('aderencia_contestacoes').select('aderencia_id,veredito')
            .in('aderencia_id', aderencia.map((a) => a.id)).returns<{ aderencia_id: string; veredito: string }[]>()
        : { data: [] };
    const contestada = new Map((contestacoes ?? []).map((c) => [c.aderencia_id, c.veredito]));

    const mensagens = [...((conversa.mensagens ?? []) as Mensagem[])].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    const payload = (analise?.payload ?? {}) as Payload;
    const evidencias = payload.evidencias ?? [];
    const grifos = grifarConversa(mensagens.map(textoDaMensagem), evidencias.map((e) => e.trecho));
    const espera = esperaDoCliente(
        mensagens.map((m) => ({ direcao: m.direcao as 'entrada' | 'saida', automatica: m.automatica, enviada_em: m.enviada_em })),
        new Date(),
    );
    const vendedor = conversa.profiles as unknown as { nome: string } | null;
    const nome = conversa.cliente_nome || telefoneBonito(conversa.cliente_telefone);
    const podeContestar = ['gestor', 'supervisor', 'admin'].includes(perfil.role);
    const pct = aderencia?.length ? aderenciaPercentual(aderencia) : null;
    const cabiam = (aderencia ?? []).filter((a) => a.aplicavel && a.aplicado !== 'nao_verificavel' && a.aplicado !== null).length;
    const status = analise?.status ? STATUS[analise.status as string] : undefined;

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/conversas">
            <Pagina>
                <CabecalhoPagina
                    voltar={{ href: '/conversas', rotulo: 'Conversas' }}
                    titulo={<span className="flex items-center gap-3.5"><Avatar nome={conversa.cliente_nome} tamanho={48} />{nome}</span>}
                    sobre={[telefoneBonito(conversa.cliente_telefone), vendedor?.nome && `atendida por ${vendedor.nome}`, dataCurta(conversa.ultima_mensagem_em as string)].filter(Boolean).join(' · ')}
                    acoes={<>
                        {conversa.user_id === perfil.id && (
                            // Único caminho para bloquear contato `@lid`, que não tem número para digitar no Perfil.
                            <form action={bloquearContato}>
                                <input type="hidden" name="conversaId" value={conversa.id} />
                                <input type="hidden" name="motivo" value="Bloqueado pela conversa" />
                                <input type="hidden" name="voltar" value="conversas" />
                                <Botao variante="secundario" type="submit">Não é atendimento</Botao>
                            </form>
                        )}
                        {!semTelefone(conversa.cliente_telefone) && (
                            <BotaoLink href={`https://wa.me/${conversa.cliente_telefone.replace(/\D/g, '')}`} externo>Responder no WhatsApp</BotaoLink>
                        )}
                    </>} />

                <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                    <Cartao className="flex flex-col gap-4 lg:col-span-7">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-xs font-bold uppercase tracking-[0.09em] text-tinta-3">Conversa</h2>
                            {evidencias.length > 0 && (
                                <span className="flex items-center gap-2 text-[12.5px] text-tinta-2">
                                    <mark className="rounded-[3px] bg-evidencia-sof px-1 font-semibold text-inherit shadow-[inset_0_-2px_0_var(--color-evidencia)]">trecho</mark>
                                    citado pela análise
                                </span>
                            )}
                        </div>
                        <Transcricao mensagens={mensagens} grifos={grifos} />
                        {espera !== null && (
                            <p className="flex items-center gap-2.5 rounded-[10px] bg-risco-sof px-3.5 py-3 text-[13.5px] font-semibold text-risco-texto">
                                O cliente falou por último. Sem resposta há {esperaEmTexto(espera)}.
                            </p>
                        )}
                    </Cartao>

                    <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-5">
                        {!analise ? (
                            <Cartao variante="tracejado">
                                <h2 className="display text-lg font-bold">Análise ainda não disponível</h2>
                                <p className="mt-2 text-sm text-tinta-2">Esta conversa entra no próximo fechamento diário, às 00h30.</p>
                            </Cartao>
                        ) : (
                            <>
                                {payload.proxima_acao && (
                                    <Cartao variante="heroi" className="flex flex-col gap-3.5">
                                        <span className="text-xs font-bold uppercase tracking-[0.09em] text-white/75">Próxima ação</span>
                                        <p className="display text-[17px] font-bold leading-snug">{payload.proxima_acao}</p>
                                        {payload.script_sugerido && (
                                            <div className="flex flex-col gap-2.5 rounded-[10px] bg-superficie p-4 text-tinta">
                                                <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-azul">Responda assim</span>
                                                <p className="text-sm leading-relaxed">{payload.script_sugerido}</p>
                                                <BotaoCopiar texto={payload.script_sugerido} />
                                            </div>
                                        )}
                                    </Cartao>
                                )}

                                <Cartao className="flex flex-col gap-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {analise.tipo_conversa && <Selo tom="azul">{TIPO[analise.tipo_conversa as string] ?? String(analise.tipo_conversa)}</Selo>}
                                        {status && <Selo tom={status.tom}>{status.rotulo}</Selo>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                        <Pontuacao rotulo="Atendimento" valor={analise.score_atendimento ?? null} />
                                        <Pontuacao rotulo="Humor do cliente" valor={analise.sentiment ?? null} />
                                        <Pontuacao rotulo="Oportunidade" valor={analise.score_oportunidade ?? null} />
                                        <Pontuacao rotulo="Risco de perder" valor={analise.score_risco ?? null} invertida />
                                    </div>
                                    {payload.resumo && (
                                        <div className="border-t border-linha-2 pt-4">
                                            <h2 className="display text-base font-bold">O que aconteceu</h2>
                                            <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">{payload.resumo}</p>
                                        </div>
                                    )}
                                </Cartao>

                                {evidencias.length > 0 && (
                                    <Cartao className="flex flex-col gap-3">
                                        <h2 className="display text-base font-bold">Evidências</h2>
                                        <ol className="flex flex-col gap-3">
                                            {evidencias.map((e, i) => (
                                                <li key={i} className="flex items-start gap-3">
                                                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-evidencia-sof text-xs font-bold text-atencao-texto">{i + 1}</span>
                                                    <span className="flex flex-col gap-0.5">
                                                        <span className="text-[13.5px] italic">&ldquo;{e.trecho}&rdquo;</span>
                                                        <span className="text-[12.5px] text-tinta-2">{e.conclusao}</span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </Cartao>
                                )}

                                {!!aderencia?.length && (
                                    <Cartao className="flex flex-col">
                                        <div className="mb-2 flex items-baseline justify-between">
                                            <h2 className="display text-base font-bold">MEC nesta conversa</h2>
                                            <span className="text-[12.5px] text-tinta-3">
                                                <Numero valor={pct === null ? '—' : Math.round(pct)} unidade={pct === null ? undefined : '%'} tamanho="md" /> · {cabiam} etapas cabiam
                                            </span>
                                        </div>
                                        {aderencia.map((a) => {
                                            const selo = seloDaMarcacao(a);
                                            const veredito = contestada.get(a.id);
                                            return (
                                                <div key={a.id} className="flex flex-col gap-1.5 border-t border-linha-2 py-2.5">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[13.5px] font-semibold">{NOMES_ETAPA[a.etapa as Etapa] ?? a.etapa}</span>
                                                            <span className="text-xs text-tinta-3">{a.justificativa}</span>
                                                        </div>
                                                        <Selo tom={selo.tom} className={selo.tracejado ? 'border border-dashed border-linha-campo bg-superficie' : ''}>{selo.rotulo}</Selo>
                                                    </div>
                                                    {veredito && <span className="text-xs font-semibold text-azul">Contestada — {veredito === 'pendente' ? 'aguardando revisão' : veredito}</span>}
                                                    {podeContestar && veredito !== 'pendente' && (
                                                        <form action={contestarAderencia} className="flex gap-2">
                                                            <input type="hidden" name="aderenciaId" value={a.id} />
                                                            <label className="sr-only" htmlFor={`motivo-${a.id}`}>Motivo da contestação</label>
                                                            <input id={`motivo-${a.id}`} required name="motivo" placeholder="Contestar esta marcação…"
                                                                   className="min-h-9 min-w-0 flex-1 rounded-ctl border border-linha-campo px-2.5 text-xs" />
                                                            <Botao variante="texto" type="submit" className="min-h-9 text-xs">Enviar</Botao>
                                                        </form>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </Cartao>
                                )}
                            </>
                        )}
                    </aside>
                </div>
            </Pagina>
        </Shell>
    );
}
```

- [ ] **Step 3: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erro. Se o typecheck reclamar de `analise.*` (a linha vem sem tipo do `select('*')`), acrescente `.maybeSingle<{ data_ref: string; tipo_conversa: string | null; status: string | null; sentiment: number | null; score_atendimento: number | null; score_oportunidade: number | null; score_risco: number | null; payload: unknown }>()` na query.

- [ ] **Step 4: Conferir contra o mockup**

Browser: abra uma conversa analisada (a partir da lista `/conversas`) a 390 e 1440. Confira:
- trechos grifados e numerados que batem com a lista de evidências;
- mensagem automática tracejada;
- áudio com rótulo e transcrição em itálico;
- próxima ação no topo da coluna direita;
- "Copiar texto" funcionando;
- uma conversa sem análise mostra "Análise ainda não disponível".

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/conversas/[id]"
git commit -m "feat: conversa com evidências grifadas e próxima ação em destaque

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Minha equipe (`/equipe`) e Unidade (`/unidades/[id]`)

Uma tela, dois papéis (doc 5 §6 e §9).

**Files:**
- Create: `app/(app)/equipe/visao-unidade.tsx`
- Modify: `app/(app)/equipe/page.tsx` (arquivo inteiro), `app/(app)/unidades/[id]/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `contextoApp`, `dataHoje` de `@/lib/contexto-app`; `juntarPorDia`, `esperaDoCliente`, `type LinhaDia`, `type Msg` de `@/lib/painel`; `comQuemFalar`, `contarObjecoes`, `diaMenos`, `variacaoSemanal`, `type NotaDia` de `@/lib/derivacoes`; `tomFaixa`, `tomDelta`, `setaDoTom` de `@/lib/visual`.
- Produces: `VisaoUnidade({ supabase, unidadeId: string | null, nomeUnidade: string, titulo: string, voltar?: { href: Route; rotulo: string } })`, um async Server Component.

- [ ] **Step 1: `app/(app)/equipe/visao-unidade.tsx`**

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import {
    Alerta, Avatar, Barra, CabecalhoPagina, Cartao, Comparacao, Kpi, Numero, Pagina, Selo, Tabela, TEXTO,
} from '@/components/ui';
import { dataHoje, type contextoApp } from '@/lib/contexto-app';
import { esperaDoCliente, juntarPorDia, type LinhaDia, type Msg } from '@/lib/painel';
import { comQuemFalar, contarObjecoes, diaMenos, variacaoSemanal, type NotaDia } from '@/lib/derivacoes';
import { setaDoTom, tomDelta, tomFaixa } from '@/lib/visual';

type Supabase = Awaited<ReturnType<typeof contextoApp>>['supabase'];
type Diario = NotaDia & { user_id: string; leads_atendidos: number; conversoes_confirmadas: number; tempo_medio_resposta_s: number | null };

const DUAS_HORAS = 2 * 60 * 60 * 1000;
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const minutos = (s: number | string | null | undefined) => (s == null ? null : Math.round(Number(s) / 60));

/**
 * A equipe de uma loja: serve o gestor (`/equipe`) e o supervisor
 * (`/unidades/[id]`). `unidadeId` null é o escopo inteiro que a RLS deixa
 * ver — o comportamento de antes para supervisor e admin em /equipe.
 */
export async function VisaoUnidade({ supabase, unidadeId, nomeUnidade, titulo, voltar }: {
    supabase: Supabase; unidadeId: string | null; nomeUnidade: string; titulo: string; voltar?: { href: Route; rotulo: string };
}) {
    const hoje = dataHoje();
    const doisDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    let qPessoas = supabase.from('profiles').select('id,nome').eq('role', 'vendedor').eq('status', 'ativo').order('nome');
    let qDiarios = supabase.from('relatorios_diarios').select('user_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,tempo_medio_resposta_s')
        .gte('data_ref', diaMenos(hoje, 15)).order('data_ref', { ascending: false }).limit(1000);
    let qConexoes = supabase.from('vw_conexoes_status').select('user_id,status,ultimo_evento_em');
    let qPendentes = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    let qUnidade = supabase.from('relatorios_unidade')
        .select('unidade_id,data_ref,score_geral,leads_atendidos,conversoes_confirmadas,oportunidades_perdidas,tempo_medio_resposta_s,taxa_resposta')
        .order('data_ref', { ascending: false }).limit(60);
    let qAderencia = supabase.from('aderencia_diaria').select('user_id,data_ref,por_etapa').gte('data_ref', diaMenos(hoje, 7)).order('data_ref', { ascending: false });
    let qAnalises = supabase.from('analises_conversa').select('payload').gte('data_ref', diaMenos(hoje, 7)).limit(1000);
    // Só 48 h de conversa: a espera que importa ao gestor é a de agora.
    let qConversas = supabase.from('conversas').select('id,user_id,mensagens(direcao,automatica,enviada_em)')
        .gte('ultima_mensagem_em', doisDias).eq('bloqueada', false);
    if (unidadeId) {
        qPessoas = qPessoas.eq('unidade_id', unidadeId);
        qDiarios = qDiarios.eq('unidade_id', unidadeId);
        qConexoes = qConexoes.eq('unidade_id', unidadeId);
        qPendentes = qPendentes.eq('unidade_id', unidadeId);
        qUnidade = qUnidade.eq('unidade_id', unidadeId);
        qAderencia = qAderencia.eq('unidade_id', unidadeId);
        qAnalises = qAnalises.eq('unidade_id', unidadeId);
        qConversas = qConversas.eq('unidade_id', unidadeId);
    }

    const [{ data: pessoas }, { data: diarios }, { data: conexoes }, { count: pendentes }, { data: daUnidade }, { data: rede }, { data: aderencias }, { data: analises }, { data: conversas }] = await Promise.all([
        qPessoas.returns<{ id: string; nome: string }[]>(),
        qDiarios.returns<Diario[]>(),
        qConexoes.returns<{ user_id: string; status: string; ultimo_evento_em: string | null }[]>(),
        qPendentes,
        qUnidade.returns<LinhaDia[]>(),
        supabase.from('relatorios_rede').select('data_ref,score_geral').order('data_ref', { ascending: false }).limit(1).maybeSingle<{ data_ref: string; score_geral: number | null }>(),
        qAderencia.returns<{ user_id: string; data_ref: string; por_etapa: Record<string, number | null> | null }[]>(),
        qAnalises.returns<{ payload: unknown }[]>(),
        qConversas.returns<{ id: string; user_id: string; mensagens: Msg[] }[]>(),
    ]);

    const equipe = pessoas ?? [];
    // Os números do topo são de UM dia, o último fechado, juntando as unidades
    // do escopo (ponderado por leads) — a mesma regra do rollup.
    const dias = juntarPorDia(daUnidade ?? []);
    const ultimo = dias.at(-1) ?? null;
    const anterior = dias.at(-2) ?? null;
    const notaEquipe = ultimo?.score_geral == null ? null : Math.round(Number(ultimo.score_geral));
    const deltaNota = notaEquipe !== null && anterior?.score_geral != null ? notaEquipe - Math.round(Number(anterior.score_geral)) : null;

    const notas = new Map<string, Diario[]>();
    for (const d of diarios ?? []) notas.set(d.user_id, [...(notas.get(d.user_id) ?? []), d]);
    const etapas = new Map<string, Record<string, number | null> | null>();
    for (const a of aderencias ?? []) if (!etapas.has(a.user_id)) etapas.set(a.user_id, a.por_etapa);
    const conexao = new Map((conexoes ?? []).map((c) => [c.user_id, c]));

    const agora = new Date();
    const esperas = (conversas ?? []).map((c) => esperaDoCliente(c.mensagens, agora)).filter((e): e is number => e !== null);
    const foraDoAr = equipe.filter((p) => conexao.get(p.id)?.status !== 'conectada');
    const sugestoes = comQuemFalar(equipe, notas, etapas);
    const objecoes = contarObjecoes((analises ?? []).map((a) => a.payload));
    const maiorObjecao = objecoes[0]?.total ?? 1;

    const linhas = equipe
        .map((p) => {
            const doVendedor = notas.get(p.id) ?? [];
            const r = doVendedor[0];
            return { p, r, nota: r?.score_geral == null ? null : Math.round(Number(r.score_geral)), variacao: variacaoSemanal(doVendedor) };
        })
        .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));

    const leads = ultimo?.leads_atendidos ?? null;
    const conv = ultimo?.conversoes_confirmadas ?? null;
    const sobre = [nomeUnidade, `${equipe.length} vendedores`, ultimo && `relatório de ${diaMes(ultimo.data_ref)}`].filter(Boolean).join(' · ');

    return (
        <Pagina>
            <CabecalhoPagina voltar={voltar} sobre={sobre} titulo={titulo} />

            {(foraDoAr.length > 0 || esperas.length > 0 || !!pendentes) && (
                <section aria-label="Alertas" className="grid gap-4 lg:grid-cols-3">
                    {foraDoAr.length > 0 && (
                        <Alerta tom="risco" icone="wifi_off"
                                titulo={foraDoAr.length === 1 ? `WhatsApp de ${foraDoAr[0].nome.split(' ')[0]} fora do ar` : `${foraDoAr.length} números fora do ar`}>
                            Nada é capturado enquanto o número estiver desconectado.
                        </Alerta>
                    )}
                    {esperas.length > 0 && (
                        <Alerta tom="atencao" icone="relogio" titulo={`${esperas.length} clientes esperando`}
                                acao={{ href: '/conversas', rotulo: 'Ver lista' }}>
                            {esperas.filter((e) => e > DUAS_HORAS).length} deles há mais de 2 horas
                        </Alerta>
                    )}
                    {!!pendentes && (
                        <Alerta tom="azul" icone="cadastro" titulo={`${pendentes} cadastro${pendentes === 1 ? '' : 's'} aguardando`}
                                acao={{ href: '/aprovacoes', rotulo: 'Aprovar' }} />
                    )}
                </section>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
                <Kpi heroi rotulo="Nota da equipe" valor={notaEquipe ?? '—'}
                     legenda={[deltaNota !== null && `${setaDoTom(tomDelta(deltaNota, 'maior'))} ${Math.abs(deltaNota)}`, rede?.score_geral != null && `rede: ${Math.round(Number(rede.score_geral))}`].filter(Boolean).join(' · ') || undefined} />
                <Kpi rotulo="Leads atendidos" valor={leads ?? '—'} legenda={leads !== null && equipe.length ? `${Math.round(leads / equipe.length)} por vendedor` : undefined} />
                <Kpi rotulo="Conversões" valor={conv ?? '—'}
                     comparacao={conv !== null && anterior ? <Comparacao delta={conv - Number(anterior.conversoes_confirmadas ?? 0)}>{leads ? `${((conv / leads) * 100).toFixed(1).replace('.', ',')}% dos leads` : 'vs. o dia anterior'}</Comparacao> : undefined} />
                <Kpi rotulo="Perdidas" valor={ultimo?.oportunidades_perdidas ?? '—'}
                     comparacao={ultimo && anterior ? <Comparacao delta={Number(ultimo.oportunidades_perdidas ?? 0) - Number(anterior.oportunidades_perdidas ?? 0)} melhorQuando="menor">vs. o dia anterior</Comparacao> : undefined} />
                <Kpi rotulo="Resposta média" valor={minutos(ultimo?.tempo_medio_resposta_s) ?? '—'} unidade={ultimo?.tempo_medio_resposta_s == null ? undefined : ' min'} legenda="média ponderada por leads" />
            </section>

            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                <div className="lg:col-span-8">
                    <Tabela titulo="Vendedores" acao={<span className="text-[12.5px] text-tinta-3">ordenado por nota</span>}
                            vazio="Nenhum vendedor ativo neste escopo."
                            colunas={['Vendedor', 'Nota', 'Leads', 'Conv.', 'Resp.', '7 dias', 'Conexão']}
                            grade="minmax(0,2fr) minmax(0,1.6fr) repeat(3,minmax(0,0.7fr)) minmax(0,0.8fr) minmax(0,1.1fr)"
                            linhas={linhas.map(({ p, r, nota, variacao }) => {
                                const cx = conexao.get(p.id);
                                const ligado = cx?.status === 'conectada';
                                const resp = minutos(r?.tempo_medio_resposta_s);
                                const atrasado = r && ultimo && r.data_ref !== ultimo.data_ref;
                                const seloConexao = <Selo tom={ligado ? 'bom' : 'risco'} ponto>{ligado ? 'Conectado' : 'Fora do ar'}</Selo>;
                                return {
                                    chave: p.id,
                                    href: `/equipe/${p.id}`,
                                    atenuada: !r,
                                    celulas: [
                                        <span key="v" className="flex items-center gap-2.5 font-semibold"><Avatar nome={p.nome} tamanho={32} />{p.nome}</span>,
                                        nota === null
                                            ? <span key="n" className="text-[12.5px] italic">{r ? 'sem nota' : 'sem dado'}</span>
                                            : <span key="n" className="flex items-center gap-2.5"><span className="display num w-7 text-base font-bold">{nota}</span><span className="grow"><Barra pct={nota} tom={tomFaixa(nota, 50, 65)} rotulo={`Nota de ${p.nome}`} /></span>{atrasado && <span className="text-[11px] text-atencao-texto">{diaMes(r.data_ref)}</span>}</span>,
                                        <span key="l" className="num">{r?.leads_atendidos ?? '—'}</span>,
                                        <span key="c" className="num">{r?.conversoes_confirmadas ?? '—'}</span>,
                                        <span key="r" className={`num ${resp !== null && resp > 15 ? 'font-semibold text-atencao-texto' : ''}`}>{resp === null ? '—' : `${resp} min`}</span>,
                                        variacao === null ? <span key="t">—</span> : <span key="t" className={`font-semibold ${TEXTO[tomDelta(variacao, 'maior')]}`}>{setaDoTom(tomDelta(variacao, 'maior'))} {Math.abs(variacao)}</span>,
                                        <span key="x">{seloConexao}</span>,
                                    ],
                                    resumo: (
                                        <span className="flex items-center gap-3">
                                            <Avatar nome={p.nome} tamanho={32} />
                                            <span className="flex min-w-0 grow flex-col"><span className="truncate text-sm font-semibold">{p.nome}</span>
                                                <span className="text-xs text-tinta-3">{nota === null ? 'sem nota' : `nota ${nota}`}{variacao !== null && ` · ${setaDoTom(tomDelta(variacao, 'maior'))} ${Math.abs(variacao)} na semana`}</span></span>
                                            {seloConexao}
                                        </span>
                                    ),
                                };
                            })} />
                </div>

                <aside className="flex flex-col gap-5 lg:col-span-4">
                    <Cartao className="flex flex-col gap-3.5">
                        <div>
                            <h2 className="display text-lg font-bold">Com quem falar hoje</h2>
                            <p className="mt-1 text-[12.5px] text-tinta-3">Quem mais caiu na semana, e o porquê.</p>
                        </div>
                        {sugestoes.length === 0 ? (
                            <p className="text-[13px] text-tinta-2">Ninguém caiu na semana. Bom sinal.</p>
                        ) : sugestoes.map((s) => (
                            <div key={s.pessoa.id} className="flex flex-col gap-2 rounded-[10px] bg-fundo p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-bold">{s.pessoa.nome}</span>
                                    <span className="text-[12.5px] font-bold text-risco-texto">▼ {Math.abs(s.queda)} na semana</span>
                                </div>
                                <p className="text-[13px] leading-relaxed text-tinta-2">
                                    {s.etapaFraca ? `${s.etapaFraca.nome} em ${s.etapaFraca.pct}% no último relatório do MEC.` : 'Nota caindo sem uma etapa do MEC abaixo das outras.'}
                                </p>
                                <Link href={`/equipe/${s.pessoa.id}` as Route} className="flex min-h-9 items-center text-[13px] font-semibold text-azul">Abrir {s.pessoa.nome.split(' ')[0]} →</Link>
                            </div>
                        ))}
                    </Cartao>

                    <Cartao className="flex flex-col gap-3">
                        <h2 className="display text-lg font-bold">Objeções da semana</h2>
                        {objecoes.length === 0 ? (
                            <p className="text-[13px] text-tinta-3">Nenhuma objeção registrada nos últimos 7 dias.</p>
                        ) : objecoes.map((o) => (
                            <div key={o.objecao} className="grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-2.5 text-[13px]">
                                <span className="truncate">{o.objecao}</span>
                                <Barra pct={(o.total / maiorObjecao) * 100} rotulo={o.objecao} />
                                <Numero valor={o.total} tamanho="md" className="text-right text-sm" />
                            </div>
                        ))}
                    </Cartao>
                </aside>
            </div>
        </Pagina>
    );
}
```

- [ ] **Step 2: `app/(app)/equipe/page.tsx`** (arquivo inteiro)

```tsx
import { Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { VisaoUnidade } from './visao-unidade';

export const dynamic = 'force-dynamic';

export default async function EquipePage() {
    const { supabase, perfil } = await contextoApp();
    // Gestor vê a própria loja. Supervisor e admin veem o escopo da RLS, como antes.
    const unidadeId = perfil.role === 'gestor' ? perfil.unidade_id : null;
    const { count: pendentes } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/equipe" pendentes={pendentes ?? 0}>
            <VisaoUnidade supabase={supabase} unidadeId={unidadeId} nomeUnidade={perfil.unidade ?? 'Todas as lojas'} titulo="Minha equipe" />
        </Shell>
    );
}
```

- [ ] **Step 3: `app/(app)/unidades/[id]/page.tsx`** (arquivo inteiro)

```tsx
import { notFound } from 'next/navigation';
import { Shell } from '@/components/ui';
import { contextoApp } from '@/lib/contexto-app';
import { VisaoUnidade } from '../../equipe/visao-unidade';

export const dynamic = 'force-dynamic';

export default async function UnidadePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { supabase, perfil } = await contextoApp();
    const { data: u } = await supabase.from('unidades').select('id,nome,cidade,uf').eq('id', id)
        .maybeSingle<{ id: string; nome: string; cidade: string | null; uf: string | null }>();
    if (!u) notFound();
    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/unidades">
            <VisaoUnidade supabase={supabase} unidadeId={u.id} nomeUnidade={[u.cidade, u.uf].filter(Boolean).join(' · ') || 'Loja'}
                          titulo={u.nome} voltar={{ href: '/unidades', rotulo: 'Rede' }} />
        </Shell>
    );
}
```

- [ ] **Step 4: Checar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erro. `vw_conexoes_status` precisa aceitar `.eq('unidade_id', ...)`, e o `/unidades/[id]` atual já faz isso. `aderencia_diaria` e `analises_conversa` têm `unidade_id` (migrations 0001 e 0002).

- [ ] **Step 5: Conferir contra o mockup**

Browser com sessão de gestor (ou supervisor em `/unidades/<id>`) a 390 e 1440, contra o artboard "Minha equipe". Confira:
- os alertas só aparecem quando há o que avisar;
- a tabela vem ordenada por nota, e quem não tem dado fica atenuado com "sem dado";
- "Com quem falar hoje" traz a etapa fraca;
- as objeções vêm em barras;
- no celular, a tabela vira lista.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/equipe/visao-unidade.tsx" "app/(app)/equipe/page.tsx" "app/(app)/unidades/[id]/page.tsx"
git commit -m "feat: equipe e unidade na mesma tela, com alertas e com quem falar hoje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: A rede (`/unidades`)

**Files:**
- Modify: `app/(app)/unidades/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `paginar` de `@/lib/paginar` (mesmo uso de `app/(app)/mec/page.tsx`); `destaquesDaRede`, `serieSemanal`, `variacaoDoPeriodo`, `diaMenos` de `@/lib/derivacoes`; `tomDelta`, `setaDoTom` de `@/lib/visual`; componentes.

- [ ] **Step 1: Reescrever `app/(app)/unidades/page.tsx`**

```tsx
import { Alerta, CabecalhoPagina, Cartao, GraficoLinhas, Numero, Pagina, Segmentado, Selo, Shell, Sparkline, Tabela, TEXTO } from '@/components/ui';
import { contextoApp, dataCurta, dataHoje } from '@/lib/contexto-app';
import { paginar } from '@/lib/paginar';
import { destaquesDaRede, diaMenos, serieSemanal, variacaoDoPeriodo } from '@/lib/derivacoes';
import { setaDoTom, tomDelta, type Sentido } from '@/lib/visual';

export const dynamic = 'force-dynamic';

type LinhaUnidade = {
    unidade_id: string; data_ref: string; score_geral: number | null; vendedores_ativos: number;
    leads_atendidos: number; conversoes_confirmadas: number; tempo_medio_resposta_s: number | null;
};

const INDICADORES: Record<string, { rotulo: string; valor: (l: LinhaUnidade) => number | null; melhorQuando: Sentido; formato: (n: number) => string }> = {
    nota: { rotulo: 'Nota', valor: (l) => l.score_geral, melhorQuando: 'maior', formato: (n) => String(Math.round(n)) },
    conversao: { rotulo: 'Conversões', valor: (l) => l.conversoes_confirmadas, melhorQuando: 'maior', formato: (n) => `${Math.round(n)}/dia` },
    resposta: { rotulo: 'Resposta', valor: (l) => (l.tempo_medio_resposta_s == null ? null : l.tempo_medio_resposta_s / 60), melhorQuando: 'menor', formato: (n) => `${Math.round(n)} min` },
};
const JANELA = 30;
const mesCurto = (d: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)).replace('.', '');

export default async function RedePage({ searchParams }: { searchParams: Promise<{ indicador?: string }> }) {
    const { indicador: pedido } = await searchParams;
    const chave = pedido && pedido in INDICADORES ? pedido : 'nota';
    const ind = INDICADORES[chave];
    const { supabase, perfil } = await contextoApp();
    const hoje = dataHoje();

    const [{ data: rede }, { data: unidades }, linhas, { data: pessoas }, { data: conexoes }] = await Promise.all([
        supabase.from('relatorios_rede').select('data_ref,score_geral,vendedores_ativos').gte('data_ref', diaMenos(hoje, 2 * JANELA + 1))
            .order('data_ref', { ascending: false }).returns<{ data_ref: string; score_geral: number | null; vendedores_ativos: number }[]>(),
        supabase.from('unidades').select('id,nome,cidade,uf').eq('ativa', true).order('nome')
            .returns<{ id: string; nome: string; cidade: string | null; uf: string | null }[]>(),
        // 12 semanas de todas as lojas passa do corte de 1000 linhas do PostgREST.
        // Ordem estável (data + loja) para as páginas não se sobreporem.
        paginar<LinhaUnidade>((de, ate) => supabase.from('relatorios_unidade')
            .select('unidade_id,data_ref,score_geral,vendedores_ativos,leads_atendidos,conversoes_confirmadas,tempo_medio_resposta_s')
            .gte('data_ref', diaMenos(hoje, 7 * 12 + 1)).order('data_ref').order('unidade_id').range(de, ate)),
        supabase.from('profiles').select('id,nome,role,unidade_id').eq('status', 'ativo')
            .returns<{ id: string; nome: string; role: string; unidade_id: string | null }[]>(),
        supabase.from('vw_conexoes_status').select('user_id,unidade_id,status,ultimo_evento_em')
            .returns<{ user_id: string; unidade_id: string; status: string; ultimo_evento_em: string | null }[]>(),
    ]);

    const lojas = unidades ?? [];
    const todas = linhas ?? [];
    const serieRede = rede ?? [];
    const atual = serieRede[0] ?? null;
    const fim = todas.at(-1)?.data_ref ?? hoje;
    const nomeDe = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
    const gestorDe = new Map((pessoas ?? []).filter((p) => p.role === 'gestor' && p.unidade_id).map((p) => [p.unidade_id as string, p.nome]));
    const lojaDe = new Map(lojas.map((u) => [u.id, u.nome]));

    const { variacoes, subiu, caiu, semGestor } = destaquesDaRede(lojas, todas, ind.valor, ind.melhorQuando, fim, JANELA, new Set(gestorDe.keys()));
    const ultimaDe = new Map<string, LinhaUnidade>();
    for (const l of todas) ultimaDe.set(l.unidade_id, l);
    const ranking = lojas
        .map((u) => ({ u, l: ultimaDe.get(u.id) }))
        .sort((a, b) => Number(b.l?.score_geral ?? -1) - Number(a.l?.score_geral ?? -1));

    const variacaoRede = atual ? variacaoDoPeriodo(serieRede, (r) => r.score_geral, atual.data_ref, JANELA) : null;
    const cx = conexoes ?? [];
    const conectadas = cx.filter((c) => c.status === 'conectada').length;
    const fora = cx.filter((c) => c.status !== 'conectada');

    return (
        <Shell papel={perfil.role} nome={perfil.nome} unidade={perfil.unidade} atual="/unidades">
            <Pagina>
                <CabecalhoPagina titulo="A rede"
                                 sobre={[`${lojas.length} lojas`, atual && `${atual.vendedores_ativos} vendedores com movimento`, atual && `relatório de ${dataCurta(`${atual.data_ref}T12:00:00-03:00`)}`].filter(Boolean).join(' · ')}
                                 acoes={<Segmentado rotulo="Indicador" base="/unidades" param="indicador" atual={chave}
                                                    opcoes={Object.entries(INDICADORES).map(([valor, i]) => ({ valor, rotulo: i.rotulo }))} />} />

                <div className="grid gap-5 lg:grid-cols-12">
                    <Cartao variante="heroi" className="flex flex-col gap-3 lg:col-span-4">
                        <span className="text-[13px] text-white/75">Nota da rede · {JANELA} dias</span>
                        <span className="flex items-baseline gap-3">
                            <Numero valor={atual?.score_geral == null ? '—' : Math.round(Number(atual.score_geral))} tamanho="xl" />
                            {variacaoRede !== null && (
                                <span className="rounded-full bg-white/12 px-2.5 py-1 text-[13px] font-semibold">
                                    {setaDoTom(tomDelta(Math.round(variacaoRede), 'maior'))} {Math.abs(Math.round(variacaoRede))}
                                </span>
                            )}
                        </span>
                        {variacaoRede !== null && <span className="text-[13px] text-white/75">vs. os {JANELA} dias anteriores</span>}
                        <Sparkline invertida rotulo="Nota da rede nos últimos 60 dias" valores={[...serieRede].reverse().map((r) => (r.score_geral == null ? null : Number(r.score_geral)))} />
                    </Cartao>

                    <Cartao className="flex flex-col gap-3 lg:col-span-8">
                        <h2 className="display text-lg font-bold">{ind.rotulo} por loja, últimas 12 semanas</h2>
                        <GraficoLinhas rotulo={`${ind.rotulo} por loja nas últimas 12 semanas`} formato={ind.formato}
                                       rotulosX={[mesCurto(diaMenos(fim, 7 * 12)), mesCurto(fim)]}
                                       series={lojas.map((u) => ({
                                           id: u.id, nome: u.nome,
                                           valores: serieSemanal(todas.filter((l) => l.unidade_id === u.id), ind.valor, fim, 12),
                                           destaque: u.id === subiu?.id ? 'azul' : u.id === caiu?.id ? 'risco' : undefined,
                                       }))} />
                        <p className="text-[12.5px] text-tinta-3">Em destaque, a loja que mais melhorou e a que mais piorou em {JANELA} dias. As outras ficam em cinza.</p>
                    </Cartao>
                </div>

                <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                    <div className="lg:col-span-8">
                        <Tabela titulo="Ranking das lojas" acao={<span className="text-[12.5px] text-tinta-3">clique para abrir a loja</span>}
                                vazio="Nenhuma loja ativa."
                                colunas={['#', 'Loja', 'Gestor', 'Nota', 'Vend.', 'Leads', 'Conv.', 'Resp.', `${JANELA} dias`]}
                                grade="28px minmax(0,1.6fr) minmax(0,1.5fr) repeat(5,minmax(0,0.7fr)) minmax(0,0.8fr)"
                                linhas={ranking.map(({ u, l }, i) => {
                                    const v = variacoes.get(u.id) ?? null;
                                    const tom = tomDelta(v === null ? null : Math.round(v), ind.melhorQuando);
                                    const nota = l?.score_geral == null ? null : Math.round(Number(l.score_geral));
                                    const resp = l?.tempo_medio_resposta_s == null ? null : Math.round(Number(l.tempo_medio_resposta_s) / 60);
                                    const gestor = gestorDe.get(u.id);
                                    const variacao = v === null ? <span key="v">—</span> : <span key="v" className={`font-semibold ${TEXTO[tom]}`}>{setaDoTom(tom)} {ind.formato(Math.abs(v))}</span>;
                                    return {
                                        chave: u.id,
                                        href: `/unidades/${u.id}`,
                                        atenuada: !l,
                                        celulas: [
                                            <span key="p" className="display font-bold text-tinta-3">{i + 1}</span>,
                                            <span key="n" className="font-semibold">{u.nome}</span>,
                                            gestor ? <span key="g" className="text-tinta-2">{gestor}</span> : <Selo key="g" tom="atencao">sem gestor</Selo>,
                                            <span key="s" className="display num text-base font-bold">{nota ?? '—'}</span>,
                                            <span key="d" className="num">{l?.vendedores_ativos ?? '—'}</span>,
                                            <span key="l" className="num">{l?.leads_atendidos ?? '—'}</span>,
                                            <span key="c" className="num">{l?.conversoes_confirmadas ?? '—'}</span>,
                                            <span key="r" className={`num ${resp !== null && resp > 15 ? 'font-semibold text-atencao-texto' : ''}`}>{resp === null ? '—' : `${resp} min`}</span>,
                                            variacao,
                                        ],
                                        resumo: (
                                            <span className="flex items-center gap-3">
                                                <span className="display w-5 font-bold text-tinta-3">{i + 1}</span>
                                                <span className="flex min-w-0 grow flex-col"><span className="truncate text-sm font-semibold">{u.nome}</span>
                                                    <span className="text-xs text-tinta-3">{gestor ?? 'sem gestor'} · nota {nota ?? '—'}</span></span>
                                                {variacao}
                                            </span>
                                        ),
                                    };
                                })} />
                    </div>

                    <aside className="flex flex-col gap-5 lg:col-span-4">
                        <Cartao className="flex flex-col gap-3">
                            <h2 className="display text-lg font-bold">Onde você precisa entrar</h2>
                            {!caiu && semGestor.length === 0 && <p className="text-[13px] text-tinta-2">Nenhuma loja pedindo atenção agora.</p>}
                            {caiu && (
                                <Alerta tom="risco" icone="tendencia" titulo={`${caiu.nome}: ${ind.rotulo.toLowerCase()} ${setaDoTom('risco')} ${ind.formato(Math.abs(caiu.variacao))}`}
                                        acao={{ href: `/unidades/${caiu.id}`, rotulo: 'Abrir' }}>
                                    A maior piora da rede nos últimos {JANELA} dias.
                                </Alerta>
                            )}
                            {semGestor.map((u) => (
                                <Alerta key={u.id} tom="atencao" icone="equipe" titulo={`${u.nome} sem gestor`} acao={{ href: `/unidades/${u.id}`, rotulo: 'Abrir' }}>
                                    Ninguém da loja aprova cadastro nem olha os alertas de lá.
                                </Alerta>
                            ))}
                        </Cartao>

                        <Cartao className="flex flex-col gap-3">
                            <div className="flex items-baseline justify-between">
                                <h2 className="display text-lg font-bold">Conexões</h2>
                                <Numero valor={conectadas} unidade={`/${cx.length}`} tamanho="md" />
                            </div>
                            <div className="flex h-2 overflow-hidden rounded-full bg-linha-2" role="img" aria-label={`${conectadas} de ${cx.length} números conectados`}>
                                <span className="bg-azul" style={{ width: `${cx.length ? (conectadas / cx.length) * 100 : 0}%` }} />
                                <span className="bg-risco" style={{ width: `${cx.length ? (fora.length / cx.length) * 100 : 0}%` }} />
                            </div>
                            {fora.length === 0 ? <p className="text-[13px] text-tinta-2">Todos os números conectados.</p> : fora.slice(0, 6).map((c) => (
                                <div key={c.user_id} className="flex items-center justify-between gap-2 border-t border-linha-2 pt-2 text-[13px]">
                                    <span className="min-w-0 truncate"><strong>{nomeDe.get(c.user_id) ?? 'Vendedor'}</strong> <span className="text-tinta-3">· {lojaDe.get(c.unidade_id) ?? ''}</span></span>
                                    <span className="shrink-0 font-semibold text-risco-texto">{c.ultimo_evento_em ? `desde ${dataCurta(c.ultimo_evento_em)}` : 'nunca conectou'}</span>
                                </div>
                            ))}
                        </Cartao>
                    </aside>
                </div>
            </Pagina>
        </Shell>
    );
}
```

- [ ] **Step 2: Checar**

Run: `npm run typecheck && npm run lint && npm run test:unidade && npm run build`
Expected: sem erro.

- [ ] **Step 3: Conferir contra o mockup**

Browser com sessão de supervisor: `/unidades`, `/unidades?indicador=resposta` e `?indicador=conversao`, a 390 e 1440. Confira:
- só duas linhas coloridas no gráfico, com rótulos legíveis;
- no ranking, "sem gestor" aparece em âmbar;
- "Onde você precisa entrar" cita a maior piora;
- no celular, o ranking vira lista.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/unidades/page.tsx"
git commit -m "feat: rede com gráfico por loja, destaques e onde entrar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Fechamento das fases 0 a 2

- [ ] **Step 1: Suíte inteira**

Run: `npm run typecheck && npm run lint && npm run test:unidade && npm run build`
Expected: tudo verde. Cole a saída no relatório final.

- [ ] **Step 2: Nenhum hex e nenhum token antigo nas telas migradas**

```bash
grep -nE "#[0-9A-Fa-f]{3,6}\b" components/ui/*.tsx "app/(app)/dashboard"/*.tsx "app/(app)/conversas/[id]"/*.tsx "app/(app)/equipe"/*.tsx "app/(app)/unidades"/page.tsx "app/(app)/unidades/[id]"/page.tsx
grep -nE "(petroleo|papel|ocre|dourado|vermelho|ambar|verde-sof|text-verde|bg-verde\b)" components/ui/*.tsx "app/(app)/dashboard"/*.tsx "app/(app)/conversas/[id]"/*.tsx "app/(app)/equipe"/*.tsx "app/(app)/unidades"/page.tsx "app/(app)/unidades/[id]"/page.tsx
```
Expected: nenhuma linha nos dois.

- [ ] **Step 3: Rodada visual final**

Com sessão aberta pelo usuário, as quatro telas a 390 e 1440, e mais uma tela antiga (`/perfil`), para confirmar que os apelidos seguram o visual. Screenshots anexadas ao relatório.

- [ ] **Step 4: Parar e reportar**

Não abrir PR sem o usuário pedir. Reporte: commits, o que foi verificado e o que ficou para o plano das fases 3 a 5.
```
