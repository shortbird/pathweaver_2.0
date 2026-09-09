// Typography utility classes for consistent text styling across the app

export const typography = {
  // Headers
  h1: 'text-4xl font-bold tracking-tight',
  h2: 'text-3xl font-bold tracking-tight',
  h3: 'text-2xl font-semibold',
  h4: 'text-xl font-semibold',
  h5: 'text-lg font-semibold',
  h6: 'text-base font-semibold',

  // Body text
  body: 'text-base leading-relaxed',
  bodyLarge: 'text-lg leading-relaxed',
  bodySmall: 'text-sm leading-relaxed',

  // Special text
  caption: 'text-xs text-gray-500',
  label: 'text-sm font-medium text-gray-700',
  link: 'text-sm text-blue-600 hover:text-blue-800 underline',

  // Display text (for hero sections)
  display1: 'text-5xl font-bold tracking-tight',
  display2: 'text-6xl font-bold tracking-tight',

  // Code/monospace
  code: 'font-mono text-sm bg-gray-100 px-1 py-0.5 rounded',
  codeBlock: 'font-mono text-sm bg-gray-900 text-gray-100 p-4 rounded-lg'
};

// Helper function to combine typography with additional classes
export const withTypography = (typographyKey, additionalClasses = '') => {
  return `${typography[typographyKey] || ''} ${additionalClasses}`.trim();
};

// Text color utilities
export const textColors = {
  primary: 'text-gray-900',
  secondary: 'text-gray-600',
  tertiary: 'text-gray-500',
  muted: 'text-gray-400',
  success: 'text-green-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
  info: 'text-blue-600'
};
