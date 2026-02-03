# UI Component Library

**Date Created**: December 19, 2025
**Status**: Active - Ready for use in all new components
**Impact**: Replaces 400+ duplicate className patterns across 213 components

---

## Overview

This UI component library provides reusable primitive components with consistent styling across the Optio platform. All components follow the Optio brand guidelines (optio-purple/optio-pink colors) and provide a standardized API.

### Benefits

- **Consistency**: All components use the same design tokens and patterns
- **Maintainability**: Update styling in one place instead of 100+ files
- **Developer Experience**: Simple, predictable APIs with TypeScript-style prop documentation
- **Bundle Size**: Reduces duplicate CSS classes
- **Accessibility**: Built-in ARIA attributes and keyboard navigation

---

## Installation

```javascript
// Import individual components
import { Modal, Alert, Card } from '@/components/ui';

// Or import specific sub-components
import { Modal, ModalFooter } from '@/components/ui';
```

---

## Components

### 1. Modal

**Replaces**: 68+ instances of fixed inset-0 modal pattern

**Basic Usage**:
```jsx
import { Modal } from '@/components/ui';

<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="My Modal"
  size="md"
>
  <p>Modal content goes here</p>
</Modal>
```

**With Custom Header**:
```jsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  size="lg"
  header={
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-white" />
      <h2 className="text-2xl font-bold text-white">Custom Header</h2>
    </div>
  }
>
  <p>Content</p>
</Modal>
```

**With Footer**:
```jsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Action"
  footer={
    <div className="flex gap-3">
      <button onClick={handleClose}>Cancel</button>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  }
>
  <p>Are you sure?</p>
</Modal>
```

**Props**:
- `isOpen` (boolean, required): Controls modal visibility
- `onClose` (function, required): Close handler
- `title` (string): Modal title (ignored if header is provided)
- `header` (ReactNode): Custom header content
- `children` (ReactNode, required): Modal body content
- `footer` (ReactNode): Footer content
- `size` (string): 'sm' | 'md' | 'lg' | 'xl' | 'full' (default: 'md')
- `showCloseButton` (boolean): Show X button (default: true)
- `closeOnOverlayClick` (boolean): Close on overlay click (default: true)
- `headerClassName` (string): Additional header classes
- `bodyClassName` (string): Additional body classes
- `footerClassName` (string): Additional footer classes

**Features**:
- Automatic Escape key handling
- Body scroll lock when open
- Overlay click to close (optional)
- Responsive sizing
- Custom header/footer slots

---

### 2. Alert

**Replaces**: 57+ instances of alert/notification boxes

**Basic Usage**:
```jsx
import { Alert } from '@/components/ui';

<Alert variant="info">
  This is an informational message.
</Alert>
```

**With Title**:
```jsx
<Alert variant="warning" title="Warning">
  Please review your submission before continuing.
</Alert>
```

**Variants**:
```jsx
<Alert variant="info">Blue info alert</Alert>
<Alert variant="success">Green success alert</Alert>
<Alert variant="warning">Yellow warning alert</Alert>
<Alert variant="error">Red error alert</Alert>
<Alert variant="purple">Purple Optio-branded alert</Alert>
```

**Custom Icon**:
```jsx
import { Star } from 'lucide-react';

<Alert variant="success" icon={<Star className="w-5 h-5" />}>
  Custom icon alert
</Alert>
```

**Props**:
- `variant` (string): 'info' | 'success' | 'warning' | 'error' | 'purple' (default: 'info')
- `title` (string): Optional title text
- `children` (ReactNode, required): Alert message content
- `showIcon` (boolean): Show icon (default: true)
- `icon` (ReactNode): Custom icon (overrides default)
- `className` (string): Additional CSS classes

---

### 3. Card

**Replaces**: 37+ instances of white rounded card containers

**Basic Usage**:
```jsx
import { Card } from '@/components/ui';

<Card>
  <h3>Card Title</h3>
  <p>Card content</p>
</Card>
```

**With Variants**:
```jsx
<Card variant="elevated">Elevated card with shadow-lg</Card>
<Card variant="outlined">Outlined card with shadow-sm</Card>
<Card variant="flat">Flat card with no shadow</Card>
```

**With Padding Control**:
```jsx
<Card padding="none">No padding (for full-width images)</Card>
<Card padding="sm">Small padding (p-4)</Card>
<Card padding="md">Medium padding (p-6, default)</Card>
<Card padding="lg">Large padding (p-8)</Card>
```

**With Sub-components**:
```jsx
import { Card, CardHeader, CardBody, CardFooter, CardTitle } from '@/components/ui';

<Card>
  <CardHeader gradient>
    <CardTitle>Card with Gradient Header</CardTitle>
  </CardHeader>
  <CardBody>
    <p>Main content</p>
  </CardBody>
  <CardFooter>
    <button>Action</button>
  </CardFooter>
</Card>
```

**Clickable Card**:
```jsx
<Card hoverable onClick={handleClick}>
  Click me!
</Card>
```

**Props**:

**Card**:
- `children` (ReactNode, required): Card content
- `variant` (string): 'elevated' | 'outlined' | 'flat' (default: 'elevated')
- `padding` (string): 'none' | 'sm' | 'md' | 'lg' (default: 'md')
- `className` (string): Additional CSS classes
- `onClick` (function): Click handler (makes card clickable)
- `hoverable` (boolean): Add hover effect (default: false)

**CardHeader**:
- `children` (ReactNode, required): Header content
- `gradient` (boolean): Use gradient background (default: false)
- `className` (string): Additional CSS classes

**CardFooter**:
- `children` (ReactNode, required): Footer content
- `border` (boolean): Show top border (default: true)
- `className` (string): Additional CSS classes

**CardTitle**:
- `children` (ReactNode, required): Title text
- `size` (string): 'sm' | 'md' | 'lg' (default: 'md')
- `className` (string): Additional CSS classes

---

### 4. Input Components

**Replaces**: 80+ inconsistent input implementations

**Input**:
```jsx
import { Input } from '@/components/ui';

<Input
  type="text"
  value={value}
  onChange={handleChange}
  placeholder="Enter text"
/>
```

**Textarea**:
```jsx
import { Textarea } from '@/components/ui';

<Textarea
  value={value}
  onChange={handleChange}
  placeholder="Enter description"
  rows={4}
/>
```

**Select**:
```jsx
import { Select } from '@/components/ui';

<Select
  value={value}
  onChange={handleChange}
  placeholder="Select an option"
  options={[
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' }
  ]}
/>

// Or with children
<Select value={value} onChange={handleChange}>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</Select>
```

**With Error State**:
```jsx
<Input
  type="email"
  value={email}
  onChange={handleChange}
  error={!!errors.email}
  errorMessage={errors.email}
/>
```

**Props** (shared across Input, Textarea, Select):
- `value` (string, required): Input value
- `onChange` (function, required): Change handler
- `placeholder` (string): Placeholder text
- `required` (boolean): Required field (default: false)
- `disabled` (boolean): Disabled state (default: false)
- `error` (boolean): Error state (default: false)
- `errorMessage` (string): Error message to display
- `className` (string): Additional CSS classes

**Input-specific**:
- `type` (string): Input type (default: 'text')

**Textarea-specific**:
- `rows` (number): Number of rows (default: 4)

**Select-specific**:
- `options` (array): Options array [{ value, label }]
- `children` (ReactNode): Custom option elements

---

### 5. FormField

**Replaces**: 80+ duplicate label+input patterns

**Basic Usage**:
```jsx
import { FormField } from '@/components/ui';

<FormField
  label="Email Address"
  required
  type="email"
  inputProps={{
    value: email,
    onChange: handleChange,
    placeholder: 'you@example.com'
  }}
/>
```

**With Textarea**:
```jsx
<FormField
  label="Description"
  type="textarea"
  helperText="Provide a detailed description"
  inputProps={{
    value: description,
    onChange: handleChange,
    rows: 6
  }}
/>
```

**With Select**:
```jsx
<FormField
  label="Category"
  type="select"
  required
  inputProps={{
    value: category,
    onChange: handleChange,
    options: [
      { value: 'cat1', label: 'Category 1' },
      { value: 'cat2', label: 'Category 2' }
    ]
  }}
/>
```

**With Error**:
```jsx
<FormField
  label="Password"
  type="password"
  required
  errorMessage={errors.password}
  inputProps={{
    value: password,
    onChange: handleChange
  }}
/>
```

**With Custom Input**:
```jsx
<FormField label="Custom Field" required>
  <CustomInputComponent />
</FormField>
```

**Props**:
- `label` (string): Field label text
- `required` (boolean): Show required indicator (default: false)
- `helperText` (string): Helper text below input
- `errorMessage` (string): Error message (displays in red)
- `type` (string): 'text' | 'email' | 'password' | 'textarea' | 'select' (default: 'text')
- `children` (ReactNode): Custom input (overrides default)
- `className` (string): Additional CSS classes for wrapper
- `inputProps` (object): Props to pass to the input component

---

### 6. FormFooter

**Replaces**: 20+ instances of cancel/submit button layouts

**Basic Usage**:
```jsx
import { FormFooter } from '@/components/ui';

<FormFooter
  onCancel={handleCancel}
  cancelText="Cancel"
  submitText="Submit"
  isSubmitting={isSubmitting}
/>
```

**With Different Variants**:
```jsx
<FormFooter
  onCancel={handleCancel}
  submitText="Delete"
  submitVariant="danger"
  isSubmitting={isDeleting}
/>
```

**Without Cancel Button**:
```jsx
<FormFooter
  showCancel={false}
  submitText="Continue"
  onSubmit={handleSubmit}
/>
```

**Custom Footer**:
```jsx
<FormFooter>
  <button onClick={handleBack}>Back</button>
  <button onClick={handleSkip}>Skip</button>
  <button onClick={handleNext}>Next</button>
</FormFooter>
```

**Props**:
- `onCancel` (function): Cancel button handler
- `onSubmit` (function): Submit button handler (if not using form submission)
- `cancelText` (string): Cancel button text (default: 'Cancel')
- `submitText` (string): Submit button text (default: 'Submit')
- `isSubmitting` (boolean): Loading state (default: false)
- `disabled` (boolean): Disable submit button (default: false)
- `submitVariant` (string): 'primary' | 'danger' | 'success' (default: 'primary')
- `showCancel` (boolean): Show cancel button (default: true)
- `className` (string): Additional CSS classes
- `children` (ReactNode): Custom footer content (overrides default buttons)

---

## Migration Guide

### Before (Old Pattern):
```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
  <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
    <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
      <h2 className="text-2xl font-bold">Title</h2>
    </div>
    <div className="p-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">Info message</p>
      </div>
      <input
        type="text"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
      />
    </div>
  </div>
</div>
```

### After (New Pattern):
```jsx
import { Modal, Alert, FormField } from '@/components/ui';

<Modal isOpen={isOpen} onClose={handleClose} title="Title">
  <Alert variant="info">Info message</Alert>
  <FormField
    label="Field Label"
    inputProps={{ value, onChange: handleChange }}
  />
</Modal>
```

**Result**: 20+ lines reduced to 7 lines, zero duplicate className patterns.

---

## Real-World Examples

### Example 1: AddDependentModal (MIGRATED)

**File**: `frontend/src/components/parent/AddDependentModal.jsx`

**Before**: 254 lines with duplicate modal, alert, and input patterns
**After**: 215 lines using Modal, Alert, FormField, FormFooter
**Reduction**: 39 lines, 100+ duplicate classNames eliminated

**Key Changes**:
- Replaced entire modal wrapper with `<Modal>`
- Replaced 3 alert boxes with `<Alert variant>`
- Replaced 3 input fields with `<FormField>`
- Replaced form footer with `<FormFooter>`

### Example 2: BadgeInfoModal (MIGRATED)

**File**: `frontend/src/components/badges/BadgeInfoModal.jsx`

**Before**: 152 lines with duplicate modal and alert patterns
**After**: 142 lines using Modal, Alert
**Reduction**: 10 lines, 50+ duplicate classNames eliminated

**Key Changes**:
- Replaced modal wrapper with `<Modal>` with custom header
- Replaced 2 alert boxes with `<Alert variant>`

---

## Best Practices

### 1. Always Use UI Components for New Features
```jsx
// DON'T create custom modals
<div className="fixed inset-0...">...</div>

// DO use Modal component
<Modal isOpen={isOpen} onClose={handleClose}>...</Modal>
```

### 2. Prefer Composition Over Custom Styling
```jsx
// DON'T add custom className for variants
<Alert className="bg-red-50 border-red-200">Error</Alert>

// DO use built-in variants
<Alert variant="error">Error</Alert>
```

### 3. Use FormField for Consistency
```jsx
// DON'T create custom label+input
<label>Email</label>
<input type="email" className="..." />

// DO use FormField
<FormField label="Email" type="email" inputProps={{...}} />
```

### 4. Keep Custom Styling Minimal
```jsx
// OK: Add spacing/layout classes
<Modal className="custom-modal" bodyClassName="space-y-8">

// NOT OK: Override core styles
<Modal bodyClassName="p-0 bg-red-500">  // Breaks consistency
```

---

## Roadmap

### Phase 1 (Complete)
- [x] Modal component
- [x] Alert component
- [x] Card component
- [x] Input/Textarea/Select components
- [x] FormField wrapper
- [x] FormFooter component
- [x] Refactor 2 components (AddDependentModal, BadgeInfoModal)

### Phase 2 (In Progress - 0/36 Complete)
- [ ] Refactor 36 remaining modals to use Modal component
- [ ] Create enforcement ESLint rule (no fixed inset-0 pattern)
- [ ] Update component library with usage metrics

### Phase 3 (Planned)
- [ ] Badge/Pill component
- [ ] Loading Spinner component
- [ ] Stat Box component
- [ ] Button enforcement (169+ hardcoded instances → use existing Button.jsx)

---

## Contributing

When adding new components to this library:

1. **Follow Existing Patterns**: Use the same prop naming conventions
2. **Document Props**: Add JSDoc comments with prop descriptions
3. **Support Variants**: Use a `variant` prop for style variations
4. **Use Brand Colors**: Always use `optio-purple` and `optio-pink`
5. **Add to Barrel Export**: Update `index.js` with new exports
6. **Update This README**: Add usage examples and migration guides

---

## Support

Questions? Check the migrated components for real-world examples:
- [AddDependentModal.jsx](../parent/AddDependentModal.jsx)
- [BadgeInfoModal.jsx](../badges/BadgeInfoModal.jsx)

---

**Last Updated**: December 19, 2025
**Maintained By**: Optio Engineering Team
