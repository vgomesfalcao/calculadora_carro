# CLAUDE.md

This file provides guidance for working in this repository.

## Project shape

Static web app with no build step, package manager, or automated test suite.

Current file layout:

- [index.html](index.html) is the document shell and main DOM structure.
- [css/styles.css](css/styles.css) contains the app styles.
- [js/app.js](js/app.js) contains the application logic.

Preserve the existing domain conventions: UI copy in pt-BR, currency in BRL, and financial inputs using Brazilian monthly-rate notation.

## Run and verify

- Run by opening [index.html](index.html) directly in a browser, or use a simple local server if needed for manual validation.
- After UI or calculation changes, manually verify at minimum:
	- global inputs update results
	- adding/removing old cars works
	- adding/removing new cars works
	- adding/removing financings works
	- switching the active financing updates the visible metrics
	- toggling Price vs SAC behaves correctly
	- horizon changes refresh the chart and summary
- Persistence is local: state is restored from localStorage, with support for embedded state through the `embedded_state` script tag when present.

## Architecture

The app is imperative and DOM-driven. The main flow is:

- `renderAll()` rebuilds the dynamic card sections from `oldCars` and `cars`, then calls `recalcular()`.
- `recalcular()` reads global and per-card values from the DOM, runs the financial simulations, updates the chart and ranking, and persists state.

State model:

- `cars`: new-car scenarios. Each item has `financings: []` and `activeFinancingId`.
- `oldCars`: keep-the-current-car scenarios.
- Globals such as `horizonte`, `capital_inicial`, `rendimento_mes`, `km_mes`, `combustivel_preco`, and `aporte_mensal` are read directly from the DOM rather than mirrored into a separate central object.
- Persistence uses `localStorage['calculadora-carro-state-v1']`.

Important rendering rule:

- `renderAll()` rebuilds parts of the DOM. If you change markup in render functions, reattach listeners in the same render path instead of assuming existing nodes persist.

## Financial model guardrails

Keep current model assumptions unless the user explicitly asks to change the business logic.

- Automatic financing uses nominal monthly interest plus the default CET margin to infer an effective rate when `parcelaReal` is empty.
- Negative cash is intentionally treated as non-yielding balance, not compounding debt.
- The comparison picks the best old car by final patrimony, while the aporte reference uses the cheapest old-car monthly cost as the conservative baseline.
- Price and SAC simulations, effective-rate inference, and patrimony/depreciation simulators should stay behaviorally consistent unless a requested change explicitly targets them.

## Editing conventions

- Keep changes minimal and consistent with the current split architecture.
- Do not introduce frameworks, bundlers, npm, or extra dependencies unless explicitly requested.
- Follow the existing structure: small helper functions, local state arrays (`cars`, `oldCars`), and imperative rendering through `renderAll()` and `recalcular()`.
- Treat `data-field`, `data-action`, element ids, and query selectors as coupled to the logic. If markup changes, update the corresponding read/bind code in the same edit.
- Any user-provided text inserted via `innerHTML` must continue to go through `escapeHTML()`.
- For numeric inputs, prefer the existing locale-aware helpers such as `parseLocaleNumber`, `formatNumericInput`, `normalizeNumericInputs`, `readNumericValue`, and `readIntegerValue` instead of raw `parseFloat` on `.value`.

## UI and visual language

The app has a shared visual language. Reuse the existing primitives before inventing section-specific styles. The car-card fields are the reference implementation for form rows.

Core primitives:

- `.field`: label on the left, input on the right, for single-input rows.
- `.field.paired-field` with `.paired-inputs`, `.paired-slot`, and `.paired-slot-label`: for linked monthly/annual pairs.
- `.input-wrap`: wraps numeric inputs, optionally with `.prefix` and `.suffix`.
- `.section-label`: small monospace header that groups fields within a column.
- `.car-body-grid` and `.globals-grid`: two-column body grids that collapse on narrower viewports.

Avoid these layout anti-patterns:

- Do not patch alignment with per-field `width: calc(...)`, `margin-left: auto`, or section-specific hacks when the shared primitives should be used instead.
- Do not override `.field` to stack label and input vertically across a section. If a wider input column is needed, use `grid-template-columns: 1fr minmax(Xpx, Ypx)` while keeping the label-left/input-right axis.
- Keep the dashed field separators and suppress the trailing one with `:last-child { border-bottom: none; }` where needed.
- Stick to the existing responsive breakpoints around 1120, 980-900, 720, and 560 px rather than introducing new ones casually.

## Change scope

- Prefer minimal edits that preserve the current visual language and architecture.
- If a section looks off, first realign it to the shared primitives instead of creating one-off CSS.
- Keep documentation in this file only; do not reintroduce a separate AGENTS.md.
