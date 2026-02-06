import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert } from '../ui';
import { PhotoIcon, DocumentIcon, LinkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

/**
 * Modal for capturing learning moments.
 * Ultra-minimal design: child selector, description, and media upload.
 */
const ParentMomentCaptureModal = ({
  isOpen,
  onClose,
  children,
  selectedChildId,
  onSuccess
}) => {
  const [selectedChild, setSelectedChild] = useState(selectedChildId || (children[0]?.id || ''));
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]); // { file, preview, type, uploading, uploaded, file_url, file_name, file_size }
  const [links, setLinks] = useState([]); // { url, title }
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset form when modal opens/closes
  const resetForm = () => {
    setSelectedChild(selectedChildId || (children[0]?.id || ''));
    setDescription('');
    setAttachments([]);
    setLinks([]);
    setLinkInput('');
    setShowLinkInput(false);
    setError('');
    setIsSubmitting(false);
  };

  // URL validation helper
  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Add link handler
  const handleAddLink = () => {
    const trimmedUrl = linkInput.trim();
    if (trimmedUrl && isValidUrl(trimmedUrl)) {
      setLinks(prev => [...prev, { url: trimmedUrl, title: '' }]);
      setLinkInput('');
      setShowLinkInput(false);
      setError('');
    } else if (trimmedUrl) {
      setError('Please enter a valid URL (e.g., https://example.com)');
    }
  };

  // Remove link handler
  const removeLink = (index) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (!isSubmitting) {
      // Revoke preview URLs to prevent memory leaks
      attachments.forEach(att => {
        if (att.preview) {
          URL.revokeObjectURL(att.preview);
        }
      });
      resetForm();
      onClose();
    }
  };

  const handleFileSelect = (e, type) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments = files.map(file => {
      let fileType = type;
      if (type === 'image' && file.type.startsWith('image/')) {
        fileType = 'image';
      } else if (type === 'document') {
        fileType = 'document';
      }

      return {
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        type: fileType,
        uploading: false,
        uploaded: false,
        file_url: null,
        file_name: file.name,
        file_size: file.size
      };
    });

    setAttachments(prev => [...prev, ...newAttachments]);
    setError('');

    // Reset file input
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const removed = prev[index];
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadFile = async (attachment, index) => {
    // Skip if already uploaded
    if (attachment.uploaded) return attachment;

    // Mark as uploading
    setAttachments(prev => prev.map((att, i) =>
      i === index ? { ...att, uploading: true } : att
    ));

    try {
      const formData = new FormData();
      formData.append('file', attachment.file);

      const response = await api.post(
        `/api/parent/children/${selectedChild}/learning-moments/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const result = response.data;

      // Mark as uploaded
      setAttachments(prev => prev.map((att, i) =>
        i === index ? {
          ...att,
          uploading: false,
          uploaded: true,
          file_url: result.file_url,
          file_name: result.file_name,
          file_size: result.file_size
        } : att
      ));

      return {
        ...attachment,
        uploaded: true,
        file_url: result.file_url,
        file_name: result.file_name,
        file_size: result.file_size
      };
    } catch (err) {
      // Mark as failed
      setAttachments(prev => prev.map((att, i) =>
        i === index ? { ...att, uploading: false } : att
      ));
      throw err;
    }
  };

  const handleSubmit = async () => {
    // Validate
    if (!selectedChild) {
      setError('Please select a child');
      return;
    }

    if (!description.trim() && attachments.length === 0 && links.length === 0) {
      setError('Please add a description, attach a file, or include a link');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Upload any files that haven't been uploaded yet
      const uploadedAttachments = await Promise.all(
        attachments.map((att, idx) => uploadFile(att, idx))
      );

      // Create the learning moment
      // Combine uploaded file attachments with links
      const media = [
        // File attachments (images, documents)
        ...uploadedAttachments
          .filter(att => att.uploaded && att.file_url)
          .map(att => ({
            type: att.type,
            file_url: att.file_url,
            file_name: att.file_name,
            file_size: att.file_size
          })),
        // Links
        ...links.map(link => ({
          type: 'link',
          url: link.url,
          title: link.title || ''
        }))
      ];

      const response = await api.post(
        `/api/parent/children/${selectedChild}/learning-moments`,
        {
          description: description.trim(),
          media
        }
      );

      toast.success('Learning moment captured!');

      if (onSuccess) {
        onSuccess(response.data.moment);
      }

      handleClose();
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to save learning moment';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if form is valid for submission
  const isValid = selectedChild && (description.trim() || attachments.length > 0 || links.length > 0);
  const isUploading = attachments.some(att => att.uploading);

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Capture Learning Moment"
      size="sm"
      showCloseButton={!isSubmitting}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors disabled:opacity-50 min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting || isUploading}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {isSubmitting ? 'Saving...' : 'Save Moment'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Child Selector */}
        <div>
          <label
            htmlFor="child-select"
            className="block text-sm font-semibold text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            For
          </label>
          <select
            id="child-select"
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {children.map(child => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-semibold text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            What happened?
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            placeholder="Describe the learning moment..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all resize-none"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          />
        </div>

        {/* Media Upload Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50 min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <PhotoIcon className="w-5 h-5" />
            <span className="font-medium">Photo</span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileSelect(e, 'image')}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50 min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <DocumentIcon className="w-5 h-5" />
            <span className="font-medium">File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={(e) => handleFileSelect(e, 'document')}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowLinkInput(!showLinkInput)}
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg transition-colors disabled:opacity-50 min-h-[44px] ${
              showLinkInput
                ? 'border-optio-purple text-optio-purple'
                : 'border-gray-300 text-gray-600 hover:border-optio-purple hover:text-optio-purple'
            }`}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <LinkIcon className="w-5 h-5" />
            <span className="font-medium">Link</span>
          </button>
        </div>

        {/* Link Input Field */}
        {showLinkInput && (
          <div className="flex gap-2">
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink();
                }
              }}
              placeholder="Paste URL (e.g., https://youtube.com/watch?v=...)"
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all min-h-[44px]"
              style={{ fontFamily: 'Poppins, sans-serif' }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={isSubmitting || !linkInput.trim()}
              className="px-4 py-2 bg-optio-purple text-white rounded-lg font-medium hover:bg-optio-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              Add
            </button>
          </div>
        )}

        {/* Attachment Previews */}
        {(attachments.length > 0 || links.length > 0) && (
          <div className="space-y-2">
            {/* File Attachments */}
            {attachments.map((att, idx) => (
              <div
                key={`file-${idx}`}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                {/* Preview thumbnail or icon */}
                {att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.file_name}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                    <DocumentIcon className="w-6 h-6 text-gray-500" />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {att.file_name}
                  </p>
                  <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {formatFileSize(att.file_size)}
                    {att.uploading && ' - Uploading...'}
                    {att.uploaded && ' - Uploaded'}
                  </p>
                </div>

                {/* Status/Remove */}
                {att.uploading ? (
                  <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                ) : (
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    disabled={isSubmitting}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label="Remove attachment"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}

            {/* Link Attachments */}
            {links.map((link, idx) => (
              <div
                key={`link-${idx}`}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                {/* Link icon */}
                <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
                  <LinkIcon className="w-6 h-6 text-blue-600" />
                </div>

                {/* Link info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {link.url}
                  </p>
                  <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Link
                  </p>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  disabled={isSubmitting}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  aria-label="Remove link"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  );
};

ParentMomentCaptureModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired
  })).isRequired,
  selectedChildId: PropTypes.string,
  onSuccess: PropTypes.func
};

ParentMomentCaptureModal.defaultProps = {
  selectedChildId: null,
  onSuccess: null
};

export default ParentMomentCaptureModal;
