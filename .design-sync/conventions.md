## Optio Design System — how to build with it

React (DOM) components styled with **Tailwind CSS** and the Optio brand tokens. Every
component is on `window.OptioUI`. Import by name from the package:

```jsx
import { Card, CardHeader, CardTitle, CardBody, CardFooter, Button, Alert, FormField } from 'optio-design-system';
```

### Setup
- **No provider or theme wrapper is required** — components render styled on their own.
- Fonts ship via the stylesheet: **Poppins** (headings and body) and **Inter**. Don't add a font loader.
- The brand stylesheet is already loaded; you only write markup and Tailwind classes.

### Styling idiom — Tailwind utilities + brand tokens
Style layout and one-off tweaks with **Tailwind utility classes**. Prefer each component's
`variant` / `size` props for its built-in looks; every component also takes `className` to extend it.
Use the **brand tokens** (not generic `purple-*`/`pink-*`) for anything Optio-branded:

| Purpose | Classes |
|---|---|
| Brand purple | `bg-optio-purple` `text-optio-purple` `border-optio-purple` (`-dark` / `-light` variants) |
| Brand pink | `bg-optio-pink` `text-optio-pink` `border-optio-pink` (`-dark`) |
| Primary gradient | `bg-gradient-primary` or `bg-gradient-to-r from-optio-purple to-optio-pink` |
| Pillar colors | `bg-pillar-stem` `bg-pillar-art` `bg-pillar-communication` `bg-pillar-wellness` `bg-pillar-civics` (each has `text-`, `border-`, `-light`, `-dark`, and `bg-gradient-pillar-<name>`) |

The five pillars are **STEM, Art, Communication, Wellness, Civics** — use the matching `pillar-*` token.

### Where the truth lives
- `styles.css` (and the `_ds_bundle.css` it imports) — the exact utility + token set that ships. Read it before inventing a class.
- Each component's `<Name>.d.ts` (props) and `<Name>.prompt.md` (usage) under `components/`.

### Component vocabulary
Primitives: `Button` (variant: primary/secondary/outline/ghost/danger/success; size: xs–xl),
`Alert` (variant: info/success/warning/error/purple), `Card` + `CardHeader`/`CardBody`/`CardFooter`/`CardTitle`,
`Input` / `Textarea` / `Select`, `FormField` (+ `FormLabel`), `FormFooter`, `Modal`, `ModalOverlay`,
`StatusBadge`, `PhilosophyCard`, and skeletons `SkeletonCard` / `SkeletonStats` / `SkeletonDiplomaHeader`.

### Idiomatic example
```jsx
<Card variant="elevated">
  <CardHeader gradient>
    <CardTitle>Personal Finance</CardTitle>
  </CardHeader>
  <CardBody>
    <p className="text-gray-600 text-sm">Learn to budget through real projects you choose.</p>
  </CardBody>
  <CardFooter>
    <div className="flex justify-end">
      <Button size="sm">Start class</Button>
    </div>
  </CardFooter>
</Card>
```
