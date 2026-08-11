# Optio Web Design System

**Status**: Canonical as of 2026-08-10. This document is the single source of truth
for how the v1 web app (`frontend/`) looks. When a page and this document
disagree, the page is wrong.

Scope: the web platform (marketing + signed-in app). Explicitly OUT of scope:
the SIS console (`sis.optioeducation.com` — its own self-consistent surface),
print artifacts (PublicTranscriptPage, the transcript generator's printable
template, billing receipt HTML), emails, and MobileDemoPage's iframe chrome.
The mobile app (`frontend-v2/`) has its own token file.

Companion spec: [LIQUID_GLASS.md](LIQUID_GLASS.md) — the glass selection
treatment. This document defers to it for glass rules.

---

## 1. Color

All brand color comes from tokens in `frontend/tailwind.config.js`. Raw Tailwind
palette hues standing in for brand (`purple-600`, `pink-500`, `indigo-*`,
`blue-600` as a primary action, `from-purple-50 to-pink-50` washes) are defects.

| Use | Token |
|---|---|
| Brand primary | `optio-purple` (#6D469B), `-dark`, `-light` |
| Brand accent | `optio-pink` (#EF597B), `-dark` |
| Brand gradient | `bg-gradient-primary` (135°, purple → pink). Never re-spell it as `bg-gradient-to-r from-optio-purple to-optio-pink`, and never invent hover stops (`hover:from-purple-700` etc. — hover the shadow/translate instead). |
| Hero accent (display text on dark heroes) | `bg-gradient-hero-accent` + `bg-clip-text text-transparent` (lavender #E7ABF3 → #BE84C9). Marketing heroes only. |
| Brand tint (backgrounds) | `bg-optio-purple/10` (icon tiles), `/5` (washes, hovers). Never `bg-purple-50`/`bg-pink-50`. |
| Pillars | `pillar-stem/art/communication/wellness/civics` (+`-light`/`-dark`), via `utils/pillarMappings.js`. Never hardcode pillar hexes or keep local `PILLAR_COLORS` maps. |
| Headings / primary text | `text-gray-900` |
| Body / secondary | `text-gray-600` (or `-700` for dense body copy) |
| Muted / meta | `text-gray-500` (timestamps, hints may use `-400`) |
| App shell background | `bg-neutral-50` (#F3EFF4, the warm Layout gray). `bg-background` and `bg-gray-50` page shells migrate here. |
| Card borders | `border-gray-200` (inner/nested list items may use `border-gray-100`) |
| Semantic | red = destructive/error, green = success, amber = warning. These stay raw Tailwind (`bg-red-50 border border-red-200 text-red-700` pattern) — semantic color is not brand color. Blue is NOT a neutral "info" primary; info callouts use the brand tint. |

The `text-text-primary` (#003f5c), `text-secondary`, `text-muted` tokens are
**retired** — the app standardized on the gray scale in practice. The old
`text-neutral-*` text usage (Family suite) migrates to `text-gray-*`.

## 2. Typography

Poppins is the default `font-sans`. **Never** write
`style={{ fontFamily: 'Poppins' }}` — it is redundant on every element.
Inline `fontWeight` is likewise banned; use weight classes.

The config maps weights to their real values (fixed 2026-08-10; previously
everything rendered 600, which is why inline styles metastasized):

| Class | Weight | Use |
|---|---|---|
| `font-normal` | 400 | Long-form body |
| `font-medium` | 500 | Body emphasis, labels, nav items |
| `font-semibold` | 600 | Buttons, card titles, table headers |
| `font-bold` | 700 | Headings, page titles |

Type scale (page context, not element identity):

| Role | Classes |
|---|---|
| Marketing hero h1 | `text-4xl sm:text-5xl md:text-6xl font-bold` (white on photo/gradient hero) |
| Marketing section h2 | `text-3xl sm:text-4xl font-bold text-gray-900` |
| Eyebrow | `text-sm font-semibold uppercase tracking-wider text-optio-purple` |
| App page title (h1) | `text-2xl font-bold text-gray-900` (+`sm:text-3xl` on wide pages) |
| Card/section title | `text-sm font-semibold text-gray-900` (compact) or `text-lg font-semibold` (feature cards) |
| Body | `text-sm` in app UI, `text-lg text-gray-600` in marketing prose |
| Meta | `text-xs text-gray-500` |

Note: `index.css` still sets base sizes on bare `h1/h2/h3` — always give
headings an explicit size class; don't rely on (or fight) the base.

## 3. Layout

| Surface | Container |
|---|---|
| Marketing sections | `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8` (`max-w-7xl` allowed only for 3+-column card grids), section rhythm `py-16 sm:py-20`, alternating `bg-white` / `bg-gray-50` / `bg-gradient-to-br from-optio-purple/5 via-white to-optio-pink/5`, `scroll-mt-20` on anchor targets |
| App: focused/content pages | `max-w-3xl mx-auto px-4 py-8` (SchoolPage, Family suite, detail/create forms) |
| App: dashboard/browse pages | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8` |

Those are the only two app widths. (`max-w-screen-2xl`, `max-w-6xl`, one-off
`max-w-4xl` shells migrate to the nearest of the two when touched.)

**Card grids inside the app shell** use `grid-cols-1 sm:grid-cols-2
xl:grid-cols-3` (optionally `2xl:grid-cols-4` for compact cards). Tailwind
breakpoints measure the viewport but the sidebar consumes ~256px of it, so a
`lg:` 3-column grid squishes on laptops — three columns only from `xl:`. Small
stat tiles and option grids may keep `md:grid-cols-3`. Marketing pages (no
sidebar) keep viewport-natural breakpoints.

App page header: left-aligned `h1 text-2xl font-bold text-gray-900` +
`text-sm text-gray-500 mt-1` subtitle. Centered "letterhead" headers are
reserved for identity pages (SchoolPage, Diploma). Full-bleed gradient hero
banners are a marketing/public-portfolio idiom — don't add new ones inside the
app shell.

## 4. Buttons (`frontend/src/index.css`)

One primary action per view. Everything else is quiet.

| Class | Recipe | Use |
|---|---|---|
| `.btn-primary` | Gradient **pill**: `bg-gradient-primary text-white font-semibold rounded-full px-5 py-2.5 text-sm`, brand shadow, `hover:-translate-y-0.5` | THE call to action of a view; form submits |
| `.btn-lg` | Size modifier: `px-8 py-3 text-lg` | Marketing/hero CTAs |
| `.btn-secondary` | Outline pill: `border-2 border-optio-purple text-optio-purple bg-white hover:bg-optio-purple/5` | Paired secondary CTA |
| `.btn-quiet` | `rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-optio-purple hover:text-optio-purple` | The workhorse: toolbars, pagers, cancel, table actions, filters |
| `.btn-ghost` | Text pill, purple, `hover:bg-optio-purple/5` | Tertiary/inline actions |
| `.btn-danger` | `rounded-lg bg-red-600 text-white hover:bg-red-700` | Destructive |
| `.btn-inverse` | White pill, `text-optio-purple`, on dark/gradient bands | Marketing CTA bands, heroes |
| `.btn-ghost-inverse` | Transparent pill, `border-2 border-white text-white hover:bg-white/10` | Paired with `.btn-inverse` |

All include `inline-flex items-center justify-center gap-2 transition-all
duration-200 disabled:opacity-50 disabled:cursor-not-allowed`. Text-link
actions inside cards: `text-sm font-medium text-optio-purple hover:underline`.
Link hovers: `hover:text-optio-purple` / `-dark` — never `hover:text-purple-500`.

`components/ui/Button.jsx` mirrors these variants (`primary` = gradient pill,
`secondary` = quiet, `danger`, `ghost`, `outline` = `.btn-secondary` look).
Either the class or the component is fine; don't hand-roll a third recipe.

## 5. Cards & surfaces

| Pattern | Recipe |
|---|---|
| Card (canonical) | `bg-white rounded-xl border border-gray-200 shadow-sm` — this is `.card` (p-6; use p-4/p-5 for compact) |
| Hoverable/link card | + `hover:border-optio-purple/60 hover:shadow-sm transition-all` (SchoolPage link cards) |
| Icon tile | `w-9 h-9 rounded-lg bg-optio-purple/10 text-optio-purple` (+ gradient fill w/ white icon on group-hover) |
| Nested list item | `border border-gray-100 bg-gray-50/60 rounded-lg p-4` |
| Marketing feature card | `rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8`; image cards `rounded-2xl border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1` |

Deprecated: `rounded-lg shadow` borderless panels, `border-2` card borders,
`shadow-md`/`shadow-lg` resting elevations (reserve ≥`shadow-lg` for
overlays/popovers).

## 6. Forms

Inputs use `.input-field` (`px-4 py-3 border-gray-200 rounded-lg focus:ring-2
ring-primary/20`) or `components/ui/Input.jsx`; compact contexts may use
`px-3 py-2 text-sm` but keep border/focus recipe. Labels:
`block text-sm font-medium text-gray-700`. Errors: `mt-1 text-sm text-red-600`
with `role="alert"`. Never `focus:ring-blue-500` / `focus:border-purple-500`.

## 7. Selection & tabs

One idiom: the **glass tab bar** — `components/ui/GlassTabBar.jsx` (extracted
from SchoolPage 2026-08-10). Pill rail `rounded-full border border-white/60
bg-white/65 p-1.5 shadow-lg shadow-gray-900/10 backdrop-blur-xl`; active tab
`text-optio-purple` over a framer-motion `layoutId` glass pill; full
`role="tablist"` a11y; hidden below 2 tabs. Use it for page-level tabs and
segmented filters. The sidebar's `.optio-glass-lens` remains the treatment for
nav rails (see LIQUID_GLASS.md). Underline tabs, gray-100/white-pill switchers,
solid-fill chip toggles, and bespoke segmented controls are deprecated —
migrate when touching a file.

## 8. States

| State | Recipe |
|---|---|
| Page loading | `PageLoader` from `components/ui/Spinner.jsx` |
| Inline loading | `<Spinner size="sm|md|lg" />` (`animate-spin rounded-full border-b-2 border-optio-purple`, h-5/8/12) |
| In-button loading | `<Spinner size="sm" className="border-white" />` |
| Skeletons | `components/ui/Skeleton.jsx` for list/card pages |
| Empty | `components/ui/EmptyState.jsx` — icon (`w-16 text-gray-300`), `text-gray-500 font-medium` title, `text-sm text-gray-400` hint, optional action |
| Toasts | `react-hot-toast` via the single `<Toaster>` in App.jsx (white card, gray-900 text, `border-gray-200`, 12px radius, brand icon theme). Never restyle per call site. |
| Modals | `components/ui/Modal.jsx` (or MobileModal for sheets). Backdrop `bg-black/50`. No new hand-rolled modal chrome. |

## 9. Motion

- Micro-interactions: `transition-all duration-200`; hover lift
  `hover:-translate-y-0.5` (buttons) / `-translate-y-1` (marketing cards).
  `hover:scale-105` is deprecated except image zoom inside overflow-hidden
  media (`group-hover:scale-105 duration-500`).
- Selection: the glass spring — framer-motion `{type:'spring', bounce:0.25,
  duration:0.55}` or the CSS lens curve per LIQUID_GLASS.md.
- Reveal-on-scroll: marketing only (`RevealSection`/`RevealItem`).
- Respect `prefers-reduced-motion` for anything that slides.

## 10. Migration rules (for any PR touching a page)

1. Strip `style={{ fontFamily: ... }}`; map inline `fontWeight` 700→`font-bold`,
   600→`font-semibold`, 500→`font-medium` before deleting.
2. Replace hand-rolled gradient/solid/blue primary buttons with `.btn-primary`
   (or `.btn-quiet` if it isn't the view's main action).
3. Replace raw brand hues with tokens (`purple-600`→`optio-purple`,
   `from-purple-50 to-pink-50`→`from-optio-purple/5 to-optio-pink/5`, …).
4. Converge cards on the canonical recipe; inputs on `.input-field`.
5. New tabs/filters use `GlassTabBar`; new spinners use `Spinner`.
6. Don't chase every instance in untouched files — but never add a new
   deviation.
