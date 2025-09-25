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
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation';
  
  const variants = {
    primary: 'bg-gradient-to-r from-[#6d469b] to-[#8b5cf6] text-white hover:from-[#5c3a82] hover:to-[#7c4dd8] focus:ring-[#6d469b] shadow-md hover:shadow-lg',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-400',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-md hover:shadow-lg',
    success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500 shadow-md hover:shadow-lg',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-400',
    outline: 'border-2 border-[#6d469b] text-[#6d469b] hover:bg-[#6d469b] hover:text-white focus:ring-[#6d469b]'
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