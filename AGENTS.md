# Project Guidelines

## Project Shape
- This workspace is a single-file static web app. Keep primary changes in `calculadora-carro-antigo-vs-novo_1.html` unless the user explicitly asks to split files.
- HTML, CSS, and JavaScript live inline in the same file. There is no build step, package manager, or automated test suite in this repo.
- Preserve the existing language and domain conventions: UI copy is in pt-BR, currency is BRL, and financial inputs assume Brazilian monthly-rate notation.

## Run And Verify
- Run by opening `calculadora-carro-antigo-vs-novo_1.html` in a browser.
- After UI or calculation changes, manually verify at least: global inputs update results, adding/removing old cars works, adding/removing financings works, switching active financing updates metrics, and horizon changes refresh the chart and summary.

## Editing Conventions
- Follow the current structure: small helper functions, local state arrays (`cars`, `oldCars`), and imperative rendering through `renderAll()` plus `recalcular()`.
- Treat `data-field`, `data-action`, element ids, and query selectors as coupled to the logic. If markup changes, update the corresponding event binding and recalculation code in the same edit.
- `renderAll()` rebuilds parts of the DOM. Reattach listeners after re-rendering instead of assuming existing nodes persist.
- Any user-provided text inserted via `innerHTML` must continue to go through `escapeHTML()`.

## UI & Visual Language
- The app has a shared visual language — reuse the existing primitives before inventing section-specific styles. The car-card fields are the reference implementation for every form row.
- Primitives: `.field` (label left, input right) for single inputs; `.field.paired-field` with `.paired-inputs` + `.paired-slot` + `.paired-slot-label` for linked monthly/annual pairs; `.input-wrap` wrapping every numeric input with optional `.prefix` / `.suffix`; `.section-label` as the small monospace header grouping fields within a column; two-column body grids (`.car-body-grid`, `.globals-grid`) that collapse to one column on narrow viewports.
- Do **not** patch layout issues with per-field `width: calc(...)`, `margin-left: auto`, or by overriding `.field` to stack label-on-top. If a section looks off, it's usually because it diverged from the primitives above — realign it to them. If you need a different input column width, do it via `grid-template-columns: 1fr minmax(Xpx, Ypx)` on `.field`, keeping the label-left / input-right axis.
- Dashed `border-bottom: 1px dashed var(--line)` between fields in a column is the standard rhythm separator; use `:last-child { border-bottom: none }` to suppress the trailing line.
- Stick to existing responsive breakpoints (roughly 1120 / 980-900 / 720 / 560 px) rather than adding new ones.

## Financial Model Guardrails
- Keep current model assumptions unless the user asks to change the business logic.
- Automatic financing uses nominal monthly interest plus the default CET margin to infer an effective rate when `parcelaReal` is empty.
- Negative cash is intentionally treated as non-yielding balance, not compounding debt.
- The comparison picks the best old car by final patrimony, while the aporte reference uses the cheapest old-car monthly cost as the conservative baseline.

## Change Scope
- Prefer minimal edits that preserve the current visual language and single-file architecture.
- Do not introduce frameworks, bundlers, or dependencies unless explicitly requested.