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

## Financial Model Guardrails
- Keep current model assumptions unless the user asks to change the business logic.
- Automatic financing uses nominal monthly interest plus the default CET margin to infer an effective rate when `parcelaReal` is empty.
- Negative cash is intentionally treated as non-yielding balance, not compounding debt.
- The comparison picks the best old car by final patrimony, while the aporte reference uses the cheapest old-car monthly cost as the conservative baseline.

## Change Scope
- Prefer minimal edits that preserve the current visual language and single-file architecture.
- Do not introduce frameworks, bundlers, or dependencies unless explicitly requested.