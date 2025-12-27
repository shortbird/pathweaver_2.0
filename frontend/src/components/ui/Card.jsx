import React from 'react';

/**
 * Card Component - Reusable container with consistent styling
 *
 * Replaces 37+ instances of white rounded card containers
 *
 * @param {React.ReactNode} children - Card content
 * @param {string} variant - Card style: 'elevated' | 'outlined' | 'flat' (default: 'elevated')
 * @param {string} padding - Padding size: 'none' | 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Optional click handler (makes card clickable)
 * @param {boolean} hoverable - Add hover effect (default: false)
 */
export const Card = ({
  children,
  variant = 'elevated',
  padding = 'md',
  className = '',
  onClick,
  hoverable = false
}) => {
  const variants = {
    elevated: 'bg-white rounded-xl shadow-lg border border-gray-200',
    outlined: 'bg-white rounded-lg shadow-sm border border-gray-200',
    flat: 'bg-white rounded-lg border border-gray-200'
  };

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };

  const hoverClass = hoverable || onClick ? 'hover:shadow-xl transition-shadow cursor-pointer' : '';

  const handleKeyDown = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <div
      className={`${variants[variant]} ${paddings[padding]} ${hoverClass} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};

/**
 * CardHeader - Card header with optional gradient background
 *
 * @param {React.ReactNode} children - Header content
 * @param {boolean} gradient - Use gradient background (default: false)
 * @param {string} className - Additional CSS classes
 */
export const CardHeader = ({
  children,
  gradient = false,
  className = ''
}) => {
  const gradientClass = gradient
    ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white p-6 -m-6 mb-6 rounded-t-xl'
    : 'pb-4 border-b border-gray-200';

  return (
    <div className={`${gradientClass} ${className}`}>
      {children}
    </div>
  );
};

/**
 * CardBody - Card body content wrapper
 *
 * @param {React.ReactNode} children - Body content
 * @param {string} className - Additional CSS classes
 */
export const CardBody = ({
  children,
  className = ''
}) => (
  <div className={className}>
    {children}
  </div>
);

/**
 * CardFooter - Card footer section
 *
 * @param {React.ReactNode} children - Footer content
 * @param {string} className - Additional CSS classes
 * @param {boolean} border - Show top border (default: true)
 */
export const CardFooter = ({
  children,
  className = '',
  border = true
}) => {
  const borderClass = border ? 'pt-4 border-t border-gray-200' : '';

  return (
    <div className={`${borderClass} ${className}`}>
      {children}
    </div>
  );
};

/**
 * CardTitle - Styled title for card headers
 *
 * @param {React.ReactNode} children - Title text
 * @param {string} size - Size: 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} className - Additional CSS classes
 */
export const CardTitle = ({
  children,
  size = 'md',
  className = ''
}) => {
  const sizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  return (
    <h3 className={`font-bold ${sizes[size]} ${className}`}>
      {children}
    </h3>
  );
};

export default Card;
