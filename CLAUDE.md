# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Single-file static web app: **all** HTML, CSS, and JavaScript live inline in [index.html](index.html) (~3.2k lines). There is no build step, no package manager, no test runner, and no dependencies beyond Google Fonts loaded via CDN.

> Note: [AGENTS.md](AGENTS.md) still refers to `calculadora-carro-antigo-vs-novo_1.html` — the actual entry point was renamed to `index.html`. When applying guidance from AGENTS.md, mentally substitute the current filename.

## Run and verify

- **Run**: open [index.html](index.html) directly in a browser (no server required).
- **Verify after changes**: there are no automated tests, so manually exercise at minimum — global inputs update results, add/remove an antigo (old car), add/remove a novo (new car), add/remove a financing inside a novo, switch the active financing, toggle Price vs SAC, change the horizonte (horizon), and confirm the chart + ranking table refresh.
- **Reproducible state**: the "Baixar HTML preenchido" button serializes current state into the `<script id="embedded_state">` tag of a downloaded copy. Opening that copy re-hydrates the same scenario — useful for reproducing bugs the user reports.

## Architecture

Imperative DOM rendering driven by two functions at the core:

- **`renderAll()`** ([index.html:2692](index.html#L2692)) — wipes `#old_cars_container` and `#cars_container`, rebuilds them from the `oldCars` and `cars` arrays via `renderOldCar` / `renderCar` / `renderFinancing`, then calls `recalcular()`. Because DOM nodes are rebuilt, **event listeners must be reattached inside the render functions** — do not assume nodes persist across renders.
- **`recalcular()`** ([index.html:2706](index.html#L2706)) — reads globals + per-card inputs from the DOM, runs simulations, updates the chart (`renderChart`) and ranking table (`renderLegendAndRanking`), and calls `saveState()`.

State model:

- **`cars`**: new cars. Each has `financings: []` (multiple quotes per car) and `activeFinancingId`. Create via `createCar()` ([index.html:1929](index.html#L1929)).
- **`oldCars`**: current-car scenarios. Create via `createOldCar()` ([index.html:1900](index.html#L1900)).
- **Globals**: `horizonte`, `capital_inicial`, `rendimento_mes`, `km_mes`, `combustivel_preco`, `aporte_mensal` are read straight from DOM ids — they are not mirrored into a JS object outside of `recalcular()`.
- **Persistence**: `saveState()` writes to `localStorage['calculadora-carro-state-v1']` on every `recalcular`. `loadState()` prefers the embedded `<script id="embedded_state">` payload (for downloaded HTMLs) and falls back to localStorage, picking whichever has the newer `savedAt` timestamp.

Financial engine:

- **`calcPrice` / `simularFinanciamento`** ([index.html:1970](index.html#L1970), [index.html:1976](index.html#L1976)) — Price and SAC tables with optional extra amortization (modes: reduce term vs reduce installment).
- **`taxaEfetivaParaParcela` / `taxaSacParaPrimeiraParcela` / `resolverTaxaEfetiva`** ([index.html:1474](index.html#L1474)) — bisection to back out the effective monthly rate when the user supplies a real installment value. If `parcelaReal` is empty, the app falls back to `jurosNominal × (1 + CET_PADRAO)` where `CET_PADRAO = 0.10` ([index.html:1469](index.html#L1469)) is a flat 10% margin standing in for IOF + fees + insurance.
- **Patrimony simulators**: `simularPatrimonioAntigo`, `simularPatrimonioCarroNovo`, `simularPatrimonioCarroVista` ([index.html:2117](index.html#L2117) onward) compound the invested balance month by month and depreciate vehicles via `valorCarroNoMes` / `valorAntigoNoMes`.

Model invariants to preserve unless the user asks otherwise:

- **Negative cash is non-yielding**, not compounding debt — don't "fix" this by applying interest to deficits.
- The comparison picks the **best old car by final patrimony**, but the `aporteMensal` reference uses the **cheapest old-car monthly cost** as the conservative baseline (see the two-pass logic in `recalcular`).
- UI copy is **pt-BR**, currency is **BRL** (`fmtBRL`, `fmtBRL2`), and interest fields use Brazilian monthly-rate notation.

## Editing conventions

- Markup and logic are coupled through `data-field`, `data-action`, and element ids / query selectors. If you rename or restructure markup in a `render*` function, update the matching read/bind code in the same edit.
- Any user-provided string inserted via `innerHTML` must go through `escapeHTML()` ([index.html:1458](index.html#L1458)).
- Numeric inputs use Brazilian locale formatting via `parseLocaleNumber` / `formatNumericInput` / `normalizeNumericInputs`. Reach for `readNumericValue` / `readIntegerValue` rather than `parseFloat` on raw `.value`.
- Prefer minimal edits that preserve the single-file architecture. Do not introduce frameworks, bundlers, npm, or split files unless explicitly requested.

## Visual language (layout & styling)

The app has a **shared visual language**. When fixing or adding UI, reuse existing classes first — don't invent section-specific width/margin overrides. The car-card fields ([index.html:2364-2462](index.html#L2364-L2462)) are the reference implementation; if a section looks "out of pattern," it's usually because it diverged from these primitives.

Core building blocks:

- **`.field`** — default row: `grid-template-columns: 1fr auto` (label left, input right, same row). Use for any single-input row.
- **`.field.paired-field`** — for linked monthly/annual inputs: label left, a `.paired-inputs` grid of two `.paired-slot`s on the right (each with its own `.paired-slot-label` + `.input-wrap`). Used by "Rendimento renda fixa", "Rodagem", "Seguro", and the revisão/cuidado field.
- **`.input-wrap`** — wraps every numeric input, optionally with `.prefix` (e.g., `R$`) and/or `.suffix` (e.g., `% a.m.`, `km/L`) in JetBrains Mono. Never put a bare `<input type="number">` outside an `.input-wrap`.
- **`.section-label`** — small monospace header grouping fields within a card (e.g., "Veículo" / "Operacional" in car cards, "Caixa & despesas" / "Taxas & uso" in globals). Use one per column.
- **Two-column body grid** — cards with many fields use a 2-column grid (`.car-body-grid`, `.globals-grid`) that collapses to 1 column below ~900-980px.

Anti-patterns to avoid:

- Don't set per-field `width: calc(...)` or `margin-left: auto` to reposition inputs. If the default `.field` row looks wrong, the fix is usually to use the correct `.field` / `.paired-field` / `.input-wrap` primitives, not to override widths.
- Don't override `.field`'s `grid-template-columns` to stack label-on-top-of-input section-wide. If you need a different input column width, constrain it with `grid-template-columns: 1fr minmax(Xpx, Ypx)` — keep the label-left / input-right axis.
- Dashed `border-bottom: 1px dashed var(--line)` between fields in a column is the standard rhythm separator (see globals `.field` and the `.section-label` dashed underline). Use `:last-child { border-bottom: none }` to avoid a trailing line.

Responsive breakpoints in use: 1120px (tighten spacing), 980-900px (collapse 2-col to 1-col), 720px (collapse paired inputs), 560px (fallback for very narrow). Match these rather than introducing new ones.
