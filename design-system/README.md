# Optio Design System

**Single Source of Truth for Design, UX, and Styling**

## Directory Structure

```
design-system/
├── README.md                    # This file - design system overview
├── brand-guidelines.md          # Brand identity, colors, typography
├── component-library.md         # Reusable component specifications
├── ux-patterns.md              # UX patterns and interaction guidelines
├── mockups/                    # Figma screenshots and design mockups
│   ├── homepage/
│   ├── dashboard/
│   ├── diploma/
│   ├── quest-hub/
│   └── admin/
├── components/                 # Component-specific design specs
│   ├── buttons.md
│   ├── cards.md
│   ├── forms.md
│   └── navigation.md
└── assets/                    # Design assets (logos, icons, etc.)
    ├── logos/
    └── icons/
```

## Quick Reference

### Main Brand Colors
- **Primary Gradient**: `from-[#6D469B] to-[#EF597B]` (purple to pink)
- **Direction**: ALWAYS purple left (#6d469b), pink right (#ef597b)
- **Primary Brand Color**: `#6D469B`
- **Secondary Brand Color**: `#EF597B`

### Section Colors
- **ART**: #150D1A, #331355, #59189C, #59189C, #AF56E5, #E6ABF3
    - **ART GRADIENT**: #F3EFF4, #E7D5F2
- **COMMUNICATION**: #0B1B0C, #233E0B, #177A12, #3DA24A, #62D768, #C1DF9E
    -**COMMUNICATION GRADIENT**: #F3EFF4, #D1EED3
- **STEM**: #05121C, #141652, #18309C, #254197, #2469D1, #7AC1F4
    -**STEM GRADIENT**: #F3EFF4, #DDF1FC
- **LIFE**: #1E0B0B, #4E1421, #9C1818, #B3393F, #E65C5C, #F38C96
    - **LIFE GRADIENT**: #F3EFF4, #FCD8D8
- **SOCIETY**: #15110C, #522B14, #9C4D18, #BE6B27, #FF9028, #F4CD89
    - **SOCIETY COLORS**: #F3EFF4, #F5F2E7

### Neutrals
- **Colors**: #F3eFF4, #EEEBEF, #BAB4BB, #908B92, #605C61, #3B383C, #1B191B
- **GRADIENT**: #F3EFF4, #EEEBEF

### Typography

**Poppins** (Primary Font)
- Google Fonts Key: `F6Y795SBQK90U`
- Friendly and accessible tone
- Use **BOLD (700)**, **SEMI-BOLD (600)**, and **MEDIUM (500)** weights only
- Never use Regular (400), Light (300), or Thin (100) - too thin for legibility

**Inter** (Alphanumeric Display)
- Google Fonts Key: `F6Y795SBQK90U`
- Use **BOLD (700)** and **REGULAR (400)** weights
- Only for strings mixing letters and numbers (user IDs, codes, etc.)
- Ensures clean, even read without Comic Sans appearance

**Times New Roman MT Condensed** (Advertising Only)
- Use only as sub-heading for advertising materials
- Not for UI or application content

### Core Philosophy
"The Process Is The Goal" - See [core_philosophy.md](../core_philosophy.md) for full details.

## Using This Design System

### For Implementation
1. Check `brand-guidelines.md` for colors, typography, spacing
2. Reference `component-library.md` for component specs
3. Check `mockups/` folder for visual reference
4. Follow `ux-patterns.md` for interaction patterns

### Adding New Designs
1. Add Figma screenshots to appropriate `mockups/` subfolder
2. Update component specs in `component-library.md`
3. Document any new patterns in `ux-patterns.md`
4. Keep this README updated

### Design Review Checklist
- [ ] Uses Optio brand gradient correctly
- [ ] Follows core philosophy messaging
- [ ] Mobile-responsive design
- [ ] Accessible (WCAG 2.1 AA minimum)
- [ ] No emojis in UI
- [ ] Consistent with existing component library

## Key Pages

### Core Features (Priority Order)
1. **Diploma Page** - CORE PRODUCT - Students showcase on resumes
2. **Quest Hub** - Quest discovery and browsing
3. **Dashboard** - User progress and activity
4. **Homepage** - Landing and conversion
5. **Admin Panel** - Platform management

### Supporting Pages
- Profile Management
- Subscription Management
- Community/Friends (paid tier)
- Quest Detail Pages
- Authentication Pages

## Resources

- [Core Philosophy](../core_philosophy.md) - Essential UX messaging
- [CLAUDE.md](../CLAUDE.md) - Technical documentation
- Figma: [Add link here]
- Brand Assets:
  - Logos: `design-system/mockups/logo_types/`
  - Favicon: Supabase Storage

## Logo Assets

**Full Color Logos** (Primary Use)
- `OptioLogo-FullColor.svg` - Vector format (preferred)
- `OptioLogo-FullColor.png` - Raster format
- `Large-OptioLogo-FullColor.png` - High resolution

**Single Color Logos** (Monochrome)
- `OptioLogo-SingleColor.svg` - Vector format
- `OptioLogo-SingleColor.png` - Raster format
- `Large-OptioLogo-SingleColor.png` - High resolution

All logo files located in: [mockups/logo_types/](mockups/logo_types/)

## Maintenance

This design system should be updated:
- When implementing new Figma mockups
- When creating new reusable components
- When brand guidelines change
- When UX patterns evolve

**Last Updated**: 2025-10-11
