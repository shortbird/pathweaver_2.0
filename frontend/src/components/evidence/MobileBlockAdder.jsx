import React, { memo } from 'react';
import {
  CameraIcon,
  PhotoIcon,
  VideoCameraIcon,
  LinkIcon,
  DocumentTextIcon,
  Bars3BottomLeftIcon
} from '@heroicons/react/24/outline';

/**
 * MobileBlockAdder - Mobile-optimized block type selector
 *
 * Three display modes:
 * - 'empty': 2x3 grid layout for empty evidence (fits 320px screens)
 * - 'compact': Horizontal scrollable row with snap points
 * - 'fab': Radial menu (floating action button style)
 *
 * Camera is always FIRST and larger to encourage photo capture on mobile.
 *
 * @param {Object} props
 * @param {Function} props.onAddBlock - Called with block type when selected
 * @param {string} props.mode - Display mode ('empty'|'compact'|'fab')
 */
const MobileBlockAdder = ({ onAddBlock, mode = 'compact' }) => {
  const blockTypes = [
    {
      type: 'camera',
      label: 'Camera',
      icon: CameraIcon,
      color: 'from-optio-purple to-optio-pink',
      isPrimary: true
    },
    {
      type: 'text',
      label: 'Text',
      icon: Bars3BottomLeftIcon,
      color: 'from-blue-500 to-blue-600'
    },
    {
      type: 'image',
      label: 'Image',
      icon: PhotoIcon,
      color: 'from-green-500 to-green-600'
    },
    {
      type: 'video',
      label: 'Video',
      icon: VideoCameraIcon,
      color: 'from-purple-500 to-purple-600'
    },
    {
      type: 'link',
      label: 'Link',
      icon: LinkIcon,
      color: 'from-cyan-500 to-cyan-600'
    },
    {
      type: 'document',
      label: 'Document',
      icon: DocumentTextIcon,
      color: 'from-orange-500 to-orange-600'
    }
  ];

  const handleAdd = (type) => {
    onAddBlock?.(type);
  };

  // Empty mode: 2x3 grid for empty evidence state
  if (mode === 'empty') {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Add your first evidence
        </h3>
        <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
          {blockTypes.map(({ type, label, icon: Icon, color, isPrimary }) => (
            <button
              key={type}
              onClick={() => handleAdd(type)}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-transparent transition-all duration-200 active:scale-95 touch-manipulation ${
                isPrimary
                  ? 'bg-gradient-to-r ' + color + ' text-white shadow-lg col-span-2 min-h-[80px]'
                  : 'bg-white border-gray-200 hover:border-gray-300 min-h-[72px]'
              }`}
              style={{ minWidth: '44px', minHeight: isPrimary ? '80px' : '72px' }}
            >
              <Icon className={isPrimary ? 'w-8 h-8' : 'w-6 h-6'} />
              <span className={`text-sm font-medium ${isPrimary ? '' : 'text-gray-700'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Compact mode: Horizontal scroll with snap points
  if (mode === 'compact') {
    return (
      <div className="w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide py-2 px-4">
        <div className="flex gap-2 min-w-max">
          {blockTypes.map(({ type, label, icon: Icon, color, isPrimary }) => (
            <button
              key={type}
              onClick={() => handleAdd(type)}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg transition-all duration-200 active:scale-95 snap-start touch-manipulation shrink-0 ${
                isPrimary
                  ? 'bg-gradient-to-r ' + color + ' text-white shadow-md w-16 h-16'
                  : 'bg-white border border-gray-200 hover:border-gray-300 w-14 h-14'
              }`}
              style={{ minWidth: isPrimary ? '64px' : '56px', minHeight: isPrimary ? '64px' : '56px' }}
            >
              <Icon className={isPrimary ? 'w-7 h-7' : 'w-5 h-5'} />
              <span className={`text-xs font-medium ${isPrimary ? '' : 'text-gray-600'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // FAB mode: Radial menu (simplified for now - can be enhanced)
  if (mode === 'fab') {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <div className="flex flex-col gap-2 items-end">
          {blockTypes.map(({ type, label, icon: Icon, color, isPrimary }) => (
            <button
              key={type}
              onClick={() => handleAdd(type)}
              className={`flex items-center gap-2 rounded-full shadow-lg transition-all duration-200 active:scale-95 touch-manipulation ${
                isPrimary
                  ? 'bg-gradient-to-r ' + color + ' text-white w-14 h-14'
                  : 'bg-white border border-gray-200 w-12 h-12'
              }`}
              style={{ minWidth: isPrimary ? '56px' : '48px', minHeight: isPrimary ? '56px' : '48px' }}
              aria-label={label}
            >
              <Icon className={`mx-auto ${isPrimary ? 'w-7 h-7' : 'w-6 h-6'}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default memo(MobileBlockAdder);
