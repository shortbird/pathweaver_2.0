import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert } from '../ui';
import { PhotoIcon, DocumentIcon, LinkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { advisorAPI } from '../../services/api';

/**
 * Modal for advisors to capture learning moments for a specific student.
 * Adapted from ParentMomentCaptureModal - no child selector needed.
 */
const AdvisorMomentCaptureModal = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  onSuccess = null
}) => {
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setDescription('');
    setAttachments([]);
    setLinks([]);
    setLinkInput('');
    setShowLinkInput(false);
    setError('');
    setIsSubmitting(false);
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

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

  const removeLink = (index) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (!isSubmitting) {
      attachments.forEach(att => {
        if (att.preview) URL.revokeObjectURL(att.preview);
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
      type: type === 'image' && file.type.startsWith('image/') ? 'image' : type,
      uploading: false,
      uploaded: false,
      file_url: null,
      file_name: file.name,
      file_size: file.size
    }));

    setAttachments(prev => [...prev, ...newAttachments]);
    setError('');
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadFile = async (attachment, index) => {
    if (attachment.uploaded) return attachment;

    setAttachments(prev => prev.map((att, i) =>
      i === index ? { ...att, uploading: true } : att
    ));

    try {
      const formData = new FormData();
      formData.append('file', attachment.file);

      const response = await advisorAPI.uploadMomentMedia(studentId, formData);
      const result = response.data;

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
      setAttachments(prev => prev.map((att, i) =>
        i === index ? { ...att, uploading: false } : att
      ));
      throw err;
    }
  };

  const handleSubmit = async () => {
    if (!description.trim() && attachments.length === 0 && links.length === 0) {
      setError('Please add a description, attach a file, or include a link');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const uploadedAttachments = await Promise.all(
        attachments.map((att, idx) => uploadFile(att, idx))
      );

      const media = [
        ...uploadedAttachments
          .filter(att => att.uploaded && att.file_url)
          .map(att => ({
            type: att.type,
            file_url: att.file_url,
            file_name: att.file_name,
            file_size: att.file_size
          })),
        ...links.map(link => ({
          type: 'link',
          url: link.url,
          title: link.title || ''
        }))
      ];

      const response = await advisorAPI.createLearningMoment(studentId, {
        description: description.trim(),
        media
      });

      toast.success('Learning moment captured!');
      if (onSuccess) onSuccess(response.data.moment);
      handleClose();
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to save learning moment';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = description.trim() || attachments.length > 0 || links.length > 0;
  const isUploading = attachments.some(att => att.uploading);

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
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting || isUploading}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSubmitting ? 'Saving...' : 'Save Moment'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Student indicator */}
        <div className="text-sm text-gray-600">
          For <span className="font-semibold text-gray-900">{studentName}</span>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="advisor-moment-desc" className="block text-sm font-semibold text-gray-700 mb-1">
            What happened?
          </label>
          <textarea
            id="advisor-moment-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            placeholder="Describe the learning moment..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all resize-none"
          />
        </div>

        {/* Media Upload Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <PhotoIcon className="w-5 h-5" />
            <span className="font-medium">Photo</span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
            multiple
            onChange={(e) => handleFileSelect(e, 'image')}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50 min-h-[44px]"
          >
            <DocumentIcon className="w-5 h-5" />
            <span className="font-medium">File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
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
          >
            <LinkIcon className="w-5 h-5" />
            <span className="font-medium">Link</span>
          </button>
        </div>

        {/* Link Input */}
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
              placeholder="Paste URL..."
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all min-h-[44px]"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={isSubmitting || !linkInput.trim()}
              className="px-4 py-2 bg-optio-purple text-white rounded-lg font-medium hover:bg-optio-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Add
            </button>
          </div>
        )}

        {/* Attachment Previews */}
        {(attachments.length > 0 || links.length > 0) && (
          <div className="space-y-2">
            {attachments.map((att, idx) => (
              <div key={`file-${idx}`} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                {att.preview ? (
                  <img src={att.preview} alt={att.file_name} className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                    <DocumentIcon className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{att.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(att.file_size)}
                    {att.uploading && ' - Uploading...'}
                    {att.uploaded && ' - Uploaded'}
                  </p>
                </div>
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

            {links.map((link, idx) => (
              <div key={`link-${idx}`} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
                  <LinkIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{link.url}</p>
                  <p className="text-xs text-gray-500">Link</p>
                </div>
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

        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </Modal>
  );
};

AdvisorMomentCaptureModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  studentId: PropTypes.string.isRequired,
  studentName: PropTypes.string.isRequired,
  onSuccess: PropTypes.func,
};

export default AdvisorMomentCaptureModal;
