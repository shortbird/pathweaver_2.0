import React from 'react';
import PropTypes from 'prop-types';

/**
 * TouchToggle - Mobile-friendly toggle/switch component
 *
 * Features:
 * - Minimum 44px touch target (WCAG compliant)
 * - Works without hover states for mobile
 * - Configurable sizes (sm/md/lg = 40/44/48px)
 * - Support for labels and on/off text
 * - Multiple variants including brand colors
 */
const TouchToggle = ({
  checked = false,
  onChange,
  disabled = false,
  size = 'md',
  label = '',
  labelPosition = 'left',
  onLabel = '',
  offLabel = '',
  variant = 'default',
  className = ''
}) => {
  // Size mappings (touch target height)
  const sizeMap = {
    sm: { height: 'h-10', width: 'w-[68px]', knob: 'h-6 w-6', translate: 'translate-x-[36px]' },
    md: { height: 'h-11', width: 'w-[76px]', knob: 'h-7 w-7', translate: 'translate-x-[40px]' },
    lg: { height: 'h-12', width: 'w-[84px]', knob: 'h-8 w-8', translate: 'translate-x-[44px]' }
  };

  const sizeClasses = sizeMap[size] || sizeMap.md;

  // Variant color mappings
  const variantMap = {
    default: checked ? 'bg-green-500' : 'bg-gray-300',
    success: checked ? 'bg-green-500' : 'bg-gray-300',
    brand: checked ? 'bg-gradient-to-r from-optio-purple to-optio-pink' : 'bg-gray-300'
  };

  const bgColor = variantMap[variant] || variantMap.default;

  const handleClick = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e) => {
    if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const toggleButton = (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label || (checked ? 'Toggle on' : 'Toggle off')}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`
        relative inline-flex items-center rounded-full transition-all duration-200
        ${sizeClasses.height} ${sizeClasses.width}
        ${disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2'
        }
        ${bgColor}
      `}
    >
      {/* Off label (inside toggle) */}
      {offLabel && !checked && (
        <span className="absolute left-2 text-xs font-medium text-gray-600 select-none">
          {offLabel}
        </span>
      )}

      {/* Knob */}
      <span
        className={`
          inline-block transform rounded-full bg-white transition-transform duration-200 shadow-md
          ${sizeClasses.knob}
          ${checked ? sizeClasses.translate : 'translate-x-1'}
        `}
      />

      {/* On label (inside toggle) */}
      {onLabel && checked && (
        <span className="absolute right-2 text-xs font-medium text-white select-none">
          {onLabel}
        </span>
      )}
    </button>
  );

  // If no label, return just the toggle
  if (!label) {
    return <div className={className}>{toggleButton}</div>;
  }

  // With label
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {labelPosition === 'left' && label && (
        <span className="text-sm font-medium text-gray-700 select-none">
          {label}
        </span>
      )}
      {toggleButton}
      {labelPosition === 'right' && label && (
        <span className="text-sm font-medium text-gray-700 select-none">
          {label}
        </span>
      )}
    </div>
  );
};

TouchToggle.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  label: PropTypes.string,
  labelPosition: PropTypes.oneOf(['left', 'right']),
  onLabel: PropTypes.string,
  offLabel: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'success', 'brand']),
  className: PropTypes.string
};

export default TouchToggle;
