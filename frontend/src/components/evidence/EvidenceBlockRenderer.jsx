import React, { useRef } from 'react';
import {
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  LinkIcon,
  DocumentIcon
} from '@heroicons/react/24/outline';
import { useEvidenceEditor } from './EvidenceEditorContext';
import { IMAGE_ACCEPT_STRING, DOCUMENT_ACCEPT_STRING, IMAGE_FORMAT_LABEL, DOCUMENT_FORMAT_LABEL } from './EvidenceMediaHandlers';
import { TouchActionGroup } from '../ui/mobile/TouchActionButton';
import { ResponsiveGrid } from '../ui/mobile/ResponsiveGrid';
import { useIsMobile } from '../../hooks/useSwipeGesture';
import toast from 'react-hot-toast';

const blockTypes = {
  text: {
    Icon: DocumentTextIcon,
    label: 'Text',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  image: {
    Icon: PhotoIcon,
    label: 'Images',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  video: {
    Icon: VideoCameraIcon,
    label: 'Videos',
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200'
  },
  link: {
    Icon: LinkIcon,
    label: 'Links',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  document: {
    Icon: DocumentIcon,
    label: 'Documents',
    color: 'from-gray-500 to-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200'
  }
};

// Helper to normalize items - handles both old single-item format and new multi-item format
const normalizeItems = (content, type) => {
  if (content.items && Array.isArray(content.items)) {
    return content.items;
  }
  // Legacy single-item format - convert to items array
  if (type === 'image' && content.url) {
    return [{ url: content.url, alt: content.alt || '', caption: content.caption || '' }];
  }
  if (type === 'video' && content.url) {
    return [{ url: content.url, title: content.title || '' }];
  }
  if (type === 'link' && content.url) {
    return [{ url: content.url, title: content.title || '', description: content.description || '' }];
  }
  if (type === 'document' && content.url) {
    return [{ url: content.url, title: content.title || '', filename: content.filename || '', description: content.description || '' }];
  }
  return [];
};

export const EvidenceBlockRenderer = ({
  block,
  index,
  sortableRef,
  sortableStyle = {},
  dragHandleProps = {},
  mediaHandlers,
  addBlock,
  updateBlock,
  deleteBlock,
  isNew = false,
  moveBlockUp,
  moveBlockDown
}) => {
  const {
    activeBlock,
    setActiveBlock,
    collapsedBlocks,
    toggleBlockCollapse,
    uploadingBlocks,
    uploadErrors,
    setBlocks
  } = useEvidenceEditor();

  const fileInputRef = useRef(null);
  const config = blockTypes[block.type];
  const isCollapsed = collapsedBlocks.has(block.id);
  const isUploading = uploadingBlocks.has(block.id);
  const hasUploadError = uploadErrors[block.id];

  // Keyboard navigation handler
  const handleKeyDown = (e) => {
    // Only handle keyboard events when the drag handle is focused
    if (e.target.getAttribute('aria-label') !== 'Drag to reorder block') return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (moveBlockUp) {
          moveBlockUp(block.id);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (moveBlockDown) {
          moveBlockDown(block.id);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (window.confirm('Delete this block?')) {
          deleteBlock(block.id);
        }
        break;
      default:
        break;
    }
  };

  // Get normalized items for multi-item blocks
  const items = normalizeItems(block.content, block.type);

  // Update items array helper
  const updateItems = (newItems) => {
    updateBlock(block.id, { items: newItems });
  };

  // Add new item to block
  const addItem = (newItem) => {
    const currentItems = normalizeItems(block.content, block.type);
    updateItems([...currentItems, newItem]);
  };

  // Remove item from block
  const removeItem = (itemIndex) => {
    const currentItems = normalizeItems(block.content, block.type);
    const newItems = currentItems.filter((_, i) => i !== itemIndex);
    updateItems(newItems);
  };

  // Update specific item
  const updateItem = (itemIndex, updates) => {
    const currentItems = normalizeItems(block.content, block.type);
    const newItems = currentItems.map((item, i) =>
      i === itemIndex ? { ...item, ...updates } : item
    );
    updateItems(newItems);
  };

  const getBlockPreview = (block) => {
    const items = normalizeItems(block.content, block.type);
    switch (block.type) {
      case 'text':
        const text = block.content.text || '';
        return text.length > 50 ? `${text.substring(0, 50)}...` : text || 'Empty text block';
      case 'image':
        if (items.length === 0) return 'No images uploaded';
        if (items.length === 1 && items[0].url) {
          return (
            <img src={items[0].url} alt={items[0].alt || 'Image preview'} className="h-12 w-auto object-contain rounded" />
          );
        }
        return `${items.length} images`;
      case 'video':
        if (items.length === 0) return 'No videos added';
        return items.length === 1 ? (items[0].title || items[0].url || 'No video URL') : `${items.length} videos`;
      case 'link':
        if (items.length === 0) return 'No links added';
        return items.length === 1 ? (items[0].title || items[0].url || 'No link URL') : `${items.length} links`;
      case 'document':
        if (items.length === 0) return 'No documents uploaded';
        return items.length === 1 ? (items[0].filename || items[0].title || 'Document') : `${items.length} documents`;
      default:
        return 'Empty block';
    }
  };

  const renderTextBlock = (block) => (
    <div className="space-y-3">
      <textarea
        id={`text-block-${block.id}`}
        value={block.content.text || ''}
        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none transition-all"
        rows={Math.max(3, Math.ceil((block.content.text || '').length / 80))}
        placeholder="Share your thoughts, process, or reflections..."
        aria-label="Text evidence"
        onFocus={() => setActiveBlock(block.id)}
        onBlur={() => setActiveBlock(null)}
      />
      <div className="text-xs text-gray-500 text-right">
        {(block.content.text || '').length} characters
      </div>
    </div>
  );

  const renderImageBlock = (block) => {
    const handleFileSelect = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        try {
          const fileInfo = await mediaHandlers.handleFileUpload(file, block.id, 'image');
          addItem({
            url: fileInfo.localUrl,
            alt: file.name,
            caption: ''
          });
        } catch (err) {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
      e.target.value = ''; // Reset input
    };

    return (
      <div className="space-y-4">
        {/* Image List with Descriptions */}
        {items.length > 0 && (
          <div className="space-y-4">
            {items.map((item, itemIndex) => (
              <div key={itemIndex} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                {/* Image Preview */}
                <div className="relative">
                  <img
                    src={item.url}
                    alt={item.alt || `Image ${itemIndex + 1}`}
                    className="w-full h-48 object-cover"
                  />
                  <TouchActionGroup className="absolute top-2 right-2">
                    <button
                      onClick={() => removeItem(itemIndex)}
                      className="min-h-[44px] min-w-[44px] p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg touch-manipulation"
                      title="Remove image"
                      aria-label={`Remove image ${itemIndex + 1}`}
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </TouchActionGroup>
                </div>
                {/* Description input below image */}
                <div className="p-3 bg-blue-50 border-t-2 border-blue-300">
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Description (optional)</label>
                  <textarea
                    value={item.caption || ''}
                    onChange={(e) => updateItem(itemIndex, { caption: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm resize-none bg-white"
                    rows={2}
                    placeholder="Add a description for this image..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-optio-purple hover:bg-optio-purple/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <PhotoIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {items.length > 0 ? 'Add more images' : 'Click to upload images'}
          </p>
          <p className="text-xs text-gray-500 mt-1">{IMAGE_FORMAT_LABEL} up to 10MB</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={`image/*,${IMAGE_ACCEPT_STRING}`}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  };

  const renderVideoBlock = (block) => {
    const addVideoUrl = () => {
      addItem({ url: '', title: '' });
    };

    return (
      <div className="space-y-4">
        {/* Video List */}
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="space-y-2 p-4 bg-orange-50/50 rounded-lg border border-orange-200">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={item.url || ''}
                onChange={(e) => updateItem(itemIndex, { url: e.target.value })}
                className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm"
                placeholder="YouTube, Vimeo, or video URL"
              />
              <button
                onClick={() => removeItem(itemIndex)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove video"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => updateItem(itemIndex, { title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm"
              placeholder="Video title (optional)"
            />
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-optio-purple hover:text-optio-pink break-all"
              >
                Open video
              </a>
            )}
          </div>
        ))}

        {/* Add Video Button */}
        <button
          onClick={addVideoUrl}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors flex items-center justify-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Add video URL</span>
        </button>
      </div>
    );
  };

  const renderLinkBlock = (block) => {
    const addLinkUrl = () => {
      addItem({ url: '', title: '', description: '' });
    };

    return (
      <div className="space-y-4">
        {/* Link List */}
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="space-y-2 p-4 bg-purple-50/50 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={item.url || ''}
                onChange={(e) => updateItem(itemIndex, { url: e.target.value })}
                className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm"
                placeholder="https://example.com/your-work"
              />
              <button
                onClick={() => removeItem(itemIndex)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove link"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => updateItem(itemIndex, { title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm"
              placeholder="Link title"
            />
            <textarea
              value={item.description || ''}
              onChange={(e) => updateItem(itemIndex, { description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm resize-none"
              rows={2}
              placeholder="Description (optional)"
            />
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-optio-purple hover:text-optio-pink break-all"
              >
                {item.title || item.url}
              </a>
            )}
          </div>
        ))}

        {/* Add Link Button */}
        <button
          onClick={addLinkUrl}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors flex items-center justify-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Add link</span>
        </button>
      </div>
    );
  };

  const renderDocumentBlock = (block) => {
    const handleFileSelect = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        try {
          const fileInfo = await mediaHandlers.handleFileUpload(file, block.id, 'document');
          addItem({
            url: fileInfo.localUrl,
            filename: file.name,
            title: file.name,
            description: ''
          });
        } catch (err) {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
      e.target.value = ''; // Reset input
    };

    return (
      <div className="space-y-4">
        {/* Document List */}
        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((item, itemIndex) => (
              <div key={itemIndex} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                {/* Document header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <DocumentIcon className="w-6 h-6 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) => updateItem(itemIndex, { title: e.target.value })}
                        className="w-full px-2 py-1 text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-optio-purple focus:outline-none"
                        placeholder="Document title"
                      />
                      <p className="text-xs text-gray-500 truncate px-2">{item.filename}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(itemIndex)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2"
                    title="Remove document"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                {/* Description input */}
                <div className="p-3">
                  <textarea
                    value={item.description || ''}
                    onChange={(e) => updateItem(itemIndex, { description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent text-sm resize-none"
                    rows={2}
                    placeholder="Add a description for this document (optional)..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-optio-purple hover:bg-optio-purple/5 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <DocumentIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {items.length > 0 ? 'Add more documents' : 'Click to upload documents'}
          </p>
          <p className="text-xs text-gray-500 mt-1">{DOCUMENT_FORMAT_LABEL} up to 10MB</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT_STRING}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      className={`
        relative group bg-white border-2 rounded-xl p-4 transition-all
        ${activeBlock === block.id ? config.borderColor : 'border-gray-200'}
        hover:border-gray-300
        ${isCollapsed ? 'bg-gray-50' : ''}
        ${isNew ? 'animate-fade-in-up ring-2 ring-optio-purple ring-opacity-50' : ''}
      `}
    >
      {/* Upload Status Overlay */}
      {isUploading && (
        <div className="absolute top-2 right-2 z-10 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          Uploading...
        </div>
      )}
      {hasUploadError && (
        <div className="absolute top-2 right-2 z-10 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-2">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Upload failed
        </div>
      )}

      {/* Simplified Block Header */}
      <div className="flex items-center gap-2 mb-3">
        {/* Drag handle - Touch-friendly 44x44px */}
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-gray-100 -ml-1 touch-manipulation focus:outline-none focus:ring-2 focus:ring-optio-purple"
          role="button"
          aria-label="Drag to reorder block"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="8" cy="6" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
            <circle cx="8" cy="18" r="1.5" />
            <circle cx="14" cy="6" r="1.5" />
            <circle cx="14" cy="12" r="1.5" />
            <circle cx="14" cy="18" r="1.5" />
          </svg>
        </div>

        {/* Type icon */}
        <config.Icon className="w-5 h-5 text-gray-500" />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Private indicator (always visible if private) */}
        {block.is_private && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            Private
          </span>
        )}

        {/* Action buttons - Always visible on mobile, hover on desktop */}
        <TouchActionGroup>
          {/* Private toggle */}
          <button
            onClick={() => {
              setBlocks(prevBlocks => prevBlocks.map(b =>
                b.id === block.id ? { ...b, is_private: !b.is_private } : b
              ));
            }}
            className={`min-h-[44px] min-w-[44px] p-2 rounded transition-colors touch-manipulation ${
              block.is_private
                ? 'text-gray-700 bg-gray-100'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={block.is_private ? 'Make public' : 'Make private'}
            aria-label={block.is_private ? 'Make block public' : 'Make block private'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {block.is_private ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              )}
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={() => deleteBlock(block.id)}
            className="min-h-[44px] min-w-[44px] p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors touch-manipulation"
            title="Delete block"
            aria-label="Delete block"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </TouchActionGroup>
      </div>

      {/* Block Content or Preview */}
      {isCollapsed ? (
        <div className="py-2 px-4 bg-white rounded-lg border border-gray-200 text-sm text-gray-600">
          {getBlockPreview(block)}
        </div>
      ) : (
        <div>
          {block.type === 'text' && renderTextBlock(block)}
          {block.type === 'image' && renderImageBlock(block)}
          {block.type === 'video' && renderVideoBlock(block)}
          {block.type === 'link' && renderLinkBlock(block)}
          {block.type === 'document' && renderDocumentBlock(block)}
        </div>
      )}

      {/* Retry Button for Failed Uploads */}
      {hasUploadError && !isCollapsed && (
        <div className="mt-3">
          <button
            onClick={() => {
              const file = block.content._retryFile;
              if (file) {
                mediaHandlers.uploadFileImmediately(file, block.id, block.type);
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Retry Upload
          </button>
          <p className="text-xs text-red-600 mt-1">{hasUploadError}</p>
        </div>
      )}
    </div>
  );
};

export default EvidenceBlockRenderer;
