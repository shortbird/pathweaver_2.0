import PropTypes from 'prop-types';
import { DocumentIcon, LinkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatFileSize } from '../../utils/mediaUtils';

/**
 * Renders a list of file attachment previews and link previews.
 * Shared between ParentMomentCaptureModal and AdvisorMomentCaptureModal.
 */
const AttachmentPreviewList = ({
  attachments = [],
  links = [],
  onRemoveAttachment,
  onRemoveLink,
  disabled = false,
}) => {
  if (attachments.length === 0 && links.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* File Attachments */}
      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
        >
          {/* Preview thumbnail or icon */}
          {att.preview && att.type === 'video' ? (
            <video
              src={att.preview}
              className="w-12 h-12 object-cover rounded bg-black"
              muted
            />
          ) : att.preview ? (
            <img
              src={att.preview}
              alt={att.filename}
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
              {att.filename}
            </p>
            <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {formatFileSize(att.size)}
              {att.uploading && ' - Uploading...'}
              {att.uploaded && ' - Uploaded'}
            </p>
          </div>

          {/* Status / Remove */}
          {att.uploading ? (
            <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          ) : (
            <button
              type="button"
              onClick={() => onRemoveAttachment(att.id)}
              disabled={disabled}
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
          <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center">
            <LinkIcon className="w-6 h-6 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {link.url}
            </p>
            <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Link
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRemoveLink(idx)}
            disabled={disabled}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            aria-label="Remove link"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      ))}
    </div>
  );
};

AttachmentPreviewList.propTypes = {
  attachments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    preview: PropTypes.string,
    type: PropTypes.string,
    filename: PropTypes.string,
    size: PropTypes.number,
    uploading: PropTypes.bool,
    uploaded: PropTypes.bool,
  })),
  links: PropTypes.arrayOf(PropTypes.shape({
    url: PropTypes.string.isRequired,
  })),
  onRemoveAttachment: PropTypes.func.isRequired,
  onRemoveLink: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default AttachmentPreviewList;
