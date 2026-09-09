# `shared/` — the cross-platform contracts

One definition of anything that has to be true in more than one place: the web
app (`web/`), the mobile app (`mobile/`), and the Flask backend (`backend/`).

## Why this is a workspace package

It carries a `package.json` and is declared in the root `package.json`'s
`workspaces`, so `shared/` is a real npm package (`@optio/shared`) rather than a
folder that four bundler configs happen to point at. That buys two things:

- It can own scripts. `npm run generate -w @optio/shared` is the code generator
  below, and it runs the same way from the repo root, from CI, and from a
  developer's shell.
- `npm install` at the repo root links it into `node_modules/@optio/shared`, so
  tooling that resolves packages (rather than paths) can see it.

Note the `package.json` deliberately declares **no `"type"` field**. Files here
are resolved by walking up to the nearest `package.json`; before this file
existed that was the repo root's, which has no `"type"` either. Adding one would
silently reclassify every `.js` file under `shared/` as ESM or CJS.

The apps still reach this folder through the `@shared` alias, declared in five
configs that cannot see each other — `mobile/src/__tests__/sharedAlias.test.ts`
is what keeps them agreeing. `web/` and `mobile/` are NOT workspace members;
their Render build commands run `npm ci` / `npm install` inside their own
directory, which a hoisted workspace lockfile would break. See
`docs/remediation-2026-09/PHASE_2_SHARED_HANDOFF.md`.

## What belongs here, and what does not

**Yes:** the pillar and subject vocabularies, the legal documents, API request
and response shapes, validation rules, and pure business logic like the credit
calculation — anything where two surfaces having their own copy means they can
disagree with each other about a fact.

**No:** components, stores, hooks and navigation. Web and mobile keep separate
UI and state layers on purpose. Also no per-surface presentation: Tailwind class
strings, icon names (Heroicons on web, Ionicons on mobile), CSS custom
properties. Those are properties of a platform, not of the thing.

## Layout

| Path | What it is |
|---|---|
| `data/` | The canonical JSON. Hand-edited. Nothing else is a source. |
| `generated/` | Emitted from `data/`. **Do not edit.** |
| `scripts/` | The generator. |
| `*.ts` | Typed front doors — helpers over the generated data. |
| `legal/` | Terms and Privacy, rendered by both apps. |

The backend's half of the generated output lands in `backend/generated/`, which
is why the generator emits two languages: a TypeScript file cannot be canonical
for a Flask process.
