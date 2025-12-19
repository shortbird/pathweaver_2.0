import React from 'react';
import { Input, Textarea, Select } from './Input';

/**
 * FormField Component - Wraps input fields with label, helper text, and error handling
 *
 * Provides consistent form field layout across the application
 *
 * @param {string} label - Field label text
 * @param {boolean} required - Show required indicator (default: false)
 * @param {string} helperText - Helper text below input
 * @param {string} errorMessage - Error message (displays in red)
 * @param {string} type - Input type: 'text' | 'email' | 'password' | 'textarea' | 'select' (default: 'text')
 * @param {React.ReactNode} children - Custom input (if not using default Input component)
 * @param {string} className - Additional CSS classes for wrapper
 * @param {object} inputProps - Props to pass to the input component
 */
export const FormField = ({
  label,
  required = false,
  helperText,
  errorMessage,
  type = 'text',
  children,
  className = '',
  inputProps = {}
}) => {
  const hasError = !!errorMessage;

  // Render the appropriate input component
  const renderInput = () => {
    if (children) {
      return children;
    }

    if (type === 'textarea') {
      return <Textarea error={hasError} errorMessage={errorMessage} {...inputProps} />;
    }

    if (type === 'select') {
      return <Select error={hasError} errorMessage={errorMessage} {...inputProps} />;
    }

    return <Input type={type} error={hasError} errorMessage={errorMessage} {...inputProps} />;
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {renderInput()}

      {!errorMessage && helperText && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
};

/**
 * FormLabel - Standalone label component
 *
 * @param {React.ReactNode} children - Label text
 * @param {boolean} required - Show required indicator (default: false)
 * @param {string} htmlFor - Input ID for accessibility
 * @param {string} className - Additional CSS classes
 */
export const FormLabel = ({
  children,
  required = false,
  htmlFor,
  className = ''
}) => (
  <label
    htmlFor={htmlFor}
    className={`block text-sm font-medium text-gray-700 mb-1 ${className}`}
  >
    {children}
    {required && <span className="text-red-500 ml-1">*</span>}
  </label>
);

export default FormField;
