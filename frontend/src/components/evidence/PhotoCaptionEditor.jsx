import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import MobileModal from '../ui/mobile/MobileModal';
import TouchActionButton from '../ui/mobile/TouchActionButton';

/**
 * PhotoCaptionEditor - Full-screen caption editor for mobile photos
 *
 * Features:
 * - Full-screen on mobile with image preview (60% height)
 * - Auto-focusing caption textarea
 * - 44px touch targets for accessibility
 * - Safe area padding for notched devices
 * - Swipe-to-close gesture support
 */
const PhotoCaptionEditor = ({
  imageUrl,
  caption = '',
  onSave,
  onCancel,
  isOpen = true
}) => {
  const [currentCaption, setCurrentCaption] = useState(caption);
  const textareaRef = useRef(null);

  // Auto-focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  // Reset caption when image changes or modal opens
  useEffect(() => {
    setCurrentCaption(caption);
  }, [caption, isOpen]);

  const handleSave = () => {
    onSave(currentCaption);
  };

  const handleCancel = () => {
    setCurrentCaption(caption); // Reset to original
    onCancel();
  };

  const handleTextareaChange = (e) => {
    setCurrentCaption(e.target.value);
  };

  return (
    <MobileModal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Add Caption"
      fullScreenOnMobile={true}
      enableSwipeClose={true}
      safeAreaPadding={true}
      mobileHeaderStyle="fixed"
      showMobileCloseHandle={true}
      bodyClassName="p-0 flex flex-col"
      size="lg"
    >
      <div className="flex flex-col h-full">
        {/* Image Preview - 60% height on mobile */}
        <div className="h-[60vh] sm:h-96 bg-gray-100 flex items-center justify-center overflow-hidden">
          <img
            src={imageUrl}
            alt="Preview"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Caption Input - Flexible height */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 min-h-0">
          <label
            htmlFor="caption-input"
            className="text-sm font-semibold text-gray-700 mb-2"
          >
            Caption
          </label>
          <textarea
            ref={textareaRef}
            id="caption-input"
            value={currentCaption}
            onChange={handleTextareaChange}
            placeholder="Describe this photo..."
            className="flex-1 w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base sm:text-sm"
            style={{
              minHeight: '120px',
              maxHeight: 'calc(40vh - 120px)' // Prevent keyboard overlap
            }}
            aria-label="Photo caption"
          />
        </div>

        {/* Action Buttons - Fixed at bottom with safe area padding */}
        <div
          className="flex gap-3 p-4 sm:p-6 border-t border-gray-200 bg-white"
          style={{
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
        >
          <TouchActionButton
            label="Cancel"
            onClick={handleCancel}
            variant="ghost"
            size="md"
            className="flex-1"
          />
          <TouchActionButton
            label="Save"
            onClick={handleSave}
            variant="primary"
            size="md"
            className="flex-1"
          />
        </div>
      </div>
    </MobileModal>
  );
};

PhotoCaptionEditor.propTypes = {
  imageUrl: PropTypes.string.isRequired,
  caption: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isOpen: PropTypes.bool
};

export default PhotoCaptionEditor;
