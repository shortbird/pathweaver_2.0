# Optio Liquid Glass

The platform-standard treatment for **selection indicators and floating chrome**:
a translucent Optio-gradient tint under a frosted blur, wrapped in a hairline
light border with a top sheen and a soft brand-purple shadow. It reads as a
pane of tinted glass resting on the page — not a painted background.

Implementation lives in `frontend/src/index.css` (`.optio-glass` and friends).
First shipped on the web sidebar's active-item lens (Aug 2026).

## The lens metaphor (three parts)

The full selection treatment is a *magnifying lens over a latent gradient*:

1. **Backdrop wash** (`.optio-glass-backdrop`): the rail itself carries the
   full brand gradient top-to-bottom at ~5% alpha — barely a whisper.
2. **Gradient reveal**: the lens's background is the *same* gradient at full
   lens strength, sized to the whole rail and counter-scrolled against the
   lens position (`--og-reveal-h` / `--og-reveal-y`). Wherever the lens sits,
   it reveals the saturated slice of what's faintly underneath — items near
   the top glow purple, items near the bottom glow pink, and the tint shifts
   visibly as it slides.
3. **Floating pill**: the lens is inset from the item bounds (4px x / 2px y,
   `rounded-xl`) so it hovers over the row instead of filling it.
4. **Magnification**: the content under the glass scales up slightly
   (`scale-[1.05]`, `origin-left`, 300ms) as the lens arrives — the item is
   literally magnified, completing the lens metaphor. Keep it ≤1.05; more
   reads as zoom, not glass.

(An edge-lit rim variant was tried and rejected — keep the pane clean; the
hairline border and sheen are the only hard edges.)

## The recipe

One effect, composed from tokens. Never hand-roll a variant — inherit the class
and adjust tokens locally if a surface needs different intensity.

| Token | Default | Meaning |
|---|---|---|
| `--og-tint-a` | `109, 70, 155` (optio-purple) | Gradient start, also shadow color |
| `--og-tint-b` | `239, 89, 123` (optio-pink) | Gradient end |
| `--og-tint-alpha` | `0.15` | Wash strength |
| `--og-blur` | `10px` | Backdrop blur radius |
| `--og-saturate` | `140%` | Backdrop saturation boost |
| `--og-edge` | `rgba(255,255,255,0.65)` | Hairline border |
| `--og-sheen` | `rgba(255,255,255,0.45)` | Top specular highlight |

Classes:

- `.optio-glass` — the pane itself (tint + blur + border + sheen + shadow)
- `.optio-glass--subtle` / `.optio-glass--strong` — intensity modifiers
- `.optio-glass-lens` — sliding-selection variant (see Motion)

## Rules

1. **The tint is always the brand gradient**, purple → pink at 135°, low alpha.
   Never a flat color, never other hues, never full opacity.
2. **Glass indicates, it does not contain.** Use it for selected states, the
   moving lens, small floating chrome (pills, docks, toasts). Do not put body
   text, forms, or cards on glass — text-heavy surfaces stay on solid white.
3. **One lens per surface.** A sliding lens is a spotlight; two moving glasses
   on screen compete and the metaphor collapses.
4. **Content over glass is brand-colored and bold** — `text-optio-purple` +
   semibold minimum. The wash is light; normal gray text fails contrast.
5. **Rounded, never square.** `rounded-lg` minimum; the sheen inherits the
   radius, square corners break the physical read.
6. **Layering**: the glass element renders *behind* its content (earlier in
   DOM, `pointer-events: none`, `aria-hidden`). It must never intercept clicks
   or appear in the accessibility tree.

## Motion (the lens)

When the glass marks a selection in a list, it is **one element that slides**,
not a style that jumps between items:

- `transform: translateY(...)` transition at **400ms,
  `cubic-bezier(0.3, 1.25, 0.5, 1)`** — a slight overshoot-and-settle, like a
  lens gliding into place. This curve is the standard; don't re-tune per
  surface. `background-position` shares the same spec so the gradient reveal
  stays registered with the rail during travel.
- **Squash and stretch**: on departure the lens scales to `scaleY(1.12)`,
  released ~180ms into the slide so the spring settles it back to 1 on
  arrival. Liquid, not rubber — never exceed ~1.15.
- Height transitions at 250ms ease. **Width has no transition** — the owning
  component measures the target (`offsetTop/offsetHeight/offsetWidth`) and
  updates width frame-by-frame (ResizeObserver) so the lens tracks container
  resizes (e.g. the sidebar's collapsed ↔ expanded rail) without lag or
  overhang.
- **Appearing is a snap, sliding is animated**: the lens only animates when it
  was already visible. First paint or returning from a page with no selection
  places it instantly — never slide in from a stale position.
- `prefers-reduced-motion: reduce` disables the slide entirely.

## Where it goes next

Candidates that should adopt this instead of their current flat active states,
in rough order: admin panel tabs, credit-dashboard tabs, SIS console nav,
org-page tabs. Reuse `.optio-glass optio-glass-lens` and the measurement
pattern from `Sidebar.jsx`.

## Where it does not go

- Marketing pages (they have their own, louder gradient language)
- Anything printed (transcripts, receipts) or emailed
- Backgrounds larger than a nav item / pill — big glass slabs read as fog
