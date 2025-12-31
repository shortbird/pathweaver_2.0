import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { XMarkIcon } from '@heroicons/react/24/outline';
import FocusTrap from 'focus-trap-react';

/**
 * MobileModal - Enhanced modal with mobile-first optimizations
 *
 * Features:
 * - Full-screen on mobile (<640px), centered on desktop
 * - Swipe-to-close gesture support
 * - Safe area insets for notched devices
 * - Configurable animations (slide-up/fade/none)
 * - Fixed or inline mobile headers
 * - Swipe handle indicator
 *
 * Extends all Modal.jsx props with mobile-specific enhancements.
 */
const MobileModal = ({
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
  footerClassName = '',
  // Mobile-specific props
  fullScreenOnMobile = true,
  enableSwipeClose = true,
  swipeThreshold = 100,
  safeAreaPadding = true,
  mobileHeaderStyle = 'fixed',
  showMobileCloseHandle = true,
  animation = 'slide-up'
}) => {
  const [touchStart, setTouchStart] = useState(null);
  const [touchOffset, setTouchOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const modalRef = useRef(null);

  if (!isOpen) return null;

  // Desktop size classes
  const sizeClasses = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-2xl',
    lg: 'sm:max-w-4xl',
    xl: 'sm:max-w-6xl',
    full: 'sm:max-w-full sm:mx-4'
  };

  // Animation classes
  const animationClasses = {
    'slide-up': 'animate-slide-up',
    'fade': 'animate-fade-in-up',
    'none': ''
  };

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle Escape key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && closeOnOverlayClick) {
      onClose();
    }
  };

  // Touch handlers for swipe-to-close
  const handleTouchStart = (e) => {
    if (!enableSwipeClose) return;
    setTouchStart(e.touches[0].clientY);
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!enableSwipeClose || touchStart === null) return;

    const currentTouch = e.touches[0].clientY;
    const diff = currentTouch - touchStart;

    // Only allow downward swipes
    if (diff > 0) {
      setTouchOffset(diff);
    }
  };

  const handleTouchEnd = () => {
    if (!enableSwipeClose) return;

    // Close if swiped past threshold
    if (touchOffset > swipeThreshold) {
      onClose();
    }

    // Reset
    setTouchStart(null);
    setTouchOffset(0);
    setIsSwiping(false);
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Build mobile container classes
  const mobileContainerClasses = fullScreenOnMobile
    ? 'fixed inset-0 sm:relative sm:rounded-2xl' // Full screen on mobile, centered on desktop
    : 'rounded-xl sm:rounded-2xl';

  // Safe area padding classes
  const safePaddingClasses = safeAreaPadding
    ? 'pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]'
    : '';

  // Mobile header style
  const mobileHeaderFixed = mobileHeaderStyle === 'fixed';

  // Apply swipe offset transform
  const swipeStyle = isSwiping && touchOffset > 0
    ? { transform: `translateY(${touchOffset}px)`, transition: 'none' }
    : {};

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center"
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
          ref={modalRef}
          className={`
            bg-white shadow-2xl w-full
            ${mobileContainerClasses}
            ${sizeClasses[size]}
            ${fullScreenOnMobile ? 'h-full sm:h-auto sm:max-h-[90vh]' : 'max-h-[95vh] sm:max-h-[90vh]'}
            ${safePaddingClasses}
            overflow-hidden flex flex-col
            ${animationClasses[animation]}
          `}
          style={swipeStyle}
          role="dialog"
          aria-modal="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Swipe handle (mobile only) */}
          {showMobileCloseHandle && fullScreenOnMobile && (
            <div className="sm:hidden flex justify-center py-2 bg-gradient-to-r from-optio-purple to-optio-pink">
              <div className="w-12 h-1.5 bg-white/50 rounded-full" />
            </div>
          )}

          {/* Header */}
          {(header || title) && (
            <div
              className={`
                bg-gradient-to-r from-optio-purple to-optio-pink p-4 sm:p-6 text-white
                flex items-center justify-between
                ${mobileHeaderFixed ? 'sticky top-0 z-10' : ''}
                ${headerClassName}
              `}
            >
              {header || <h2 className="text-lg sm:text-2xl font-bold">{title}</h2>}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="text-white hover:bg-white/20 active:bg-white/30 p-1.5 sm:p-2 rounded-lg transition-colors ml-3 sm:ml-4 flex-shrink-0 touch-manipulation"
                  aria-label="Close modal"
                >
                  <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div
            className={`
              flex-1 overflow-y-auto p-4 sm:p-6
              scroll-smooth-mobile
              ${bodyClassName}
            `}
          >
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
    </div>
  );
};

MobileModal.propTypes = {
  // Base Modal props
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  header: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'full']),
  showCloseButton: PropTypes.bool,
  closeOnOverlayClick: PropTypes.bool,
  headerClassName: PropTypes.string,
  bodyClassName: PropTypes.string,
  footerClassName: PropTypes.string,
  // Mobile-specific props
  fullScreenOnMobile: PropTypes.bool,
  enableSwipeClose: PropTypes.bool,
  swipeThreshold: PropTypes.number,
  safeAreaPadding: PropTypes.bool,
  mobileHeaderStyle: PropTypes.oneOf(['fixed', 'inline']),
  showMobileCloseHandle: PropTypes.bool,
  animation: PropTypes.oneOf(['slide-up', 'fade', 'none'])
};

/**
 * MobileModalHeader - Custom header component
 */
export const MobileModalHeader = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

MobileModalHeader.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};

/**
 * MobileModalBody - Explicit body wrapper
 */
export const MobileModalBody = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

MobileModalBody.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};

/**
 * MobileModalFooter - Footer component with default button layout
 */
export const MobileModalFooter = ({ children, className = '' }) => (
  <div className={`flex gap-3 ${className}`}>
    {children}
  </div>
);

MobileModalFooter.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};

export default MobileModal;
