/**
 * DocumentBlock - Displays document evidence with download link
 */

import React from 'react';
import PropTypes from 'prop-types';

const DocumentBlock = ({ block, displayMode }) => {
  const { content } = block;
  const { url, title, filename, file_size, content_type } = content;

  // Get file extension from filename or content_type
  const getFileExtension = () => {
    if (filename) {
      const parts = filename.split('.');
      return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
    }
    if (content_type) {
      const typeMap = {
        'application/pdf': 'PDF',
        'application/msword': 'DOC',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
        'text/plain': 'TXT',
        'application/vnd.ms-excel': 'XLS',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX'
      };
      return typeMap[content_type] || 'FILE';
    }
    return 'FILE';
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extension = getFileExtension();
  const formattedSize = formatFileSize(file_size);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-purple-300 transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
          <span className="text-xs font-bold text-purple-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {extension}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 mb-1 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {title || filename || 'Document'}
          </h4>

          <div className="flex items-center gap-2 text-xs text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {formattedSize && (
              <>
                <span>{formattedSize}</span>
                {filename && <span>•</span>}
              </>
            )}
            {filename && filename !== title && (
              <span className="truncate">{filename}</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>
    </a>
  );
};

DocumentBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.shape({
      url: PropTypes.string.isRequired,
      title: PropTypes.string,
      filename: PropTypes.string,
      file_size: PropTypes.number,
      content_type: PropTypes.string
    }).isRequired
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

DocumentBlock.defaultProps = {
  displayMode: 'full'
};

export default DocumentBlock;
