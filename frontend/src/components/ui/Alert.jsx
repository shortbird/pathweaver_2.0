import React from 'react';
import { AlertCircle, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';

/**
 * Alert Component - Reusable notification/alert box with variant system
 *
 * Replaces 57+ instances of duplicated alert patterns
 *
 * @param {string} variant - Alert type: 'info' | 'success' | 'warning' | 'error' | 'purple' (default: 'info')
 * @param {string} title - Optional title text
 * @param {React.ReactNode} children - Alert message content
 * @param {boolean} showIcon - Show icon (default: true)
 * @param {React.ReactNode} icon - Custom icon (overrides default variant icon)
 * @param {string} className - Additional CSS classes
 */
export const Alert = ({
  variant = 'info',
  title,
  children,
  showIcon = true,
  icon,
  className = ''
}) => {
  const variants = {
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />,
      titleColor: 'text-blue-900'
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />,
      titleColor: 'text-green-900'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />,
      titleColor: 'text-yellow-900'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
      titleColor: 'text-red-900'
    },
    purple: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-800',
      icon: <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0" />,
      titleColor: 'text-purple-900'
    }
  };

  const config = variants[variant] || variants.info;

  return (
    <div className={`${config.bg} border ${config.border} rounded-lg p-4 ${className}`}>
      <div className="flex gap-3">
        {showIcon && (icon || config.icon)}
        <div className="flex-1">
          {title && (
            <h4 className={`font-semibold mb-1 ${config.titleColor}`}>
              {title}
            </h4>
          )}
          <div className={`text-sm ${config.text}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Alert;
