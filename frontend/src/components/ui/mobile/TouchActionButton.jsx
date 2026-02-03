import React, { memo, useState } from 'react';

/**
 * TouchActionButton - Mobile-friendly action button
 * Always visible on mobile, hover-reveal on desktop via TouchActionGroup wrapper
 * Ensures minimum 44px touch target for accessibility
 */
const TouchActionButton = ({
  icon,
  label,
  onClick,
  variant = 'ghost',
  size = 'md',
  loading = false,
  requiresConfirm = false,
  className = '',
  disabled = false,
  ...props
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (e) => {
    if (requiresConfirm && !showConfirm) {
      e.stopPropagation();
      setShowConfirm(true);
      // Auto-hide confirm state after 3 seconds
      setTimeout(() => setShowConfirm(false), 3000);
      return;
    }

    if (onClick) {
      onClick(e);
    }
    setShowConfirm(false);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation';

  const variants = {
    primary: 'bg-gradient-primary text-white hover:opacity-90 focus:ring-[#ef597b] shadow-md hover:shadow-lg',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-md hover:shadow-lg',
    success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500 shadow-md hover:shadow-lg',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-400 border border-gray-300'
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm min-h-[44px] min-w-[44px]',
    md: 'px-4 py-2.5 text-base min-h-[44px] min-w-[44px]',
    lg: 'px-5 py-3 text-lg min-h-[48px] min-w-[48px]'
  };

  const loadingSpinner = (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  if (showConfirm) {
    return (
      <div className="inline-flex gap-1 items-center">
        <button
          type="button"
          className={`${baseClasses} ${variants.danger} ${sizes[size]} ${className}`}
          onClick={handleClick}
          disabled={disabled || loading}
          {...props}
        >
          {loading ? loadingSpinner : icon}
          {label && <span className="ml-1">Confirm?</span>}
        </button>
        <button
          type="button"
          className={`${baseClasses} ${variants.ghost} ${sizes[size]}`}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      {...props}
    >
      {loading ? loadingSpinner : icon}
      {label && <span className="ml-1 hidden sm:inline">{label}</span>}
    </button>
  );
};

/**
 * TouchActionGroup - Wrapper for desktop hover-reveal pattern
 * Makes buttons always visible on mobile, hover-reveal on desktop
 */
export const TouchActionGroup = ({ children, className = '' }) => {
  return (
    <div className={`flex gap-2 items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 ${className}`}>
      {children}
    </div>
  );
};

export default memo(TouchActionButton);
