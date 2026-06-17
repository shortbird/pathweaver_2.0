# design-sync notes — Optio Design System (v1 web UI)

Project: **Optio Design System** (`555f6160-6060-498a-bbea-959f54e5b042`)
Scope: the v1 web component library at `frontend/src/components/ui/` (React DOM + Tailwind). 15 components, all authored + graded good.

## Repo-specific gotchas (read before re-syncing)

- **This is a Vite APP, not a packaged design system.** There is no library build that
  ships a component entry or its own CSS. We bundle from source via a custom entry
  `frontend/.ds-entry.jsx` (re-exports the barrel + the 4 unexported primitives so they
  land on `window.OptioUI`). `--entry ./frontend/.ds-entry.jsx`.
- **The entry MUST live inside `frontend/`** (a package.json with a `name`). The repo-root
  package.json has no `name`, so if PKG_DIR resolves there the ts-morph type-root walk runs
  off to `/package.json` and crashes (`ENOENT /package.json`). Keeping the entry under
  `frontend/` makes PKG_DIR = `frontend` (named `optio-quests-frontend`).
- **CSS is generated, not shipped.** Run **`bash .design-sync/gen-styles.sh` BEFORE
  `package-build.mjs`** on every (re)sync — it compiles `frontend/.ds-styles.css` (gitignored)
  with Tailwind from the app's own `tailwind.config.js` + `src/index.css`, scoped to the ui
  components plus a brand-token safelist. `cfg.cssEntry` points at that file.
  - Tailwind CLI: pass ONE comma-separated `--content` glob. Two separate `--content` flags
    make the LAST one WIN (silently drops the component utilities → unstyled cards).
  - Fonts (Poppins headings/body, Inter) load via a remote Google Fonts `@import` prepended
    to the stylesheet → shows as `[FONT_REMOTE]` (runtime load, non-blocking). `cfg.runtimeFontPrefixes`
    also suppresses `[FONT_MISSING]`.
- **`@types/react`** isn't in `frontend/node_modules` by default; copied in from `.ds-sync`
  to strengthen prop extraction. On a fresh clone, `cp -R .ds-sync/node_modules/@types/react frontend/node_modules/@types/react`.
- **No `.d.ts`** (these are `.jsx` with JSDoc). `exportedNames` returns empty, so
  `cfg.componentSrcMap` enumerates all 15 components explicitly (also adds Button/StatusBadge/
  PhilosophyCard/Skeleton* which the barrel `index.js` does NOT export). Prop contracts are
  inferred from source/JSDoc — weaker than typed, but the JSDoc is good.
- **`PhilosophySection` is buggy** — references undefined `Clock`/`TrendingUp`/`Heart` (it
  imports `*Icon` names). It would crash; deliberately NOT previewed. Only `PhilosophyCard`
  is synced. Previews pass heroicons as the `icon` prop (heroicons resolve from frontend/node_modules).
- **`resize-vertical`** (Textarea source) is not a real Tailwind class — harmless, just absent
  from the CSS; the textarea still resizes by default.
- **Playwright pin:** the cached chromium is build **1217** → install **playwright@1.59.0 /
  playwright-core@1.59.0** in `.ds-sync` (latest pins a different build and fails to launch).

## Overrides in play
- `Modal`, `ModalOverlay`: `cardMode: single` + `viewport 680x460` (portal overlays).
- `Alert, Card, FormField, FormFooter, Input, Select, Textarea`: `cardMode: column` (their
  multi-cell/fixed-width previews were wider than a grid cell → `[GRID_OVERFLOW]`).

## Known render warns (triaged, expected — not new)
- `tokens: 1 missing (below threshold)` — informational, non-blocking.
- `[FONT_REMOTE]` for Poppins/Inter — runtime webfont load by design.

## Re-sync risks (watch-list)
- **Generated CSS is not committed.** If `gen-styles.sh` isn't run first, the build uses a
  stale/missing `frontend/.ds-styles.css`. Always regenerate.
- **Brand safelist drift:** `gen-styles.sh` hard-codes the brand/pillar token list. If
  `tailwind.config.js` colors change, update the list in the script or the design agent loses
  those classes.
- **Scoped CSS = only what the ui components + safelist use.** A utility a NEW preview needs
  that no component/safelist references won't be in the CSS. Prefer inline-style layout glue in
  previews (current previews do this), or extend the safelist.
- If `frontend/src/components/ui/**` changes, rebuild AND regenerate the CSS.
- The conventions header (`.design-sync/conventions.md`) names brand classes + component props;
  re-validate them against the fresh build (the conventions step does this).
