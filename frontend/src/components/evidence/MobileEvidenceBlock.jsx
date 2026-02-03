import React, { memo } from 'react';
import { LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline';
import SwipeableBlock from '../ui/mobile/SwipeableBlock';
import TouchActionButton from '../ui/mobile/TouchActionButton';

/**
 * MobileEvidenceBlock - Touch-optimized evidence block wrapper
 *
 * Mobile-first evidence block with:
 * - Drag handle (6-dot pattern) always visible for reordering
 * - Swipe-to-delete gesture
 * - Touch-optimized action buttons (always visible, not hover-only)
 * - Upload progress overlay
 *
 * @param {Object} props
 * @param {Object} props.block - Evidence block data
 * @param {Function} props.onUpdate - Called when block content is updated
 * @param {Function} props.onDelete - Called when block is deleted
 * @param {Function} props.onTogglePrivate - Called when privacy is toggled
 * @param {Object} props.dragHandleProps - Props to spread onto drag handle for react-beautiful-dnd
 * @param {boolean} props.isUploading - Whether block is currently uploading
 * @param {number} props.uploadProgress - Upload progress percentage (0-100)
 * @param {ReactNode} props.children - Block content to render
 */
const MobileEvidenceBlock = ({
  block,
  onUpdate,
  onDelete,
  onTogglePrivate,
  dragHandleProps = {},
  isUploading = false,
  uploadProgress = 0,
  children
}) => {
  const isPrivate = block?.is_private || false;

  return (
    <SwipeableBlock
      onDelete={onDelete}
      deleteThreshold={160}
      disabled={isUploading}
      className="mb-3"
    >
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-white bg-opacity-90 z-10 flex items-center justify-center">
            <div className="text-center">
              <div className="w-full max-w-xs px-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-sm font-medium text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Uploading... {uploadProgress}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header with drag handle and actions */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-100 bg-gray-50">
          {/* Drag Handle - 6-dot pattern */}
          <div
            {...dragHandleProps}
            className="flex items-center justify-center min-w-[48px] min-h-[48px] -ml-2 cursor-grab active:cursor-grabbing touch-manipulation"
            aria-label="Drag to reorder"
          >
            <div className="grid grid-cols-2 gap-1 p-2">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions - always visible on mobile */}
          <div className="flex gap-1 items-center">
            {/* Privacy Toggle */}
            <TouchActionButton
              icon={isPrivate ? <LockClosedIcon className="w-5 h-5" /> : <LockOpenIcon className="w-5 h-5" />}
              label={isPrivate ? 'Private' : 'Public'}
              onClick={onTogglePrivate}
              variant="ghost"
              size="sm"
              disabled={isUploading}
              className={isPrivate ? 'text-optio-purple' : 'text-gray-600'}
            />
          </div>
        </div>

        {/* Content */}
        <div className="relative">
          {children}
        </div>
      </div>
    </SwipeableBlock>
  );
};

export default memo(MobileEvidenceBlock);
