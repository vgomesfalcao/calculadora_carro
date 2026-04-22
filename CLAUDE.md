# CLAUDE.md

<!-- Maintainer note: keep this file concise and project-wide. If it grows past ~200 lines or starts collecting path-specific rules, move those rules into .claude/rules/ or a nested CLAUDE.md. -->

## Purpose

This file contains project-wide instructions for Claude Code.

Only keep information here that should apply in every session:

- project structure
- core workflows
- stable architecture rules
- non-negotiable product and domain conventions

Do not use this file for temporary task notes or personal preferences. Put personal, uncommitted preferences in `CLAUDE.local.md`.

## Project snapshot

This repository is a static web app with no build step, package manager, or automated test suite.

- [index.html](index.html): document shell and main DOM structure
- [css/styles.css](css/styles.css): app styles
- [js/app.js](js/app.js): app logic

Keep UI copy in pt-BR, money in BRL, and financial rates in Brazilian monthly-rate notation.

## Working agreement

- Prefer minimal edits that preserve the current architecture and visual language.
- Do not introduce frameworks, bundlers, npm, or new dependencies unless explicitly requested.
- Treat this as a DOM-driven app, not as a componentized framework app.
- When markup changes, update the corresponding selectors, bindings, and DOM reads in the same edit.
- Any user-provided string rendered with `innerHTML` must still pass through `escapeHTML()`.
- For numeric inputs, prefer `parseLocaleNumber`, `formatNumericInput`, `normalizeNumericInputs`, `readNumericValue`, and `readIntegerValue` over raw parsing from `.value`.

## Core architecture

The main execution flow is:

- `renderAll()` rebuilds dynamic card sections from `oldCars` and `cars`, then calls `recalcular()`.
- `recalcular()` reads globals and per-card values from the DOM, runs simulations, updates chart and ranking output, and persists state.

State model:

- `cars`: new-car scenarios, each with `financings: []` and `activeFinancingId`
- `oldCars`: keep-the-current-car scenarios
- globals are read directly from DOM ids instead of a central in-memory state object
- persistence key: `localStorage['calculadora-carro-state-v1']`

Critical rule:

- `renderAll()` rebuilds DOM sections. If markup is regenerated, listeners must be reattached in the same render path.

## Financial guardrails

Preserve existing business behavior unless the request explicitly changes the model.

- Automatic financing uses nominal monthly interest plus the default CET margin when `parcelaReal` is empty.
- Negative cash is intentionally non-yielding and must not be treated as debt compounding.
- The comparison uses the best old-car scenario by final patrimony.
- The aporte reference uses the cheapest old-car monthly cost as the conservative baseline.
- Price, SAC, effective-rate inference, and patrimony/depreciation behavior should remain consistent unless directly targeted.

## UI guardrails

Reuse the existing design primitives before creating section-specific CSS.

- `.field`: single row with label left and input right
- `.field.paired-field`, `.paired-inputs`, `.paired-slot`, `.paired-slot-label`: linked monthly/annual rows
- `.input-wrap`: numeric input wrapper with optional `.prefix` and `.suffix`
- `.section-label`: monospace subheader for grouped fields
- `.car-body-grid` and `.globals-grid`: two-column grids that collapse on narrow screens

Avoid these anti-patterns:

- per-field `width: calc(...)` fixes
- `margin-left: auto` hacks for alignment
- overriding `.field` to stack labels above inputs across a section
- ad hoc breakpoints when existing breakpoints around 1120, 980-900, 720, and 560 px already cover the layout

If a section looks wrong, first realign it with shared primitives instead of adding one-off CSS.

## Run and verify

Run by opening [index.html](index.html) directly in a browser, or by using a simple local server for manual checks.

After UI or calculation changes, manually verify at minimum:

- global inputs update results
- adding and removing old cars works
- adding and removing new cars works
- adding and removing financings works
- switching the active financing updates visible metrics
- toggling Price vs SAC behaves correctly
- changing the horizon refreshes chart and summary

Persistence behavior:

- restore from localStorage
- support embedded state through the `embedded_state` script tag when present

## Maintaining this file

Keep this file short, specific, and repo-wide.

- If guidance only applies to one directory or file type, move it to `.claude/rules/` or a nested `CLAUDE.md`.
- If guidance is personal and should not be committed, use `CLAUDE.local.md`.
- If the same correction happens repeatedly and applies across sessions, add it here.
- Do not reintroduce `AGENTS.md`; this repository uses `CLAUDE.md` as the shared instruction file.
