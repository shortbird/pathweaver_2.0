import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert } from '../ui';
import { PhotoIcon, DocumentIcon, LinkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { advisorAPI } from '../../services/api';
import useMediaAttachments from '../../hooks/useMediaAttachments';
import AttachmentPreviewList from '../shared/AttachmentPreviewList';
import { CAMERA_ACCEPT_STRING, DOCUMENT_ACCEPT_STRING } from '../../utils/mediaUtils';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const media = useMediaAttachments();
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setDescription('');
    setError('');
    setIsSubmitting(false);
    media.reset();
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  const handleFileSelect = async (e, sourceType) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const { errors } = await media.addFiles(files, sourceType);
    if (errors.length > 0) {
      setError(errors[0]);
    } else {
      setError('');
    }
    e.target.value = '';
  };

  const handleAddLink = () => {
    const result = media.addLink();
    if (!result.success && result.error) {
      setError(result.error);
    } else {
      setError('');
    }
  };

  const uploadFile = async (attachment) => {
    if (attachment.uploaded) return attachment;

    media.markUploading(attachment.id);

    try {
      const formData = new FormData();
      formData.append('file', attachment.file);

      const response = await advisorAPI.uploadMomentMedia(studentId, formData);
      const result = response.data;

      media.markUploaded(attachment.id, result.file_url, {
        file_name: result.file_name,
        file_size: result.file_size,
      });

      return {
        ...attachment,
        uploaded: true,
        fileUrl: result.file_url,
        filename: result.file_name,
        size: result.file_size,
      };
    } catch (err) {
      media.markUploaded(attachment.id, null);
      throw err;
    }
  };

  const handleSubmit = async () => {
    if (!description.trim() && media.attachments.length === 0 && media.links.length === 0) {
      setError('Please add a description, attach a file, or include a link');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const uploadedAttachments = await Promise.all(
        media.attachments.map(att => uploadFile(att))
      );

      const mediaPayload = [
        ...uploadedAttachments
          .filter(att => att.uploaded && att.fileUrl)
          .map(att => ({
            type: att.type,
            file_url: att.fileUrl,
            file_name: att.filename,
            file_size: att.size
          })),
        ...media.links.map(link => ({
          type: 'link',
          url: link.url,
          title: ''
        }))
      ];

      const response = await advisorAPI.createLearningMoment(studentId, {
        description: description.trim(),
        media: mediaPayload
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

  const isValid = description.trim() || media.attachments.length > 0 || media.links.length > 0;
  const isUploading = media.attachments.some(att => att.uploading);

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
            <span className="font-medium">Camera</span>
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept={CAMERA_ACCEPT_STRING}
            multiple
            onChange={(e) => handleFileSelect(e, 'camera')}
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
            accept={DOCUMENT_ACCEPT_STRING}
            multiple
            onChange={(e) => handleFileSelect(e, 'document')}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => media.setShowLinkInput(!media.showLinkInput)}
            disabled={isSubmitting}
            className={`flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg transition-colors disabled:opacity-50 min-h-[44px] ${
              media.showLinkInput
                ? 'border-optio-purple text-optio-purple'
                : 'border-gray-300 text-gray-600 hover:border-optio-purple hover:text-optio-purple'
            }`}
          >
            <LinkIcon className="w-5 h-5" />
            <span className="font-medium">Link</span>
          </button>
        </div>

        {/* Link Input */}
        {media.showLinkInput && (
          <div className="flex gap-2">
            <input
              type="url"
              value={media.linkInput}
              onChange={(e) => media.setLinkInput(e.target.value)}
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
              disabled={isSubmitting || !media.linkInput.trim()}
              className="px-4 py-2 bg-optio-purple text-white rounded-lg font-medium hover:bg-optio-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Add
            </button>
          </div>
        )}

        {/* Attachment Previews */}
        <AttachmentPreviewList
          attachments={media.attachments}
          links={media.links}
          onRemoveAttachment={media.removeAttachment}
          onRemoveLink={media.removeLink}
          disabled={isSubmitting}
        />

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
