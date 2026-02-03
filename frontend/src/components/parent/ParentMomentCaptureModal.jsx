import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert } from '../ui';
import { PhotoIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // Reset form when modal opens/closes
  const resetForm = () => {
    setSelectedChild(selectedChildId || (children[0]?.id || ''));
    setDescription('');
    setAttachments([]);
    setError('');
    setIsSubmitting(false);
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

    const newAttachments = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      type: file.type.startsWith('image/') ? 'image' : 'video',
      uploading: false,
      uploaded: false,
      file_url: null,
      file_name: file.name,
      file_size: file.size
    }));

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

    if (!description.trim() && attachments.length === 0) {
      setError('Please add a description or attach at least one photo/video');
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
      const media = uploadedAttachments
        .filter(att => att.uploaded && att.file_url)
        .map(att => ({
          type: att.type,
          file_url: att.file_url,
          file_name: att.file_name,
          file_size: att.file_size
        }));

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
  const isValid = selectedChild && (description.trim() || attachments.length > 0);
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
        <div className="flex gap-3">
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
            onClick={() => videoInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50 min-h-[44px]"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <VideoCameraIcon className="w-5 h-5" />
            <span className="font-medium">Video</span>
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => handleFileSelect(e, 'video')}
            className="hidden"
          />
        </div>

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att, idx) => (
              <div
                key={idx}
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
                    <VideoCameraIcon className="w-6 h-6 text-gray-500" />
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
