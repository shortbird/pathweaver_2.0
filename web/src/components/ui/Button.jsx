import React, { memo } from 'react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  ...props 
}) => {
  // Variants mirror the .btn-* classes in index.css (docs/design/DESIGN_SYSTEM.md §4).
  const baseClasses = 'inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation';

  const variants = {
    primary: 'rounded-full bg-gradient-primary text-white shadow-[0_4px_20px_rgba(239,89,123,0.15)] hover:shadow-[0_6px_25px_rgba(239,89,123,0.25)] hover:-translate-y-0.5 focus:ring-optio-pink',
    secondary: 'rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-optio-purple hover:text-optio-purple focus:ring-optio-purple',
    danger: 'rounded-lg bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    success: 'rounded-lg bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
    ghost: 'rounded-full bg-transparent hover:bg-optio-purple/5 text-optio-purple focus:ring-optio-purple',
    outline: 'rounded-full border-2 border-optio-purple bg-white text-optio-purple hover:bg-optio-purple/5 focus:ring-optio-purple'
  };

  const sizes = {
    xs: 'px-3 py-2 text-xs min-h-[40px]',
    sm: 'px-4 py-2.5 text-sm min-h-[44px]',
    md: 'px-6 py-3 text-sm min-h-[48px]',
    lg: 'px-8 py-4 text-base min-h-[52px]',
    xl: 'px-10 py-5 text-lg min-h-[56px]'
  };

  const loadingSpinner = (
    <svg 
      className="animate-spin -ml-1 mr-2 h-4 w-4" 
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

  return (
    <button
      type={type}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && loadingSpinner}
      {children}
    </button>
  );
};

export default memo(Button);