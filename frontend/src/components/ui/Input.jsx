import React from 'react';

/**
 * Input Component - Reusable form input with consistent styling
 *
 * Standardizes form input patterns across 80+ instances
 *
 * @param {string} type - Input type (default: 'text')
 * @param {string} value - Input value
 * @param {function} onChange - Change handler
 * @param {string} placeholder - Placeholder text
 * @param {boolean} required - Required field (default: false)
 * @param {boolean} disabled - Disabled state (default: false)
 * @param {boolean} error - Error state (default: false)
 * @param {string} errorMessage - Error message to display
 * @param {string} className - Additional CSS classes
 * @param {object} ...props - Additional input props
 */
export const Input = React.forwardRef(({
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
  className = '',
  ...props
}, ref) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg transition-colors';
  const stateClasses = error
    ? 'border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-optio-purple';
  const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : '';

  return (
    <div className="w-full">
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`${baseClasses} ${stateClasses} ${disabledClasses} ${className}`}
        {...props}
      />
      {error && errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Textarea Component - Multi-line text input with consistent styling
 *
 * @param {string} value - Textarea value
 * @param {function} onChange - Change handler
 * @param {string} placeholder - Placeholder text
 * @param {number} rows - Number of rows (default: 4)
 * @param {boolean} required - Required field (default: false)
 * @param {boolean} disabled - Disabled state (default: false)
 * @param {boolean} error - Error state (default: false)
 * @param {string} errorMessage - Error message to display
 * @param {string} className - Additional CSS classes
 * @param {object} ...props - Additional textarea props
 */
export const Textarea = React.forwardRef(({
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
  className = '',
  ...props
}, ref) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg transition-colors';
  const stateClasses = error
    ? 'border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-optio-purple';
  const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : '';

  return (
    <div className="w-full">
      <textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        className={`${baseClasses} ${stateClasses} ${disabledClasses} resize-vertical ${className}`}
        {...props}
      />
      {error && errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

/**
 * Select Component - Dropdown with consistent styling
 *
 * @param {string} value - Selected value
 * @param {function} onChange - Change handler
 * @param {Array} options - Options array: [{ value, label }]
 * @param {string} placeholder - Placeholder text
 * @param {boolean} required - Required field (default: false)
 * @param {boolean} disabled - Disabled state (default: false)
 * @param {boolean} error - Error state (default: false)
 * @param {string} errorMessage - Error message to display
 * @param {string} className - Additional CSS classes
 * @param {object} ...props - Additional select props
 */
export const Select = React.forwardRef(({
  value,
  onChange,
  options = [],
  placeholder,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
  className = '',
  children,
  ...props
}, ref) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg transition-colors';
  const stateClasses = error
    ? 'border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500'
    : 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-optio-purple';
  const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : '';

  return (
    <div className="w-full">
      <select
        ref={ref}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={`${baseClasses} ${stateClasses} ${disabledClasses} ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children || options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Input;
