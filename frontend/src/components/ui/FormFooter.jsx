import React from 'react';

/**
 * FormFooter Component - Standardized form action buttons
 *
 * Replaces 20+ instances of cancel/submit button layouts
 *
 * @param {function} onCancel - Cancel button handler
 * @param {function} onSubmit - Submit button handler (if not using form submission)
 * @param {string} cancelText - Cancel button text (default: 'Cancel')
 * @param {string} submitText - Submit button text (default: 'Submit')
 * @param {boolean} isSubmitting - Loading state for submit button (default: false)
 * @param {boolean} disabled - Disable submit button (default: false)
 * @param {string} submitVariant - Submit button style: 'primary' | 'danger' | 'success' (default: 'primary')
 * @param {boolean} showCancel - Show cancel button (default: true)
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Custom footer content (overrides default buttons)
 */
export const FormFooter = ({
  onCancel,
  onSubmit,
  cancelText = 'Cancel',
  submitText = 'Submit',
  isSubmitting = false,
  disabled = false,
  submitVariant = 'primary',
  showCancel = true,
  className = '',
  children
}) => {
  const submitVariants = {
    primary: 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:shadow-lg',
    danger: 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg',
    success: 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg'
  };

  if (children) {
    return <div className={`flex gap-3 pt-4 ${className}`}>{children}</div>;
  }

  return (
    <div className={`flex flex-col sm:flex-row gap-3 pt-4 ${className}`}>
      {showCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto sm:flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] touch-manipulation"
          disabled={isSubmitting}
        >
          {cancelText}
        </button>
      )}
      <button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={disabled || isSubmitting}
        className={`w-full sm:w-auto sm:flex-1 px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation ${submitVariants[submitVariant]}`}
      >
        {isSubmitting ? 'Loading...' : submitText}
      </button>
    </div>
  );
};

export default FormFooter;
