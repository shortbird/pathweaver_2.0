# Optio Component Library

**Visual References**: See [mockups/MOCKUPS_INDEX.md](mockups/MOCKUPS_INDEX.md) for component screenshots

## Buttons

### Primary Button (Gradient)
```jsx
<button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white
                   px-6 py-3 rounded-lg font-semibold font-['Poppins']
                   hover:from-[#5a3a82] hover:to-[#d84567]
                   transform hover:-translate-y-0.5 hover:shadow-lg
                   transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-[#6D469B] focus:ring-offset-2">
  Button Text
</button>
```

### Secondary Button (Outline)
```jsx
<button className="border-2 border-[#6D469B] text-[#6D469B]
                   px-6 py-3 rounded-lg font-semibold font-['Poppins']
                   hover:bg-[#6D469B] hover:text-white
                   transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-[#6D469B] focus:ring-offset-2">
  Button Text
</button>
```

### Ghost Button
```jsx
<button className="text-[#3B383C] px-6 py-3 rounded-lg font-semibold font-['Poppins']
                   hover:bg-[#EEEBEF]
                   transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-[#BAB4BB] focus:ring-offset-2">
  Button Text
</button>
```

### Small Button
```jsx
<button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white
                   px-4 py-2 rounded-lg text-sm font-medium font-['Poppins']
                   hover:shadow-md transition-all duration-200">
  Small Button
</button>
```

### Pillar-Specific Button
```jsx
{/* STEM Pillar Button Example */}
<button className="bg-[#2469D1] text-white
                   px-6 py-3 rounded-lg font-semibold font-['Poppins']
                   hover:bg-[#18309C] transition-all duration-200">
  STEM Quest
</button>

{/* Use pillar-specific colors from brand-guidelines.md */}
```

### Icon Button
```jsx
<button className="p-2 rounded-lg hover:bg-[#EEEBEF] transition-all duration-200
                   focus:outline-none focus:ring-2 focus:ring-[#BAB4BB]">
  <svg className="w-5 h-5 text-[#605C61]" />
</button>
```

## Cards

**Reference**: See [quest_card.png](mockups/components/quest_card.png) and [badge_card.png](mockups/components/badge_card.png)

### Standard Card
```jsx
<div className="bg-white rounded-lg shadow-md p-6
                hover:shadow-lg transform hover:-translate-y-1
                transition-all duration-200">
  {/* Card content */}
</div>
```

### Quest Card (Pillar-Specific)
```jsx
{/* STEM Quest Card Example */}
<div className="bg-white rounded-lg shadow-md overflow-hidden
                hover:shadow-lg transform hover:-translate-y-1
                transition-all duration-200">
  {/* Pillar gradient header */}
  <div className="h-2 bg-gradient-to-r from-[#F3EFF4] to-[#DDF1FC]"></div>

  <img src="..." alt="..." className="w-full h-48 object-cover" />

  <div className="p-6">
    {/* Pillar badge */}
    <span className="inline-block bg-[#2469D1] text-white px-2 py-1 rounded text-xs font-semibold font-['Poppins'] mb-2">
      STEM & Logic
    </span>

    <h3 className="text-xl font-semibold font-['Poppins'] text-[#1B191B] mb-2">Quest Title</h3>
    <p className="text-[#605C61] font-['Poppins'] font-medium mb-4">Quest description...</p>

    <div className="flex items-center justify-between">
      <span className="text-sm text-[#908B92] font-['Inter'] font-bold">500 XP</span>
      <button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                         text-white px-4 py-2 rounded-lg text-sm font-['Poppins'] font-semibold">
        Start Quest
      </button>
    </div>
  </div>
</div>
```

### Badge Card
```jsx
{/* Achievement/Badge Card */}
<div className="bg-white rounded-lg shadow-md p-6 text-center
                hover:shadow-lg transform hover:-translate-y-1
                transition-all duration-200">
  {/* Badge icon/image */}
  <div className="w-24 h-24 mx-auto mb-4">
    <img src="badge-icon.png" alt="Badge" className="w-full h-full object-contain" />
  </div>

  {/* Badge title */}
  <h3 className="text-lg font-bold font-['Poppins'] text-[#1B191B] mb-2">Badge Name</h3>

  {/* Badge description */}
  <p className="text-sm text-[#605C61] font-['Poppins'] font-medium mb-4">
    Complete 10 STEM quests
  </p>

  {/* Progress or earned indicator */}
  <div className="inline-block bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                  text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
    Earned
  </div>
</div>
```

### Subscription Tier Card
```jsx
<div className="bg-white rounded-lg shadow-lg p-8 flex flex-col h-full">
  {/* Optional badge at top */}
  <div className="text-center mb-4">
    <span className="bg-[#3DA24A] text-white px-3 py-1 rounded-full text-sm font-semibold font-['Poppins']">
      ACCREDITED
    </span>
  </div>

  {/* Tier header */}
  <div className="text-center mb-6">
    <h3 className="text-2xl font-bold font-['Poppins'] text-[#1B191B] mb-2">Tier Name</h3>
    <div className="text-4xl font-bold font-['Inter'] bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                    bg-clip-text text-transparent">
      $39.99<span className="text-xl">/mo</span>
    </div>
  </div>

  {/* Features list */}
  <ul className="space-y-3 mb-8 flex-grow">
    <li className="flex items-start">
      <svg className="w-5 h-5 text-[#3DA24A] mr-2 mt-0.5" />
      <span className="text-[#3B383C] font-['Poppins'] font-medium">Feature description</span>
    </li>
  </ul>

  {/* CTA button at bottom */}
  <button className="w-full bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                     text-white py-3 rounded-lg font-semibold font-['Poppins']
                     hover:shadow-lg transition-all duration-200">
    Get Started
  </button>
</div>
```

## Forms

### Text Input
```jsx
<div className="mb-4">
  <label className="block text-sm font-medium font-['Poppins'] text-[#3B383C] mb-2">
    Label
  </label>
  <input
    type="text"
    className="w-full px-4 py-2 border border-[#BAB4BB] rounded-lg
               font-['Poppins'] font-medium text-[#1B191B]
               focus:outline-none focus:ring-2 focus:ring-[#6D469B] focus:border-transparent
               transition-all duration-200
               placeholder:text-[#908B92]"
    placeholder="Enter text..."
  />
</div>
```

### Textarea
```jsx
<div className="mb-4">
  <label className="block text-sm font-medium font-['Poppins'] text-[#3B383C] mb-2">
    Label
  </label>
  <textarea
    rows="4"
    className="w-full px-4 py-2 border border-[#BAB4BB] rounded-lg
               font-['Poppins'] font-medium text-[#1B191B]
               focus:outline-none focus:ring-2 focus:ring-[#6D469B] focus:border-transparent
               transition-all duration-200
               placeholder:text-[#908B92]"
    placeholder="Enter text..."
  />
</div>
```

### Select Dropdown
```jsx
<div className="mb-4">
  <label className="block text-sm font-medium font-['Poppins'] text-[#3B383C] mb-2">
    Label
  </label>
  <select
    className="w-full px-4 py-2 border border-[#BAB4BB] rounded-lg
               font-['Poppins'] font-medium text-[#1B191B]
               focus:outline-none focus:ring-2 focus:ring-[#6D469B] focus:border-transparent
               transition-all duration-200"
  >
    <option>Option 1</option>
    <option>Option 2</option>
  </select>
</div>
```

### Checkbox
```jsx
<label className="flex items-center cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 text-[#6D469B] border-[#BAB4BB] rounded
               focus:ring-2 focus:ring-[#6D469B]"
  />
  <span className="ml-2 text-sm text-[#3B383C] font-['Poppins'] font-medium">Checkbox label</span>
</label>
```

### Radio Button
```jsx
<label className="flex items-center cursor-pointer">
  <input
    type="radio"
    name="group"
    className="w-4 h-4 text-[#6D469B] border-[#BAB4BB]
               focus:ring-2 focus:ring-[#6D469B]"
  />
  <span className="ml-2 text-sm text-[#3B383C] font-['Poppins'] font-medium">Radio label</span>
</label>
```

## Badges

**Reference**: See [badge_card.png](mockups/components/badge_card.png)

### Status Badge
```jsx
<span className="px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']
                 bg-[#D1EED3] text-[#177A12]">
  Active
</span>
```

### Tier Badge (Accredited)
```jsx
<span className="bg-[#3DA24A] text-white px-3 py-1 rounded-full text-sm font-semibold font-['Poppins']">
  ACCREDITED
</span>
```

### XP Badge
```jsx
<span className="bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                 text-white px-3 py-1 rounded-full text-sm font-semibold font-['Inter']">
  500 XP
</span>
```

### Pillar Badges
```jsx
{/* STEM Badge */}
<span className="bg-[#2469D1] text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
  STEM & Logic
</span>

{/* ART Badge */}
<span className="bg-[#AF56E5] text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
  Arts & Creativity
</span>

{/* COMMUNICATION Badge */}
<span className="bg-[#3DA24A] text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
  Language & Communication
</span>

{/* LIFE Badge */}
<span className="bg-[#E65C5C] text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
  Life & Wellness
</span>

{/* SOCIETY Badge */}
<span className="bg-[#FF9028] text-white px-3 py-1 rounded-full text-xs font-semibold font-['Poppins']">
  Society & Culture
</span>
```

## Navigation

**Reference**: See [navbar.png](mockups/components/navbar.png)

### Top Navigation Bar
```jsx
<nav className="bg-white shadow-sm">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex justify-between items-center h-16">
      {/* Logo */}
      <div className="flex items-center">
        <img src="OptioLogo-FullColor.svg" alt="Optio" className="h-8 w-auto" />
      </div>

      {/* Nav links */}
      <div className="hidden md:flex items-center space-x-8">
        <a href="#" className="text-[#3B383C] font-['Poppins'] font-medium
                              hover:text-[#6D469B] transition-colors">
          Dashboard
        </a>
        <a href="#" className="text-[#3B383C] font-['Poppins'] font-medium
                              hover:text-[#6D469B] transition-colors">
          Quests
        </a>
      </div>

      {/* User menu */}
      <div className="flex items-center">
        {/* User dropdown */}
      </div>
    </div>
  </div>
</nav>
```

### Sidebar Navigation
```jsx
<aside className="bg-white w-64 min-h-screen shadow-md">
  <div className="p-6">
    <nav className="space-y-2">
      <a href="#"
         className="flex items-center px-4 py-3 rounded-lg
                    text-[#3B383C] font-['Poppins'] font-medium
                    hover:bg-[#EEEBEF]
                    transition-colors duration-200">
        <svg className="w-5 h-5 mr-3 text-[#605C61]" />
        <span>Dashboard</span>
      </a>
      {/* More nav items */}
    </nav>
  </div>
</aside>
```

## Modals

### Standard Modal
```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
    {/* Header */}
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold font-['Poppins'] text-[#1B191B]">Modal Title</h2>
      <button className="text-[#908B92] hover:text-[#3B383C]">
        <svg className="w-6 h-6" /> {/* Close icon */}
      </button>
    </div>

    {/* Content */}
    <div className="mb-6">
      <p className="text-[#605C61] font-['Poppins'] font-medium">Modal content goes here...</p>
    </div>

    {/* Actions */}
    <div className="flex justify-end space-x-3">
      <button className="px-4 py-2 text-[#3B383C] font-['Poppins'] font-semibold
                         hover:bg-[#EEEBEF] rounded-lg">
        Cancel
      </button>
      <button className="px-4 py-2 bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                         text-white font-['Poppins'] font-semibold rounded-lg hover:shadow-lg">
        Confirm
      </button>
    </div>
  </div>
</div>
```

## Alerts

### Success Alert
```jsx
<div className="bg-[#D1EED3] border border-[#3DA24A] rounded-lg p-4 flex items-start">
  <svg className="w-5 h-5 text-[#177A12] mr-3 mt-0.5" />
  <div>
    <h4 className="font-semibold font-['Poppins'] text-[#0B1B0C]">Success!</h4>
    <p className="text-[#233E0B] font-['Poppins'] font-medium text-sm">
      Your action was completed successfully.
    </p>
  </div>
</div>
```

### Error Alert
```jsx
<div className="bg-[#FCD8D8] border border-[#E65C5C] rounded-lg p-4 flex items-start">
  <svg className="w-5 h-5 text-[#9C1818] mr-3 mt-0.5" />
  <div>
    <h4 className="font-semibold font-['Poppins'] text-[#1E0B0B]">Error</h4>
    <p className="text-[#4E1421] font-['Poppins'] font-medium text-sm">
      Something went wrong. Please try again.
    </p>
  </div>
</div>
```

### Info Alert
```jsx
<div className="bg-[#DDF1FC] border border-[#2469D1] rounded-lg p-4 flex items-start">
  <svg className="w-5 h-5 text-[#18309C] mr-3 mt-0.5" />
  <div>
    <h4 className="font-semibold font-['Poppins'] text-[#05121C]">Information</h4>
    <p className="text-[#141652] font-['Poppins'] font-medium text-sm">
      Here's some helpful information.
    </p>
  </div>
</div>
```

## Loading States

### Spinner
```jsx
<div className="flex justify-center items-center">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6D469B]"></div>
</div>
```

### Skeleton Loading
```jsx
<div className="animate-pulse">
  <div className="h-4 bg-[#EEEBEF] rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-[#EEEBEF] rounded w-1/2"></div>
</div>
```

## Progress Indicators

### Progress Bar
```jsx
<div className="w-full bg-[#EEEBEF] rounded-full h-2">
  <div className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] h-2 rounded-full"
       style={{ width: '60%' }}>
  </div>
</div>
```

### Pillar-Specific Progress Bar
```jsx
{/* STEM Progress */}
<div className="w-full bg-[#EEEBEF] rounded-full h-3">
  <div className="bg-[#2469D1] h-3 rounded-full transition-all duration-300"
       style={{ width: '60%' }}>
  </div>
</div>
```

### Circular Progress (XP Radar Chart)
```jsx
{/* See DiplomaPage.jsx for radar chart implementation */}
{/* Use pillar-specific colors for each axis */}
```

## Empty States

### No Data
```jsx
<div className="text-center py-12">
  <svg className="w-16 h-16 text-[#BAB4BB] mx-auto mb-4" />
  <h3 className="text-xl font-semibold font-['Poppins'] text-[#1B191B] mb-2">No quests yet</h3>
  <p className="text-[#605C61] font-['Poppins'] font-medium mb-6">
    Start your first quest to begin your journey.
  </p>
  <button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B]
                     text-white px-6 py-3 rounded-lg font-['Poppins'] font-semibold">
    Browse Quests
  </button>
</div>
```

## Usage Guidelines

### Visual References
- Check [mockups/](mockups/) folder for component screenshots
- Match colors and spacing exactly as shown in mockups
- Reference [brand-guidelines.md](brand-guidelines.md) for complete color palette

### Responsive Design
- All components should work on mobile, tablet, and desktop
- Use Tailwind responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`
- Test touch targets on mobile (minimum 44x44px)

### Accessibility
- Include proper ARIA labels
- Ensure keyboard navigation works
- Maintain focus states
- Use semantic HTML

### Typography
- Use Poppins (Bold, Semi-Bold, Medium) for UI text
- Use Inter (Bold, Regular) for alphanumeric strings only
- Never use light or thin font weights
- See [brand-guidelines.md](brand-guidelines.md) for details

### Performance
- Lazy load images where possible
- Use proper React keys in lists
- Avoid unnecessary re-renders
- Implement proper loading states

### Consistency
- Use these exact components across the app
- Don't create variations unless necessary
- Update this library when creating new patterns
- Follow spacing and color guidelines from brand-guidelines.md
