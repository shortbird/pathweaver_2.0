import { useState, useEffect, useRef, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
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
import { IMAGE_ACCEPT_STRING, DOCUMENT_ACCEPT_STRING, IMAGE_FORMAT_LABEL, DOCUMENT_FORMAT_LABEL } from './EvidenceMediaHandlers';

const EVIDENCE_TYPES = [
  { id: 'text', label: 'Text', Icon: DocumentTextIcon, description: 'Write notes or reflections' },
  { id: 'image', label: 'Image', Icon: PhotoIcon, description: 'Upload photos' },
  { id: 'video', label: 'Video', Icon: VideoCameraIcon, description: 'Add video links' },
  { id: 'link', label: 'Link', Icon: LinkIcon, description: 'Share URLs' },
  { id: 'document', label: 'Document', Icon: DocumentIcon, description: 'Upload files' },
];

const AddEvidenceModal = ({ isOpen, onClose, onSave, onUpdate, editingBlock = null, existingEvidence = [] }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [currentItem, setCurrentItem] = useState(null);
  const fileInputRef = useRef(null);
  const isEditMode = !!editingBlock;

  // Initialize state when editing
  useState(() => {
    if (editingBlock && isOpen) {
      const type = editingBlock.type || editingBlock.block_type || 'text';
      setSelectedType(type);
      setCurrentItem({
        id: editingBlock.id,
        type: type,
        content: editingBlock.content || {}
      });
    }
  }, [editingBlock, isOpen]);

  // Reset state when modal closes or editing block changes
  useEffect(() => {
    if (isOpen && editingBlock) {
      const type = editingBlock.type || editingBlock.block_type || 'text';
      setSelectedType(type);
      setCurrentItem({
        id: editingBlock.id,
        type: type,
        content: editingBlock.content || {}
      });
      setEvidenceItems([]);
    } else if (isOpen && !editingBlock) {
      setSelectedType(null);
      setCurrentItem(null);
      setEvidenceItems([]);
    }
  }, [editingBlock, isOpen]);

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedType(null);
    setEvidenceItems([]);
    setCurrentItem(null);
    onClose();
  };

  // Initialize current item when type is selected
  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setCurrentItem(getEmptyItem(type));
  };

  const getEmptyItem = (type) => {
    switch (type) {
      case 'text':
        return { type: 'text', content: { text: '' } };
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

  // Add current item to the list and start a new one
  const handleAddAnother = () => {
    if (!isCurrentItemValid()) {
      toast.error('Please fill in the current item before adding another');
      return;
    }
    setEvidenceItems([...evidenceItems, { ...currentItem, id: `temp_${Date.now()}` }]);
    setCurrentItem(getEmptyItem(selectedType));
    toast.success('Evidence added - you can add more or save all');
  };

  // Save all evidence items
  const handleSaveAll = () => {
    // Edit mode - update single block
    if (isEditMode && currentItem) {
      if (!isCurrentItemValid()) {
        toast.error('Please add content before saving');
        return;
      }
      onUpdate?.({
        ...currentItem,
        id: editingBlock.id
      });
      handleClose();
      toast.success('Evidence updated');
      return;
    }

    // Add mode - save all items
    let allItems = [...evidenceItems];

    // Add current item if valid
    if (currentItem && isCurrentItemValid()) {
      allItems.push({ ...currentItem, id: `temp_${Date.now()}` });
    }

    if (allItems.length === 0) {
      toast.error('Please add at least one piece of evidence');
      return;
    }

    onSave(allItems);
    handleClose();
    toast.success(`${allItems.length} evidence item${allItems.length > 1 ? 's' : ''} saved`);
  };

  // Check if current item has content
  const isCurrentItemValid = () => {
    if (!currentItem) return false;

    switch (currentItem.type) {
      case 'text':
        return currentItem.content.text?.trim().length > 0;
      case 'image':
      case 'video':
      case 'link':
      case 'document':
        return currentItem.content.items?.length > 0;
      default:
        return false;
    }
  };

  // Remove an added item
  const handleRemoveItem = (index) => {
    setEvidenceItems(evidenceItems.filter((_, i) => i !== index));
  };

  // Handle file upload for images/documents
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

  // Add URL item (for video/link)
  const handleAddUrl = () => {
    setCurrentItem({
      ...currentItem,
      content: {
        items: [...(currentItem.content.items || []), { url: '', title: '' }]
      }
    });
  };

  // Update URL item
  const handleUpdateUrlItem = (index, field, value) => {
    const newItems = [...currentItem.content.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setCurrentItem({
      ...currentItem,
      content: { items: newItems }
    });
  };

  // Remove item from current
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      {/* Uploaded images with description */}
      {currentItem?.content.items?.length > 0 && (
        <div className="space-y-4">
          {currentItem.content.items.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              {/* Image preview */}
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
              {/* Description input */}
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

      {/* Upload area */}
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

  // Render video input
  const renderVideoInput = () => (
    <div className="space-y-4">
      {/* Video URLs */}
      {currentItem?.content.items?.map((item, index) => (
        <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <div className="flex-1 space-y-2">
            <input
              type="url"
              value={item.url || ''}
              onChange={(e) => handleUpdateUrlItem(index, 'url', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
              placeholder="YouTube, Vimeo, or video URL"
            />
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => handleUpdateUrlItem(index, 'title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-sm"
              placeholder="Video title (optional)"
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

      {/* Add video button */}
      <button
        onClick={handleAddUrl}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors flex items-center justify-center gap-2"
      >
        <PlusIcon className="w-5 h-5" />
        <span className="font-medium" style={{ fontFamily: 'Poppins' }}>Add video URL</span>
      </button>
    </div>
  );

  // Render link input
  const renderLinkInput = () => (
    <div className="space-y-4">
      {/* Links */}
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

      {/* Add link button */}
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
      {/* Uploaded documents with description */}
      {currentItem?.content.items?.length > 0 && (
        <div className="space-y-3">
          {currentItem.content.items.map((item, index) => (
            <div key={index} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              {/* Document header */}
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
              {/* Description input */}
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

      {/* Upload area */}
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
        {selectedType === 'image' && renderImageUpload()}
        {selectedType === 'video' && renderVideoInput()}
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

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 z-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto z-50">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-full sm:max-w-2xl mx-2 sm:mx-0 bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <Dialog.Title className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                    {isEditMode ? 'Edit Evidence' : 'Add Evidence'}
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                {renderContent()}

                {/* Footer */}
                {selectedType && (
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
                      <div /> /* Spacer for edit mode */
                    )}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={handleClose}
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
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddEvidenceModal;
