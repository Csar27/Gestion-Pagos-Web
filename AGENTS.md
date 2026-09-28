# AGENTS.md

## Project

Static single-page app (vanilla HTML/CSS/JS) for personal payment tracking in COP. No framework, no bundler, no `package.json`.

## Commands

There is no build, test, lint, or typecheck tooling. To run locally:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Quick syntax check after editing JS:

```bash
node --check assets/js/script.js
```

Responsive audit (root of the repo, same server as the app):

```bash
python -m http.server 8000
# open http://localhost:8000/responsive-test.html
```

`responsive-test.html` embeds the app in a same-origin iframe, lets you resize it to
**320 / 375 / 414 / 600 / 768 / 834 / 1024 / 1280 / 1440 / 1920**, scales it to fit the window,
and runs an audit per width: elements outside the viewport, `document.scrollWidth` and
interactive targets under 38px (touch range). Hit **▶ medir todo** for the full sweep.
The app authenticates inside the iframe, so the audit runs against the real, logged-in views.

Docker build (must run from the **parent** directory — the Dockerfile copies `Gestión Pagos/`):

```bash
docker build -f "Gestión Pagos/Dockerfile" -t cartera-pagos .
docker run --rm -p 8080:80 cartera-pagos
```

## Architecture

- **Single JS file**: all app logic lives in `assets/js/script.js` (~1.7k lines, loaded last in `index.html`). No modules, no imports, no `defer`.
- **Firebase via CDN**: compat libraries loaded from `gstatic.com` (v10.12.2) in `index.html`, plus `config/firebase-config.js`. Not installed via npm.
- **localStorage-first**: payments, categories, theme, and page size persist in `localStorage`; Firestore acts as a per-user sync layer, not the primary store. On load, `hydrateLocalData()` runs first and Firestore fills in afterwards (`loadUserData()`).
- **Auth**: Google sign-in only (the README mentions email/password but the UI only exposes Google). Without valid Firebase config the app falls back to a local "Modo local" session.
- **Views**: `#summaryView`, `#simulatorView`, `#savingsView`, `#balanceView`, `#categoriesView`, `#reportsView` — toggled via the `hidden` class. `#authScreen` gates the whole `.app`. Nav buttons call `showView()` + `setActiveNav()`.
- **Responsive (mobile-first)**: base CSS targets a 320px phone and the cascade scales up through `@media (min-width:600px / 768px / 1024px / 1440px / 1920px)` at the end of `style.css` (there are **no** `max-width` queries). **Below 1024px** the sidebar becomes a top bar with a hamburger button (`#navToggle`) that expands `#sideNav` vertically (`aside.nav-open`); the session/logout block (`.side-bottom`) lives inside that menu on mobile and in the sidebar from 1024px up. Above 1024px the layout is `grid-template-columns:250px minmax(0,1fr)` with a static sidebar.
- **Cache busting**: CSS/JS are loaded with a `?v=` query param (currently `?v=20260927-mf9`). **Bump it in `index.html` (3 places: stylesheet, script, favicon) on every ship** — otherwise users keep stale assets.

### localStorage keys

| Key | Contents |
| --- | --- |
| `cartera_payments` | All payments (array) |
| `cartera_categories` | All categories (array, colors deduped) |
| `cartera_page_size` | Pagination size for the payments table |
| `cartera_theme` | `dark` / `light` |
| `cartera_simulator` | Simulator income input |
| `cartera_simulator_tour` | `done` once the Simulator guide is finished |
| `cartera_savings_tour` | `done` once the Savings guide is finished |
| `cartera_notif_seen` | Map `paymentId -> signature` of notifications already dismissed |

### Notable UI subsystems

- **Guided tours** (Simulator and Savings): one reusable engine in `script.js` (`startTour(steps, key)`, `simTourStart`, `savingsTourStart`, spotlight `#tourSpotlight` + card `#tourCard`). Steps are declarative objects `{ target, title, text, tip }`; auto-starts on first visit and can be replayed from the "¿Cómo usarlo?" button.
- **Notification widget**: floating bell `#notifWidget` with panel, chips (`atencion` = unseen alerts, `sinpagar` = all unpaid, `pagados`), "Marcar pagado", "Ver pago" (scrolls + flashes the row via `paymentFilters.focusId`) and "Marcar todo como visto". Alert kind is derived from the date: `vencido` (past due and unpaid), `pendiente`, `pagado`. Badge counts **unseen** alerts only.
- **Category color palette**: `CATEGORY_PALETTE` (30 named colors) rendered by `renderColorPalette()` into `#colorPalette`. A color may be used by only one category: `categoryColorOwner()` blocks reuse (hint + shake), `freeCategoryColor()` gives the form a free default, and `normalizeCategoryColors()` repairs duplicates. Colors are used as dots/swatches only — never as text backgrounds. The grid uses `repeat(auto-fill,minmax(40px,1fr))` so every swatch stays ≥40px (touch target) at any width.
- **Tables with their own scroll**: every `.table-wrap` is `overflow:auto` with `max-height:min(66vh,540px)`, so long tables scroll **vertically inside the panel** instead of stretching the page, while `table{min-width:660px}` keeps the horizontal scroll for the columns. The `thead th` is `position:sticky; top:0` over an opaque `--table-bg` (`#f9faf8` light / `var(--white)` dark). Scrollbars are styled globally (`scrollbar-width:thin`, `scrollbar-color` and a 10px round `::-webkit-scrollbar-thumb` driven by `--scroll-thumb` per theme).
- **Pagination**: below 600px `.pagination` is a grid — row 1 the page-size select, row 2 `#pageInfo` as a centred pill, row 3 `#prevPage`/`#nextPage` as two equal 44px buttons; from 600px it collapses to a single flex row with `#prevPage{margin-left:auto}` (select left, controls right). `#prevPage`/`#nextPage` get `disabled` from `renderPayments()`.
- **Reportes** (`#reportsView`): informe detallado por rango de fechas. Rango con presets en `.report-presets .chip` (`Este mes` / `3 meses` / `Este año` / `Todo`, estado en `reportRange`, por defecto `quarter`) más `#reportFrom`/`#reportTo` manuales (preset `custom`). `computeReports()` devuelve KPIs con delta vs. **periodo anterior de la misma duración** (`reportPreviousRange()`, si no hay pagos previos el delta dice “sin periodo anterior”), evolución mensual con barras (`.report-bar*`), tabla por categoría (con presupuesto mensual vs. **gasto promedio del rango**), por estado, top 10 y el resumen ejecutivo (`#reportSummary`). `renderReports()` se llama desde `render()` y desde el nav (sale temprano si la vista está oculta). Salidas: `#reportPrintBtn` → `window.print()` (hoja `@media print` limpia, fuerza paleta clara aunque el tema sea oscuro), `#reportCsvBtn` → `exportReportCsv()` (`reporte-pagos-AAAA-MM-DD.csv` con secciones Periodo/KPI/Mes/Categoria/Estado/Top/Resumen) y `#reportBackupBtn` → `exportData()`. Los paneles van en **una sola columna** (`.reports-grid`) para que las tablas quepan sin scroll interno. En `.stat.primary` (tarjeta que se invierte entre temas) los `.report-delta` tienen colores propios por tema para mantener contraste ≥7:1.
- **Savings wizard**: 4 steps (`goToSavingsStep`, `#savingsStepper`, `updateSavingsSimulator`) persisted through `saveSavingsPlan()`.
- **Recurring payments**: a payment may carry `recurring: true` (checkbox "Repetir cada mes" in the payment modal, row badge `↻ mensual`). `syncRecurringPayments()` runs at startup, after `loadUserData()` and after saving a payment: for every recurring seed it clones the payment forward month by month **up to the current month only**, skipping any month that already has the same concept + category (never duplicates, never future-dates). Clones are born `pendiente`.
- **CSV import/export**: `exportData()` (still triggered from Reportes → **Copia completa**) writes `Concepto,Categoria,Fecha,Estado,Importe,Recurrente` (quoted, `,`, UTF‑8 BOM) via the shared `downloadCsv(filename, rows)` helper. `importData()` / `parseCsvRows()` accept `,` or `;` (a line that resolves to a single cell but contains ≥2 of the *other* delimiter is re-split, so mixed files also work), quoted cells, header or fixed order, `YYYY-MM-DD` or `DD/MM/YYYY` dates, Spanish status labels, and optional `Recurrente`. Missing categories are created with `freeCategoryColor()`; rows without concept/date/amount or that already exist are skipped. The flow is **`#importNav` → `#importModal`** (structure help + example table) with `#importPickBtn` → `#importFile`, and `#importTemplateBtn` downloads `plantilla-pagos.csv` (header + 3 rows marked “Ejemplo:”). The modal closes itself after a file is read. The old nav entry “Exportar datos” (`#exportNav`) was removed: exporting lives inside Reportes now.
- **Category budgets**: `category.budget` = monthly COP limit set from the category form (`budget` input, `data-currency-input`). `categoryBudgetState()` returns `ok` / `warn` (≥80%) / `exceeded` (≥100%); it drives the progress bars in the Summary "Por categoría" list, the `#budgetBanner` alert, and the extra "Presupuesto" column of the categories table.
- **Logo**: inline SVG `.brand-mark` in the header/sidebar (theme-aware via CSS: `body.dark .brand-mark rect { fill:var(--lime) }`), plus files in `assets/img/` (`logo-mark.svg`, `logo.svg`, `logo-light.svg`) used as favicon.

## Firebase setup

1. Copy your web app config into `config/firebase-config.js` (already populated for the `gestion-pagos-web` project).
2. Enable **Google** sign-in in Firebase Console → Authentication.
3. Publish `firestore.rules` manually in Firebase Console → Firestore → Rules. The repo file is the source of truth.
4. Add `localhost` to Authentication → Settings → Authorized domains if testing locally.

## Conventions

- All user-facing text is in Spanish (including tour steps, notifications, and validation messages).
- Currency is Colombian pesos (COP) — formatting logic is in `script.js` (`money()`).
- Payment statuses: `pagado`, `no_pagado`, `pendiente`.
- Category colors are normalized to avoid duplicates; `persistCategories()` handles dedup and Firestore sync.
- CSV files are the app's interchange format: keep the header `Concepto,Categoria,Fecha,Estado,Importe,Recurrente` in sync between `exportData()` and `importData()`.
- No build step: avoid ES modules, imports, JSX/TS, or npm-only syntax. Use `node --check` to validate JS.
- When changing UI, verify both themes (dark/light) and every width with `responsive-test.html` (320, 375, 414, 600, 768, 1024, 1440, 1920): no horizontal overflow, no clipped text and targets ≥38px while below 1024px.
