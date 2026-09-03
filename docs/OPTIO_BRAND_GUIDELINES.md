# Optio Brand & Design Guidelines

**Last Updated:** January 2025

## Table of Contents
1. [Brand Colors](#brand-colors)
2. [Typography](#typography)
3. [Gradients & Visual Elements](#gradients--visual-elements)
4. [Component Styling](#component-styling)
5. [Imagery Guidelines](#imagery-guidelines)
6. [Common Mistakes to Avoid](#common-mistakes-to-avoid)
7. [Accessibility Standards](#accessibility-standards)

---

## Brand Colors

### Primary Brand Colors (Tailwind Config)

**Optio Purple:**
- Hex: `#6D469B`
- Tailwind class: `optio-purple`
- Usage: Primary brand color, gradients, buttons, headers
- Dark variant: `#5A3A82` (hover states)
- Tailwind class: `optio-purple-dark`

**Optio Pink:**
- Hex: `#EF597B`
- Tailwind class: `optio-pink`
- Usage: Primary brand color, gradients, accents
- Dark variant: `#E73862` (hover states)
- Tailwind class: `optio-pink-dark`

### 🚨 CRITICAL: Do NOT Use Default Tailwind Colors

**NEVER USE:**
- ❌ `purple-600` (#9333EA) - This is Tailwind's default purple, NOT Optio purple
- ❌ `pink-600` (#DB2777) - This is Tailwind's default pink, NOT Optio pink
- ❌ `from-purple-600 to-pink-600` gradient

**ALWAYS USE:**
- ✅ `optio-purple` (#6D469B)
- ✅ `optio-pink` (#EF597B)
- ✅ `from-optio-purple to-optio-pink` gradient

### Pillar Colors

Each of the five skill pillars has a distinct color for visualization and iconography:

- **STEM:** Blue tones
- **Wellness:** Green tones
- **Communication:** Orange tones
- **Civics:** Purple tones
- **Art:** Pink/magenta tones

---

## Typography

### Font Family: Poppins

**IMPORTANT:** Poppins is used across the entire platform. Use web fonts for web application, system fonts for email.

### Font Weights

**Use ONLY these three weights:**
- **Bold (700):** Page headers, primary CTAs, important labels
- **Semi-Bold (600):** Section headers, card titles, secondary CTAs
- **Medium (500):** Body text, descriptions, labels

**DO NOT USE:**
- Regular (400)
- Light (300)
- Thin (100)

### Email Typography

**Constraint:** Email clients block web fonts (Poppins not available in email)

**Solution:** Use system font stack for emails:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

---

## Gradients & Visual Elements

### Standard Brand Gradient

**Primary Gradient:**
```css
background: linear-gradient(to right, #6D469B, #EF597B);
```

**Tailwind class:**
```html
class="bg-gradient-to-r from-optio-purple to-optio-pink"
```

### Where to Use Gradients

✅ **Always use brand gradient on:**
- Primary CTA buttons
- Page headers and hero sections
- Avatar border circles
- Badge cards and quest cards
- Navigation highlights
- Progress bars

### Gradient Overlays for Images

When placing text over background images:
- Use dark overlay: `rgba(0, 0, 0, 0.5)` to `rgba(0, 0, 0, 0.7)`
- Ensures text readability (WCAG 2.1 AA contrast ratio: 4.5:1 minimum)
- Example: Badge cards with background images

---

## Component Styling

### Buttons

**Primary CTA Button:**
```html
<button class="bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg px-6 py-3 hover:opacity-90 transition">
  Button Text
</button>
```

**Secondary Button:**
```html
<button class="border-2 border-optio-purple text-optio-purple font-semibold rounded-lg px-6 py-3 hover:bg-optio-purple hover:text-white transition">
  Button Text
</button>
```

**Hover States:**
- Gradient buttons: `hover:opacity-90`
- Solid color buttons: Use `-dark` variant (e.g., `hover:bg-optio-purple-dark`)
- Border buttons: Transition to filled state with white text

### Cards

**Standard Card:**
```html
<div class="bg-white rounded-lg shadow-md p-6 border border-gray-200">
  <!-- Card content -->
</div>
```

**Card with Gradient Accent:**
```html
<div class="bg-white rounded-lg shadow-md p-6 border-t-4 border-t-optio-purple">
  <!-- Card content -->
</div>
```

### Avatar Circles

**With Brand Gradient Border:**
```html
<div class="rounded-full p-1 bg-gradient-to-r from-optio-purple to-optio-pink">
  <img src="avatar.jpg" class="rounded-full w-16 h-16" alt="User avatar" />
</div>
```

### Progress Bars

**Brand Gradient Fill:**
```html
<div class="w-full bg-gray-200 rounded-full h-4">
  <div class="bg-gradient-to-r from-optio-purple to-optio-pink h-4 rounded-full" style="width: 60%"></div>
</div>
```

---

## Imagery Guidelines

### Quest Images

**Source:** Pexels API
**Auto-generation:** Quest images automatically fetched based on quest title
**Refresh endpoint:** `POST /api/admin/quests/:id/refresh-image`

**Image requirements:**
- High resolution (minimum 1200px wide)
- Relevant to quest topic
- Positive, inclusive representation
- Professional quality

### Badge Images

**Source:** Pexels API with teen-focused search terms
**Search pattern:** "teenage teen student" + badge topic
**Auto-generation:** Batch generation available in admin dashboard
**Refresh endpoint:** `POST /api/badges/admin/:badge_id/refresh-image`

**Image requirements:**
- Teen-appropriate imagery
- Diverse representation
- Action/learning-focused
- Professional quality
- Used as background with dark overlay for text readability

### Email Images

**Logo Storage:** Supabase storage bucket `site-assets/email/`
**Logo URL:** `https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/email/optio-logo.png`

**Email image constraints:**
- Host on Supabase storage (not external URLs)
- Use absolute URLs in email templates
- Include alt text for accessibility
- Optimize file sizes for email clients
- Test rendering across email clients (Outlook, Gmail, Apple Mail)

---

## Common Mistakes to Avoid

### ❌ MISTAKE 1: Using Default Tailwind Colors
```html
<!-- WRONG -->
<button class="bg-gradient-to-r from-purple-600 to-pink-600">
  Click Me
</button>

<!-- CORRECT -->
<button class="bg-gradient-to-r from-optio-purple to-optio-pink">
  Click Me
</button>
```

### ❌ MISTAKE 2: Inconsistent Button Styling
```html
<!-- WRONG - Using different shades -->
<button class="bg-purple-500">Button 1</button>
<button class="bg-pink-700">Button 2</button>

<!-- CORRECT - Using brand colors -->
<button class="bg-optio-purple">Button 1</button>
<button class="bg-optio-pink">Button 2</button>
```

### ❌ MISTAKE 3: Missing Gradient on Key Elements
```html
<!-- WRONG - Plain color on CTA -->
<button class="bg-purple-600">Sign Up</button>

<!-- CORRECT - Brand gradient on CTA -->
<button class="bg-gradient-to-r from-optio-purple to-optio-pink">Sign Up</button>
```

### ❌ MISTAKE 4: Using Wrong Font Weights
```css
/* WRONG - Using thin or light weights */
font-weight: 300;
font-weight: 400;

/* CORRECT - Using approved weights */
font-weight: 500; /* Medium */
font-weight: 600; /* Semi-Bold */
font-weight: 700; /* Bold */
```

### ❌ MISTAKE 5: Poor Text Contrast on Images
```html
<!-- WRONG - Text directly on bright image -->
<div style="background-image: url(bright-image.jpg)">
  <h1 class="text-white">Title</h1>
</div>

<!-- CORRECT - Dark overlay for readability -->
<div class="relative">
  <img src="bright-image.jpg" alt="" />
  <div class="absolute inset-0 bg-black bg-opacity-60">
    <h1 class="text-white">Title</h1>
  </div>
</div>
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

**Color Contrast Requirements:**
- Normal text (< 18pt): 4.5:1 contrast ratio minimum
- Large text (≥ 18pt or bold ≥ 14pt): 3:1 contrast ratio minimum
- Interactive elements: 3:1 contrast ratio for hover/focus states

**Keyboard Navigation:**
- All interactive elements must be keyboard accessible
- Visible focus indicators required (use focus ring utilities)
- Logical tab order maintained

**Screen Reader Support:**
- Semantic HTML elements (`<button>`, `<nav>`, `<main>`, etc.)
- Alt text for all images
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic content updates

### Focus States

**Standard Focus Ring:**
```html
<button class="focus:outline-none focus:ring-4 focus:ring-optio-purple focus:ring-opacity-50">
  Button
</button>
```

**Skip to Content Link:**
```html
<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-optio-purple text-white px-4 py-2 rounded">
  Skip to main content
</a>
```

---

## Mobile-First Responsive Design

### Breakpoints (Tailwind Default)

- **xs:** < 640px (mobile)
- **sm:** ≥ 640px (large mobile)
- **md:** ≥ 768px (tablet)
- **lg:** ≥ 1024px (desktop)
- **xl:** ≥ 1280px (large desktop)

### Responsive Patterns

**Mobile-first approach:**
```html
<!-- Base styles for mobile, then scale up -->
<div class="p-4 md:p-6 lg:p-8">
  <h1 class="text-2xl md:text-3xl lg:text-4xl font-bold">
    Title
  </h1>
</div>
```

**Stack on mobile, grid on desktop:**
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- Cards -->
</div>
```

---

## Email-Specific Styling Guidelines

### Constraints

**What DOESN'T work in email:**
- ❌ Web fonts (Poppins unavailable)
- ❌ Advanced CSS (flexbox, grid have limited support)
- ❌ External stylesheets
- ❌ JavaScript
- ❌ Some gradient support (Outlook shows fallback)

**What DOES work:**
- ✅ Inline CSS styles
- ✅ Table-based layouts
- ✅ System fonts
- ✅ Solid background colors (with gradient fallback)
- ✅ Images from Supabase storage

### Email Color Implementation

**Gradient with Outlook Fallback:**
```html
<!-- Outlook sees solid purple, modern clients see gradient -->
<td bgcolor="#6D469B" style="background: linear-gradient(to right, #6D469B, #EF597B); padding: 40px; text-align: center;">
  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
    Welcome to Optio
  </h1>
</td>
```

**CTA Button in Email:**
```html
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td bgcolor="#6D469B" style="background: linear-gradient(to right, #6D469B, #EF597B); border-radius: 8px; text-align: center;">
      <a href="https://www.optioeducation.com" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
        Get Started
      </a>
    </td>
  </tr>
</table>
```

---

## Design Philosophy Alignment

### Process-Focused Language

**Our core philosophy:** "The Process Is The Goal"

**Language patterns to use:**
- ✅ "You are learning" (present tense, active)
- ✅ "You're exploring" (present progressive)
- ✅ "Currently working on" (present focus)
- ✅ "Your journey right now" (present moment)

**Language patterns to avoid:**
- ❌ "You will learn" (future-focused)
- ❌ "This will help you get into college" (external outcome)
- ❌ "Achieve your goals" (destination-focused)
- ❌ "Unlock your potential" (future potential)

**Design implication:** UI should celebrate progress happening NOW, not promise future rewards.

---

## Quality Checklist

Before shipping any new feature or page, verify:

### Color & Branding
- [ ] All buttons use `optio-purple`, `optio-pink`, or brand gradient
- [ ] No default Tailwind `purple-600` or `pink-600` colors used
- [ ] Avatar circles have gradient borders
- [ ] Primary CTAs use brand gradient
- [ ] Headers and hero sections use brand colors/gradients

### Typography
- [ ] Poppins font family used (web only)
- [ ] Only Medium (500), Semi-Bold (600), or Bold (700) weights used
- [ ] Proper font hierarchy (Bold > Semi-Bold > Medium)
- [ ] System fonts used for email templates

### Accessibility
- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 for text)
- [ ] All images have alt text
- [ ] Keyboard navigation works
- [ ] Focus states visible
- [ ] Screen reader tested

### Responsive Design
- [ ] Mobile-first approach used
- [ ] Tested on mobile (< 640px)
- [ ] Tested on tablet (768px)
- [ ] Tested on desktop (1024px+)
- [ ] Touch targets ≥ 44x44px on mobile

### Email-Specific (if applicable)
- [ ] Inline CSS only
- [ ] Table-based layout
- [ ] System fonts used
- [ ] Outlook gradient fallback included
- [ ] Images hosted on Supabase storage
- [ ] Tested in Gmail, Outlook, Apple Mail

---

## Resources

### Tailwind Config Location
`frontend/tailwind.config.js`

### Color Definitions
```javascript
colors: {
  'optio-purple': '#6D469B',
  'optio-purple-dark': '#5A3A82',
  'optio-pink': '#EF597B',
  'optio-pink-dark': '#E73862',
}
```

### Email Assets
- **Bucket:** `site-assets` (public Supabase storage)
- **Logo URL:** `https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/email/optio-logo.png`
- **Upload script:** `backend/scripts/upload_email_assets.py`

### Image Generation APIs
- **Pexels API Key:** Set in `PEXELS_API_KEY` environment variable
- **Quest images:** Auto-fetched on quest creation
- **Badge images:** Batch generation in admin dashboard

---

## Contact

For questions about brand guidelines or design decisions, refer to `core_philosophy.md` for philosophical alignment and this document for technical implementation.

**Remember:** Consistency builds trust. Every gradient, every color choice, every font weight reinforces the Optio brand identity.
