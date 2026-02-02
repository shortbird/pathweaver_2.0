import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import FocusTrap from 'focus-trap-react';

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

  // Size classes with mobile-first approach
  // On mobile (< sm), modals take more screen space
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl sm:max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-full mx-2 sm:mx-4'
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

  // Track if this modal instance set the overflow
  const didLockScroll = React.useRef(false);

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      didLockScroll.current = true;
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Only reset if this modal was the one that locked scroll
      if (didLockScroll.current) {
        document.body.style.overflow = '';
        didLockScroll.current = false;
      }
    };
  }, [isOpen]);

  // Safety net: ensure scroll is restored on unmount (e.g., during navigation)
  React.useEffect(() => {
    return () => {
      if (didLockScroll.current) {
        document.body.style.overflow = '';
      }
    };
  }, []);

  // Use createPortal to render modal at document.body level
  // This prevents stacking context issues from transforms/transitions on parent elements
  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={handleOverlayClick}
    >
      <FocusTrap
        focusTrapOptions={{
          allowOutsideClick: true,
          escapeDeactivates: closeOnOverlayClick,
          initialFocus: false,
          returnFocusOnDeactivate: true
        }}
      >
        <div
          className={`bg-white rounded-xl sm:rounded-2xl shadow-2xl ${sizeClasses[size]} w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col`}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          {(header || title) && (
            <div className={`bg-gradient-to-r from-optio-purple to-optio-pink p-4 sm:p-6 text-white flex items-center justify-between ${headerClassName}`}>
              {header || <h2 className="text-lg sm:text-2xl font-bold">{title}</h2>}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-lg transition-colors ml-3 sm:ml-4 flex-shrink-0"
                  aria-label="Close modal"
                >
                  <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className={`flex-1 overflow-y-auto p-4 sm:p-6 ${bodyClassName}`}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 ${footerClassName}`}>
              {footer}
            </div>
          )}
        </div>
      </FocusTrap>
    </div>,
    document.body
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
