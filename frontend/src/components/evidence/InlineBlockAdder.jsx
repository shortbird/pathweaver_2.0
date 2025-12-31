import React from 'react';
import {
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  LinkIcon,
  DocumentIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const BLOCK_TYPES = [
  { id: 'text', label: 'Text', icon: DocumentTextIcon },
  { id: 'image', label: 'Image', icon: PhotoIcon },
  { id: 'video', label: 'Video', icon: VideoCameraIcon },
  { id: 'link', label: 'Link', icon: LinkIcon },
  { id: 'document', label: 'Document', icon: DocumentIcon },
];

/**
 * InlineBlockAdder - Notion-style inline block addition
 *
 * @param {function} onAddBlock - Callback when block type is selected
 * @param {string} mode - 'empty' for empty state, 'compact' for after blocks exist
 * @param {number} position - Position to insert block
 */
const InlineBlockAdder = ({ onAddBlock, mode = 'empty', position }) => {

  const handleAddBlock = (type) => {
    onAddBlock(type, position);
  };

  // Empty state - large, inviting buttons with description
  if (mode === 'empty') {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 bg-gray-50/50">
        <div className="text-center mb-4">
          <PlusIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm" style={{ fontFamily: 'Poppins' }}>
            Add evidence to show your learning
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {BLOCK_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => handleAddBlock(type.id)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg
                         hover:border-optio-purple hover:bg-optio-purple/5 transition-all group"
            >
              <type.icon className="w-5 h-5 text-gray-400 group-hover:text-optio-purple transition-colors" />
              <span className="font-medium text-sm text-gray-700 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins' }}>
                {type.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Compact mode - single row of icon buttons (for when blocks already exist)
  return (
    <div className="flex items-center justify-center gap-1 py-2">
      <span className="text-xs text-gray-400 mr-2" style={{ fontFamily: 'Poppins' }}>Add:</span>
      {BLOCK_TYPES.map((type) => (
        <button
          key={type.id}
          onClick={() => handleAddBlock(type.id)}
          className="p-2 rounded-lg text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 transition-all"
          title={`Add ${type.label}`}
        >
          <type.icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
};

export default InlineBlockAdder;
