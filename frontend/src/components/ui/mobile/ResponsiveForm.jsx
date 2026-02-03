import React from 'react';

/**
 * ResponsiveForm Component - Form container with responsive grid layout
 *
 * Integrates with existing FormField component. Automatically stacks to single column on mobile.
 * Fixes multi-column forms that don't adapt to mobile screens.
 *
 * @param {React.ReactNode} children - Form fields (ResponsiveFormField components)
 * @param {number} columns - Number of columns on desktop: 1-4 (always 1 on mobile, default: 2)
 * @param {string} gap - Gap between fields: 'sm' | 'md' | 'lg' (default: 'md')
 * @param {Function} onSubmit - Form submit handler
 * @param {React.ReactNode} footer - Form footer content (buttons, etc.)
 * @param {boolean} stickyFooter - Stick footer to bottom on mobile with safe-area padding (default: false)
 * @param {string} className - Additional CSS classes
 */
export const ResponsiveForm = ({
  children,
  columns = 2,
  gap = 'md',
  onSubmit,
  footer,
  stickyFooter = false,
  className = ''
}) => {
  const gaps = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6'
  };

  const gridCols = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4'
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className={`grid grid-cols-1 ${gridCols[columns]} ${gaps[gap]}`}>
        {children}
      </div>

      {footer && (
        <div
          className={`
            mt-6
            ${stickyFooter ? 'md:relative md:mt-6 fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4 md:border-0 md:p-0' : ''}
          `}
          style={stickyFooter ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : {}}
        >
          {footer}
        </div>
      )}
    </form>
  );
};

/**
 * ResponsiveFormField Component - Grid item wrapper for form fields
 *
 * Use with ResponsiveForm to control field spanning and layout.
 * Works with existing FormField component from frontend/src/components/ui/FormField.jsx
 *
 * @param {React.ReactNode} children - Form field content (typically FormField)
 * @param {number|string} span - Column span: 1-4 or 'full' (default: 1)
 * @param {string} className - Additional CSS classes
 */
export const ResponsiveFormField = ({
  children,
  span = 1,
  className = ''
}) => {
  const spans = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4',
    full: 'col-span-full'
  };

  const spanClass = typeof span === 'number' ? spans[span] : spans[span] || spans[1];

  return (
    <div className={`${spanClass} ${className}`}>
      {children}
    </div>
  );
};

export default ResponsiveForm;
