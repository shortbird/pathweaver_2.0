import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const LearningEventModal = ({ isOpen, onClose, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [evidenceBlocks, setEvidenceBlocks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const blockTypes = {
    text: { icon: '📝', label: 'Text', color: 'bg-blue-50', border: 'border-blue-200' },
    image: { icon: '📸', label: 'Image', color: 'bg-green-50', border: 'border-green-200' },
    video: { icon: '🎥', label: 'Video Link', color: 'bg-orange-50', border: 'border-orange-200' },
    link: { icon: '🔗', label: 'Web Link', color: 'bg-purple-50', border: 'border-purple-200' },
    document: { icon: '📄', label: 'Document', color: 'bg-gray-50', border: 'border-gray-200' }
  };


  const addBlock = (type) => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      block_type: type,
      content: getDefaultContent(type),
      order_index: evidenceBlocks.length
    };
    setEvidenceBlocks([...evidenceBlocks, newBlock]);
  };

  const getDefaultContent = (type) => {
    switch (type) {
      case 'text':
        return { text: '' };
      case 'image':
        return { url: '', alt: '', caption: '' };
      case 'video':
        return { url: '', title: '' };
      case 'link':
        return { url: '', title: '', description: '' };
      case 'document':
        return { url: '', title: '', filename: '' };
      default:
        return {};
    }
  };

  const updateBlock = (blockId, newContent) => {
    setEvidenceBlocks(evidenceBlocks.map(block =>
      block.id === blockId
        ? { ...block, content: { ...block.content, ...newContent } }
        : block
    ));
  };

  const deleteBlock = (blockId) => {
    const block = evidenceBlocks.find(b => b.id === blockId);
    // Revoke blob URL if it exists
    if (block?.content?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(block.content.url);
    }
    setEvidenceBlocks(evidenceBlocks.filter(block => block.id !== blockId));
  };

  const handleFileUpload = async (file, blockId, type) => {
    try {
      // Validate file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(`File is too large (${fileSizeMB}MB). Maximum size is 10MB.`);
        return;
      }

      // Create blob URL for immediate preview
      const localUrl = URL.createObjectURL(file);

      // Store file in block for later upload
      updateBlock(blockId, {
        url: localUrl,
        _fileToUpload: file,
        filename: file.name,
        alt: type === 'image' ? file.name : undefined
      });
    } catch (error) {
      console.error('File preparation error:', error);
      toast.error('Failed to prepare file for upload');
    }
  };

  const uploadBlockFiles = async (eventId) => {
    const uploadPromises = evidenceBlocks.map(async (block, index) => {
      const file = block.content._fileToUpload;
      if (file) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('block_type', block.block_type);
          formData.append('order_index', index);

          const response = await api.post(`/api/learning-events/${eventId}/upload`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

          if (response.data.success) {
            return { success: true, block_id: response.data.block_id, file_url: response.data.file_url };
          }
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          return { success: false, filename: file.name };
        }
      }
      return { success: true }; // No file to upload
    });

    return await Promise.all(uploadPromises);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please describe what you learned');
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Create learning event with description
      const response = await api.post('/api/learning-events', {
        description: description.trim()
      });

      if (response.data.success) {
        const eventId = response.data.event.id;

        // Step 2: Save evidence blocks (without files)
        if (evidenceBlocks.length > 0) {
          const cleanedBlocks = evidenceBlocks.map(block => {
            const cleanContent = { ...block.content };
            // Remove blob URLs and file objects before saving
            if (cleanContent.url?.startsWith('blob:')) {
              delete cleanContent.url;
            }
            delete cleanContent._fileToUpload;

            return {
              block_type: block.block_type,
              content: cleanContent,
              order_index: block.order_index
            };
          });

          await api.post(`/api/learning-events/${eventId}/evidence`, {
            blocks: cleanedBlocks
          });

          // Step 3: Upload files
          const uploadResults = await uploadBlockFiles(eventId);
          const failedUploads = uploadResults.filter(r => !r.success);

          if (failedUploads.length > 0) {
            toast.error(`Some files failed to upload: ${failedUploads.map(f => f.filename).join(', ')}`);
          }
        }

        toast.success('Learning moment captured successfully.');
        onSuccess && onSuccess(response.data.event);
        handleClose();
      } else {
        toast.error(response.data.error || 'Failed to capture learning moment');
      }
    } catch (error) {
      console.error('Error creating learning event:', error);
      toast.error(error.response?.data?.error || 'Failed to capture learning moment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Revoke all blob URLs to prevent memory leaks
    evidenceBlocks.forEach(block => {
      if (block.content?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(block.content.url);
      }
    });

    setDescription('');
    setEvidenceBlocks([]);
    onClose();
  };

  const renderTextBlock = (block) => (
    <textarea
      value={block.content.text || ''}
      onChange={(e) => updateBlock(block.id, { text: e.target.value })}
      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] resize-none"
      rows={4}
      placeholder="Share your thoughts, process, or reflections..."
    />
  );

  const renderImageBlock = (block) => (
    <div>
      {block.content.url ? (
        <div className="relative">
          <img
            src={block.content.url}
            alt={block.content.alt || ''}
            className="w-full max-h-64 object-contain rounded-lg border border-gray-200"
          />
          <button
            onClick={() => updateBlock(block.id, { url: '', alt: '', caption: '' })}
            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400"
          onClick={() => {
            fileInputRef.current.accept = 'image/*';
            fileInputRef.current.onchange = (e) => {
              const file = e.target.files[0];
              if (file) handleFileUpload(file, block.id, 'image');
            };
            fileInputRef.current.click();
          }}
        >
          <div className="text-3xl mb-2">📸</div>
          <p className="text-sm text-gray-600">Click to upload an image</p>
        </div>
      )}
    </div>
  );

  const renderVideoBlock = (block) => (
    <div className="space-y-2">
      <input
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b]"
        placeholder="YouTube, Vimeo, or video URL"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b]"
        placeholder="Video title (optional)"
      />
    </div>
  );

  const renderLinkBlock = (block) => (
    <div className="space-y-2">
      <input
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b]"
        placeholder="https://example.com"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b]"
        placeholder="Link title"
      />
      <textarea
        value={block.content.description || ''}
        onChange={(e) => updateBlock(block.id, { description: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] resize-none"
        rows={2}
        placeholder="Description (optional)"
      />
    </div>
  );

  const renderDocumentBlock = (block) => (
    <div>
      {block.content.url ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📄</div>
            <div>
              <p className="text-sm font-medium">{block.content.filename || 'Document'}</p>
            </div>
          </div>
          <button
            onClick={() => updateBlock(block.id, { url: '', title: '', filename: '' })}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400"
          onClick={() => {
            fileInputRef.current.accept = '.pdf,.doc,.docx';
            fileInputRef.current.onchange = (e) => {
              const file = e.target.files[0];
              if (file) handleFileUpload(file, block.id, 'document');
            };
            fileInputRef.current.click();
          }}
        >
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm text-gray-600">Click to upload a document</p>
          <p className="text-xs text-gray-500">PDF, DOC, DOCX</p>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r bg-gradient-primary text-white p-6 rounded-t-xl sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Capture a Learning Moment</h2>
              <p className="text-white/90 text-sm">
                Record any moment of growth, discovery, or skill development. Every step matters.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description Field */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What did you learn or discover? *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none"
              rows={4}
              placeholder="Describe what you learned, created, or figured out..."
              maxLength={5000}
            />
            <div className="mt-1 text-xs text-gray-500 text-right">
              {description.length} / 5000 characters
            </div>
          </div>

          {/* Evidence Blocks */}
          {evidenceBlocks.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Evidence
              </label>
              <div className="space-y-3">
                {evidenceBlocks.map((block) => {
                  const config = blockTypes[block.block_type];
                  return (
                    <div key={block.id} className={`border-2 ${config.border} ${config.color} rounded-lg p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{config.icon}</span>
                          <span className="text-sm font-medium">{config.label}</span>
                        </div>
                        <button
                          onClick={() => deleteBlock(block.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {block.block_type === 'text' && renderTextBlock(block)}
                      {block.block_type === 'image' && renderImageBlock(block)}
                      {block.block_type === 'video' && renderVideoBlock(block)}
                      {block.block_type === 'link' && renderLinkBlock(block)}
                      {block.block_type === 'document' && renderDocumentBlock(block)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Evidence Block Buttons */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Add Evidence
            </label>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {Object.entries(blockTypes).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className={`p-3 rounded-lg border-2 ${config.border} ${config.color} hover:shadow-md transition-all`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl">{config.icon}</span>
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r bg-gradient-primary text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Capturing...</span>
                </>
              ) : (
                <span>Capture Moment</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
    </div>
  );
};

export default LearningEventModal;
