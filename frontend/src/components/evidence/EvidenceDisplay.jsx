import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  LinkIcon,
  DocumentIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  Bars3Icon,
  PencilIcon
} from '@heroicons/react/24/outline';
import SwipeableBlock from '../ui/mobile/SwipeableBlock';
import UndoToast from '../ui/mobile/UndoToast';

const EVIDENCE_ICONS = {
  text: DocumentTextIcon,
  image: PhotoIcon,
  video: VideoCameraIcon,
  link: LinkIcon,
  document: DocumentIcon
};

const EVIDENCE_COLORS = {
  text: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  image: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  video: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  link: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  document: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' }
};

// Helper to normalize items from different formats
const normalizeItems = (content, type) => {
  if (content?.items && Array.isArray(content.items)) {
    return content.items;
  }
  // Legacy single-item format
  if (type === 'image' && content?.url) {
    return [{ url: content.url, alt: content.alt || '', caption: content.caption || '' }];
  }
  if (type === 'video' && content?.url) {
    return [{ url: content.url, title: content.title || '' }];
  }
  if (type === 'link' && content?.url) {
    return [{ url: content.url, title: content.title || '', description: content.description || '' }];
  }
  if (type === 'document' && content?.url) {
    return [{ url: content.url, title: content.title || '', filename: content.filename || '' }];
  }
  return [];
};

// Image lightbox component
const ImageLightbox = ({ images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentImage = images[currentIndex];

  if (!currentImage) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <XMarkIcon className="w-8 h-8" />
      </button>

      <div className="max-w-4xl max-h-[90vh] p-4" onClick={e => e.stopPropagation()}>
        <img
          src={currentImage.url}
          alt={currentImage.alt || currentImage.caption || 'Evidence image'}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        {currentImage.caption && (
          <p className="text-white/80 text-center mt-3">{currentImage.caption}</p>
        )}

        {images.length > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              onClick={() => setCurrentIndex(i => (i - 1 + images.length) % images.length)}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 min-h-[44px]"
            >
              Previous
            </button>
            <span className="text-white/60">{currentIndex + 1} / {images.length}</span>
            <button
              onClick={() => setCurrentIndex(i => (i + 1) % images.length)}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 min-h-[44px]"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Sortable evidence block wrapper with swipe-to-delete
const SortableEvidenceBlock = ({ block, onDelete, onDeleteItem, onUpdateBlock, onEdit, onDeleteWithUndo }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SwipeableBlock onDelete={() => onDeleteWithUndo?.(block.id)}>
        <EvidenceBlock
          block={block}
          onDelete={onDelete}
          onDeleteItem={onDeleteItem}
          onUpdateBlock={onUpdateBlock}
          onEdit={onEdit}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </SwipeableBlock>
    </div>
  );
};

// Individual evidence block display
const EvidenceBlock = ({ block, onDelete, onDeleteItem, onUpdateBlock, onEdit, dragHandleProps }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Handle both 'type' (frontend) and 'block_type' (backend) formats
  const blockType = block.type || block.block_type || 'text';

  const Icon = EVIDENCE_ICONS[blockType] || DocumentTextIcon;
  const colors = EVIDENCE_COLORS[blockType] || EVIDENCE_COLORS.text;
  const items = normalizeItems(block.content, blockType);

  const openLightbox = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Handle deleting individual item from block
  const handleDeleteItem = (itemIndex) => {
    if (!onDeleteItem) return;

    const newItems = items.filter((_, i) => i !== itemIndex);

    if (newItems.length === 0) {
      // If no items left, delete the whole block
      onDelete?.(block.id);
    } else {
      // Update block with remaining items
      onDeleteItem(block.id, itemIndex, newItems);
    }
  };

  // Render text evidence
  const renderText = () => (
    <div className="prose prose-sm max-w-none">
      <p className="text-gray-700 whitespace-pre-wrap" style={{ fontFamily: 'Poppins' }}>
        {block.content?.text || 'No text content'}
      </p>
    </div>
  );

  // Render image evidence with individual delete
  const renderImages = () => {
    if (items.length === 0) return <p className="text-gray-500 text-sm">No images</p>;

    return (
      <>
        <div className={`grid gap-2 ${items.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {items.map((item, index) => (
            <div
              key={index}
              className="relative group/image"
            >
              <img
                src={item.url}
                alt={item.alt || item.caption || `Image ${index + 1}`}
                className="w-full h-auto min-h-[120px] sm:h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openLightbox(index)}
              />
              {/* Delete button for individual image */}
              {onDeleteItem && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(index);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity hover:bg-red-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Remove image"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {item.caption && (
                <p className="text-xs text-gray-500 mt-1 truncate">{item.caption}</p>
              )}
            </div>
          ))}
        </div>
        {lightboxOpen && (
          <ImageLightbox
            images={items}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  };

  // Render video evidence with individual delete
  const renderVideos = () => {
    if (items.length === 0) return <p className="text-gray-500 text-sm">No videos</p>;

    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2 group/item">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center gap-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100 hover:border-orange-300 transition-colors"
            >
              <VideoCameraIcon className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700 truncate" style={{ fontFamily: 'Poppins' }}>
                {item.title || item.url}
              </span>
              <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400" />
            </a>
            {onDeleteItem && (
              <button
                onClick={() => handleDeleteItem(index)}
                className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Remove video"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render link evidence with individual delete
  const renderLinks = () => {
    if (items.length === 0) return <p className="text-gray-500 text-sm">No links</p>;

    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2 group/item">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 block p-3 bg-purple-50/50 rounded-lg border border-purple-100 hover:border-purple-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                <span className="font-medium text-sm text-gray-800" style={{ fontFamily: 'Poppins' }}>
                  {item.title || 'Untitled link'}
                </span>
                <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400 ml-auto" />
              </div>
              {item.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
              )}
              <p className="text-xs text-purple-500 mt-1 truncate">{item.url}</p>
            </a>
            {onDeleteItem && (
              <button
                onClick={() => handleDeleteItem(index)}
                className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Remove link"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render document evidence with individual delete
  const renderDocuments = () => {
    if (items.length === 0) return <p className="text-gray-500 text-sm">No documents</p>;

    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2 group/item">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors"
            >
              <DocumentIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-700 truncate" style={{ fontFamily: 'Poppins' }}>
                  {item.title || item.filename || 'Document'}
                </span>
                {item.filename && item.title !== item.filename && (
                  <span className="text-xs text-gray-400 truncate">{item.filename}</span>
                )}
              </div>
              <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400" />
            </a>
            {onDeleteItem && (
              <button
                onClick={() => handleDeleteItem(index)}
                className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Remove document"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 group`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          {dragHandleProps && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -ml-1"
              {...dragHandleProps}
            >
              <Bars3Icon className="w-4 h-4" />
            </button>
          )}
          <Icon className={`w-5 h-5 ${colors.text}`} />
          <span className={`text-sm font-medium ${colors.text}`} style={{ fontFamily: 'Poppins' }}>
            {blockType.charAt(0).toUpperCase() + blockType.slice(1)}
            {blockType !== 'text' && items.length > 0 && ` (${items.length})`}
          </span>
        </div>

        {/* Edit and Delete buttons - visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={() => onEdit(block)}
              className="p-1.5 text-gray-400 hover:text-optio-purple hover:bg-white/50 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Edit block"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(block.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white/50 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Delete block"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        {blockType === 'text' && renderText()}
        {blockType === 'image' && renderImages()}
        {blockType === 'video' && renderVideos()}
        {blockType === 'link' && renderLinks()}
        {blockType === 'document' && renderDocuments()}
      </div>

      {/* Private indicator */}
      {block.is_private && (
        <div className="mt-3 pt-3 border-t border-gray-200/50">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            Private - only visible to you
          </span>
        </div>
      )}
    </div>
  );
};

// Main evidence display component with drag and drop
const EvidenceDisplay = ({
  blocks = [],
  onDelete,
  onDeleteItem,
  onReorder,
  onUpdateBlock,
  onEdit,
  onDeleteWithUndo,
  onUndoDelete,
  emptyMessage = 'No evidence submitted yet'
}) => {
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [lastDeletedBlockId, setLastDeletedBlockId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 6 } })
  );

  const handleDeleteWithUndo = (blockId) => {
    if (onDeleteWithUndo) {
      onDeleteWithUndo(blockId);
      setLastDeletedBlockId(blockId);
      setShowUndoToast(true);
    }
  };

  const handleUndo = () => {
    if (onUndoDelete && lastDeletedBlockId) {
      onUndoDelete(lastDeletedBlockId);
      setShowUndoToast(false);
      setLastDeletedBlockId(null);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex);
    }
  };

  if (blocks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm" style={{ fontFamily: 'Poppins' }}>{emptyMessage}</p>
      </div>
    );
  }

  // If reordering is enabled, use drag and drop
  if (onReorder) {
    return (
      <>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {blocks.map((block) => (
                <SortableEvidenceBlock
                  key={block.id}
                  block={block}
                  onDelete={onDelete}
                  onDeleteItem={onDeleteItem}
                  onUpdateBlock={onUpdateBlock}
                  onEdit={onEdit}
                  onDeleteWithUndo={handleDeleteWithUndo}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {showUndoToast && (
          <UndoToast
            message="Block deleted"
            onUndo={handleUndo}
            onClose={() => setShowUndoToast(false)}
          />
        )}
      </>
    );
  }

  // Without reordering
  return (
    <>
      <div className="space-y-4">
        {blocks.map((block) => (
          <SwipeableBlock key={block.id} onDelete={() => handleDeleteWithUndo(block.id)}>
            <EvidenceBlock
              block={block}
              onDelete={onDelete}
              onDeleteItem={onDeleteItem}
              onUpdateBlock={onUpdateBlock}
              onEdit={onEdit}
            />
          </SwipeableBlock>
        ))}
      </div>
      {showUndoToast && (
        <UndoToast
          message="Block deleted"
          onUndo={handleUndo}
          onClose={() => setShowUndoToast(false)}
        />
      )}
    </>
  );
};

export default EvidenceDisplay;
