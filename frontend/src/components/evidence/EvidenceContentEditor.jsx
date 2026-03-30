import { useState, useEffect, useRef } from 'react';
import {
  XMarkIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  LinkIcon,
  DocumentIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { IMAGE_ACCEPT_STRING, DOCUMENT_ACCEPT_STRING, VIDEO_ACCEPT_STRING, IMAGE_FORMAT_LABEL, DOCUMENT_FORMAT_LABEL, VIDEO_FORMAT_LABEL, ALLOWED_VIDEO_EXTENSIONS, validateVideoDuration } from './EvidenceMediaHandlers';
import { detectMediaType, validateFileSize, CAMERA_ACCEPT_STRING } from '../../utils/mediaUtils';

export const EVIDENCE_TYPES = [
  { id: 'text', label: 'Text', Icon: DocumentTextIcon, description: 'Write notes or reflections' },
  { id: 'camera', label: 'Camera', Icon: PhotoIcon, description: 'Upload photos or videos' },
  { id: 'link', label: 'Link', Icon: LinkIcon, description: 'Share URLs' },
  { id: 'document', label: 'Document', Icon: DocumentIcon, description: 'Upload files' },
];

/**
 * EvidenceContentEditor - Single source of truth for evidence content entry.
 * Handles evidence type selection, content editing, file uploads, and multi-item support.
 * Used by AddEvidenceModal (students), ParentQuestView (parents), and advisor flows.
 *
 * @param {Function} onSave - Called with array of evidence items when user saves
 * @param {Function} onCancel - Called when user cancels
 * @param {Function} onUpdate - Called with updated item in edit mode
 * @param {Object} editingBlock - Block being edited (null for add mode)
 * @param {Array} existingEvidence - Existing evidence blocks (for context)
 */
const EvidenceContentEditor = ({ onSave, onCancel, onUpdate, editingBlock = null, existingEvidence = [] }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  const fileInputRef = useRef(null);
  const isEditMode = !!editingBlock;

  // Initialize state when editing block changes
  useEffect(() => {
    if (editingBlock) {
      const type = editingBlock.type || editingBlock.block_type || 'text';
      setSelectedType(type);
      setCurrentItem({
        id: editingBlock.id,
        type: type,
        content: editingBlock.content || {}
      });
      setEvidenceItems([]);
    } else {
      setSelectedType(null);
      setCurrentItem(null);
      setEvidenceItems([]);
    }
  }, [editingBlock]);

  const resetState = () => {
    setSelectedType(null);
    setEvidenceItems([]);
    setCurrentItem(null);
  };

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setCurrentItem(getEmptyItem(type));
  };

  const getEmptyItem = (type) => {
    switch (type) {
      case 'text':
        return { type: 'text', content: { text: '' } };
      case 'camera':
        return { type: 'camera', content: { items: [] } };
      case 'image':
        return { type: 'image', content: { items: [] } };
      case 'video':
        return { type: 'video', content: { items: [] } };
      case 'link':
        return { type: 'link', content: { items: [] } };
      case 'document':
        return { type: 'document', content: { items: [] } };
      default:
        return null;
    }
  };

  const handleAddAnother = () => {
    if (!isCurrentItemValid()) {
      toast.error('Please fill in the current item before adding another');
      return;
    }
    setEvidenceItems([...evidenceItems, { ...currentItem, id: `temp_${Date.now()}` }]);
    setCurrentItem(getEmptyItem(selectedType));
    toast.success('Evidence added - you can add more or save all');
  };

  // Convert camera items into proper image/video blocks
  const expandCameraItems = (items) => {
    const expanded = [];
    for (const item of items) {
      if (item.type === 'camera' && item.content?.items) {
        // Split into separate image and video blocks
        const imageItems = item.content.items.filter(i => i.mediaType !== 'video');
        const videoItems = item.content.items.filter(i => i.mediaType === 'video');
        if (imageItems.length > 0) {
          expanded.push({
            ...item,
            type: 'image',
            content: { items: imageItems.map(({ mediaType, ...rest }) => rest) },
          });
        }
        if (videoItems.length > 0) {
          expanded.push({
            ...item,
            id: `temp_${Date.now()}_v`,
            type: 'video',
            content: { items: videoItems.map(({ mediaType, ...rest }) => rest) },
          });
        }
      } else {
        expanded.push(item);
      }
    }
    return expanded;
  };

  const handleSaveAll = () => {
    // Edit mode - update single block
    if (isEditMode && currentItem) {
      if (!isCurrentItemValid()) {
        toast.error('Please add content before saving');
        return;
      }
      // For camera edits, expand into proper types
      const expanded = expandCameraItems([{ ...currentItem, id: editingBlock.id }]);
      if (expanded.length === 1) {
        onUpdate?.(expanded[0]);
      } else {
        // Multiple blocks from camera -- save as new items
        onSave(expanded);
      }
      resetState();
      return;
    }

    // Add mode - save all items
    let allItems = [...evidenceItems];
    if (currentItem && isCurrentItemValid()) {
      allItems.push({ ...currentItem, id: `temp_${Date.now()}` });
    }

    if (allItems.length === 0) {
      toast.error('Please add at least one piece of evidence');
      return;
    }

    // Expand camera items into proper image/video blocks
    allItems = expandCameraItems(allItems);

    onSave(allItems);
    resetState();
  };

  const isCurrentItemValid = () => {
    if (!currentItem) return false;
    switch (currentItem.type) {
      case 'text':
        return currentItem.content.text?.trim().length > 0;
      case 'camera':
      case 'image':
      case 'video':
      case 'link':
      case 'document':
        return currentItem.content.items?.length > 0;
      default:
        return false;
    }
  };

  const handleRemoveItem = (index) => {
    setEvidenceItems(evidenceItems.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newItems = files.map(file => ({
      url: URL.createObjectURL(file),
      file: file,
      filename: file.name,
      title: file.name
    }));

    setCurrentItem({
      ...currentItem,
      content: {
        items: [...(currentItem.content.items || []), ...newItems]
      }
    });

    e.target.value = '';
  };

  const handleAddUrl = () => {
    setCurrentItem({
      ...currentItem,
      content: {
        items: [...(currentItem.content.items || []), { url: '', title: '' }]
      }
    });
  };

  const handleUpdateUrlItem = (index, field, value) => {
    const newItems = [...currentItem.content.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setCurrentItem({
      ...currentItem,
      content: { items: newItems }
    });
  };

  const handleRemoveCurrentItem = (index) => {
    const newItems = currentItem.content.items.filter((_, i) => i !== index);
    setCurrentItem({
      ...currentItem,
      content: { items: newItems }
    });
  };

  // Render type selection
  const renderTypeSelection = () => (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
        What type of evidence?
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {EVIDENCE_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => handleTypeSelect(type.id)}
            className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-xl hover:border-optio-purple hover:bg-optio-purple/5 transition-all group min-h-[44px]"
          >
            <type.Icon className="w-8 h-8 text-gray-400 group-hover:text-optio-purple mb-2" />
            <span className="font-medium text-sm text-gray-700 group-hover:text-optio-purple" style={{ fontFamily: 'Poppins' }}>
              {type.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // Render text input
  const renderTextInput = () => (
    <div className="space-y-4">
      <textarea
        value={currentItem?.content.text || ''}
        onChange={(e) => setCurrentItem({
          ...currentItem,
          content: { text: e.target.value }
        })}
        className="w-full h-48 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none min-h-[120px]"
        placeholder="Share your thoughts, process, or reflections..."
        style={{ fontFamily: 'Poppins' }}
      />
      <div className="text-xs text-gray-500 text-right">
        {(currentItem?.content.text || '').length} characters
      </div>
    </div>
  );

  // Render image upload
  const renderImageUpload = () => (
    <div className="space-y-4">
      {currentItem?.content.items?.length > 0 && (
        <div className="space-y-4">
          {currentItem.content.items.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              <div className="relative">
                <img
                  src={item.url}
                  alt={item.filename || `Image ${index + 1}`}
                  className="w-full h-40 object-cover"
                />
                <button
                  onClick={() => handleRemoveCurrentItem(index)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <textarea
                  value={item.caption || ''}
                  onChange={(e) => handleUpdateUrlItem(index, 'caption', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm resize-none"
                  rows={2}
                  placeholder="Add a description for this image..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-optio-purple hover:bg-optio-purple/5 transition-colors min-h-[150px] flex flex-col items-center justify-center"
      >
        <PhotoIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <p className="font-medium text-gray-700" style={{ fontFamily: 'Poppins' }}>
          Click to upload images
        </p>
        <p className="text-sm text-gray-500 mt-1">{IMAGE_FORMAT_LABEL} up to 10MB</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={`image/*,${IMAGE_ACCEPT_STRING}`}
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );

  // Render camera upload (photos + videos)
  const handleCameraFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newItems = [];
    for (const file of files) {
      const mediaType = detectMediaType(file);
      // Also check extension for video detection
      const isVideoFile = mediaType === 'video' || ALLOWED_VIDEO_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase());
      const effectiveType = isVideoFile ? 'video' : mediaType;

      // Validate file size
      const sizeCheck = validateFileSize(file, effectiveType);
      if (!sizeCheck.valid) {
        toast.error(sizeCheck.error);
        continue;
      }

      // Validate video duration
      if (isVideoFile) {
        const durationCheck = await validateVideoDuration(file);
        if (!durationCheck.valid) {
          toast.error(durationCheck.message);
          continue;
        }
      }

      newItems.push({
        url: URL.createObjectURL(file),
        file: file,
        filename: file.name,
        title: file.name,
        mediaType: isVideoFile ? 'video' : 'image',
      });
    }

    if (newItems.length > 0) {
      setCurrentItem({
        ...currentItem,
        content: {
          items: [...(currentItem.content.items || []), ...newItems]
        }
      });
    }

    e.target.value = '';
  };

  const renderCameraUpload = () => (
    <div className="space-y-4">
      {currentItem?.content.items?.length > 0 && (
        <div className="space-y-4">
          {currentItem.content.items.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              <div className="relative">
                {item.mediaType === 'video' ? (
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    className="w-full h-40 bg-black object-contain"
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={item.filename || `Media ${index + 1}`}
                    className="w-full h-40 object-cover"
                  />
                )}
                <button
                  onClick={() => handleRemoveCurrentItem(index)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <textarea
                  value={item.caption || ''}
                  onChange={(e) => handleUpdateUrlItem(index, 'caption', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm resize-none"
                  rows={2}
                  placeholder="Add a description..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-optio-purple hover:bg-optio-purple/5 transition-colors min-h-[150px] flex flex-col items-center justify-center"
      >
        <PhotoIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <p className="font-medium text-gray-700" style={{ fontFamily: 'Poppins' }}>
          Click to upload photos or videos
        </p>
        <p className="text-sm text-gray-500 mt-1">Images up to 10MB, videos (MP4/MOV) up to 50MB, max 3 min</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={CAMERA_ACCEPT_STRING}
        multiple
        onChange={handleCameraFileUpload}
        className="hidden"
      />
    </div>
  );

  // Render link input
  const renderLinkInput = () => (
    <div className="space-y-4">
      {currentItem?.content.items?.map((item, index) => (
        <div key={index} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
          <div className="flex-1 space-y-2">
            <input
              type="url"
              value={item.url || ''}
              onChange={(e) => handleUpdateUrlItem(index, 'url', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
              placeholder="https://example.com"
            />
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => handleUpdateUrlItem(index, 'title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
              placeholder="Link title"
            />
          </div>
          <button
            onClick={() => handleRemoveCurrentItem(index)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        onClick={handleAddUrl}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors flex items-center justify-center gap-2"
      >
        <PlusIcon className="w-5 h-5" />
        <span className="font-medium" style={{ fontFamily: 'Poppins' }}>Add link</span>
      </button>
    </div>
  );

  // Render document upload
  const renderDocumentUpload = () => (
    <div className="space-y-4">
      {currentItem?.content.items?.length > 0 && (
        <div className="space-y-3">
          {currentItem.content.items.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <DocumentIcon className="w-6 h-6 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                    {item.filename}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveCurrentItem(index)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <textarea
                  value={item.description || ''}
                  onChange={(e) => handleUpdateUrlItem(index, 'description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm resize-none"
                  rows={2}
                  placeholder="Add a description for this document..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-optio-purple hover:bg-optio-purple/5 transition-colors min-h-[150px] flex flex-col items-center justify-center"
      >
        <DocumentIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <p className="font-medium text-gray-700" style={{ fontFamily: 'Poppins' }}>
          Click to upload documents
        </p>
        <p className="text-sm text-gray-500 mt-1">{DOCUMENT_FORMAT_LABEL} up to 10MB</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={DOCUMENT_ACCEPT_STRING}
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );

  // Render content based on selected type
  const renderContent = () => {
    if (!selectedType) return renderTypeSelection();

    return (
      <div className="p-6">
        {/* Type header with back button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              if (isCurrentItemValid()) {
                setEvidenceItems([...evidenceItems, { ...currentItem, id: `temp_${Date.now()}` }]);
              }
              setSelectedType(null);
              setCurrentItem(null);
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
            Add {EVIDENCE_TYPES.find(t => t.id === selectedType)?.label}
          </h3>
        </div>

        {/* Content input */}
        {selectedType === 'text' && renderTextInput()}
        {selectedType === 'camera' && renderCameraUpload()}
        {selectedType === 'image' && renderImageUpload()}
        {selectedType === 'link' && renderLinkInput()}
        {selectedType === 'document' && renderDocumentUpload()}

        {/* Added items preview */}
        {evidenceItems.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3" style={{ fontFamily: 'Poppins' }}>
              Added evidence ({evidenceItems.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {evidenceItems.map((item, index) => {
                const typeInfo = EVIDENCE_TYPES.find(t => t.id === item.type);
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm"
                  >
                    <typeInfo.Icon className="w-4 h-4 text-green-600" />
                    <span className="text-green-700">{typeInfo?.label}</span>
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="text-green-600 hover:text-red-500"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render footer actions
  const renderFooter = () => {
    if (!selectedType) return null;

    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 gap-3">
        {!isEditMode ? (
          <button
            onClick={handleAddAnother}
            disabled={!isCurrentItemValid()}
            className="px-4 py-2 text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins' }}
          >
            <PlusIcon className="w-4 h-4" />
            Add Another
          </button>
        ) : (
          <div />
        )}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              resetState();
              onCancel();
            }}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isEditMode ? !isCurrentItemValid() : (evidenceItems.length === 0 && !isCurrentItemValid())}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins' }}
          >
            <CheckIcon className="w-4 h-4" />
            {isEditMode ? 'Update Evidence' : 'Save Evidence'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderContent()}
      {renderFooter()}
    </>
  );
};

export default EvidenceContentEditor;
