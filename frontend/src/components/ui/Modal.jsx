import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Modal Component - Reusable modal wrapper with slot-based architecture
 *
 * Replaces 68+ instances of the fixed inset-0 modal pattern
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Close handler
 * @param {string} title - Modal title (optional if using custom header)
 * @param {React.ReactNode} header - Custom header content (overrides title)
 * @param {React.ReactNode} children - Modal body content
 * @param {React.ReactNode} footer - Footer content (usually buttons)
 * @param {string} size - Modal size: 'sm' | 'md' | 'lg' | 'xl' | 'full' (default: 'md')
 * @param {boolean} showCloseButton - Show X button in header (default: true)
 * @param {boolean} closeOnOverlayClick - Close when clicking overlay (default: true)
 * @param {string} headerClassName - Additional classes for header
 * @param {string} bodyClassName - Additional classes for body
 * @param {string} footerClassName - Additional classes for footer
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  header,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  headerClassName = '',
  bodyClassName = '',
  footerClassName = ''
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-full mx-4'
  };

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && closeOnOverlayClick) {
      onClose();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={`bg-white rounded-2xl shadow-2xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        {(header || title) && (
          <div className={`bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white flex items-center justify-between ${headerClassName}`}>
            {header || <h2 className="text-2xl font-bold">{title}</h2>}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors ml-4"
                aria-label="Close modal"
              >
                <XMarkIcon size={24} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className={`flex-1 overflow-y-auto p-6 ${bodyClassName}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className={`px-6 py-4 border-t border-gray-200 ${footerClassName}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * ModalHeader - Custom header component for more control
 */
export const ModalHeader = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

/**
 * ModalBody - Explicit body wrapper (optional, children work too)
 */
export const ModalBody = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

/**
 * ModalFooter - Footer component with default button layout
 */
export const ModalFooter = ({ children, className = '' }) => (
  <div className={`flex gap-3 ${className}`}>
    {children}
  </div>
);

export default Modal;
