import { useState, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { parentAPI } from '../../services/api';
import toast from 'react-hot-toast';

const EVIDENCE_TYPES = [
  { value: 'text', label: 'Text', icon: '📝', description: 'Written explanation' },
  { value: 'link', label: 'Link', icon: '🔗', description: 'External URL' },
  { value: 'image', label: 'Image', icon: '📸', description: 'Photo upload' },
  { value: 'video', label: 'Video', icon: '🎥', description: 'Video link' },
  { value: 'document', label: 'Document', icon: '📄', description: 'PDF/Doc file' }
];

export default function EvidenceUploadForm({ taskId, studentId, onCancel, onSuccess }) {
  const [evidenceType, setEvidenceType] = useState('text');
  const [content, setContent] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState('url');
  const [pendingFile, setPendingFile] = useState(null);
  const fileInputRef = useRef(null);

  // Allowed file types
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
  const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx'];

  const handleFileSelect = (file, type) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max 10MB.`);
      return;
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

    if (type === 'image') {
      // Check both MIME type and extension for better compatibility
      if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !ALLOWED_IMAGE_EXTENSIONS.includes(fileExtension)) {
        toast.error(`Unsupported image format (.${fileExtension || 'unknown'}). Please use JPG, PNG, GIF, WebP, or HEIC.`);
        return;
      }
    }

    if (type === 'document') {
      if (!ALLOWED_DOCUMENT_TYPES.includes(file.type) && !ALLOWED_DOCUMENT_EXTENSIONS.includes(fileExtension)) {
        toast.error(`Unsupported document format (.${fileExtension || 'unknown'}). Please use PDF, DOC, or DOCX.`);
        return;
      }
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingFile(file);
    setContent({
      url: previewUrl,
      filename: file.name,
      ...(type === 'image' ? { alt: file.name } : { title: file.name })
    });
  };

  const handleSubmit = async () => {
    if (!validateContent()) return;

    setUploading(true);
    try {
      let fileUrl = null;

      // If there's a pending file, upload it first to get a URL
      if (pendingFile) {
        const fileFormData = new FormData();
        fileFormData.append('files', pendingFile); // Backend expects 'files' field name

        const uploadResponse = await parentAPI.uploadFile(fileFormData);
        // Response format: { files: [{ url: '...', ... }], count: 1 }
        if (uploadResponse.data.files && uploadResponse.data.files.length > 0) {
          fileUrl = uploadResponse.data.files[0].url;
        } else {
          throw new Error('File upload failed - no URL returned');
        }
      }

      // Build content object based on evidence type (backend expects this format)
      let blockContent = {};
      if (evidenceType === 'text') {
        blockContent = { text: content.text || '' };
      } else if (evidenceType === 'link') {
        blockContent = { url: content.url || '', title: content.title || '' };
      } else if (evidenceType === 'video') {
        blockContent = { url: content.url || '' };
      } else if (evidenceType === 'image') {
        blockContent = {
          url: fileUrl || content.url || '',
          alt: content.alt || content.filename || 'Uploaded image'
        };
      } else if (evidenceType === 'document') {
        blockContent = {
          url: fileUrl || content.url || '',
          title: content.title || content.filename || 'Uploaded document'
        };
      }

      // Send JSON request to helper evidence endpoint
      await parentAPI.uploadEvidence({
        student_id: studentId,
        task_id: taskId,
        block_type: evidenceType,
        content: blockContent
      });

      // Cleanup blob URLs
      if (content.url?.startsWith('blob:')) {
        URL.revokeObjectURL(content.url);
      }

      toast.success('Evidence uploaded successfully!');
      onSuccess();
    } catch (error) {
      console.error('Error uploading evidence:', error);
      toast.error(error.response?.data?.error || 'Failed to upload evidence');
    } finally {
      setUploading(false);
    }
  };

  const validateContent = () => {
    switch (evidenceType) {
      case 'text':
        if (!content.text?.trim()) {
          toast.error('Please enter text content');
          return false;
        }
        break;
      case 'link':
      case 'video':
        if (!content.url?.trim()) {
          toast.error('Please enter a URL');
          return false;
        }
        if (!content.url.startsWith('http://') && !content.url.startsWith('https://')) {
          toast.error('URL must start with http:// or https://');
          return false;
        }
        break;
      case 'image':
      case 'document':
        if (uploadMode === 'file' && !pendingFile) {
          toast.error('Please select a file');
          return false;
        }
        if (uploadMode === 'url' && !content.url?.trim()) {
          toast.error('Please enter a URL');
          return false;
        }
        break;
    }
    return true;
  };

  const renderContentEditor = () => {
    switch (evidenceType) {
      case 'text':
        return (
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
            rows="4"
            placeholder="Enter text explanation..."
            value={content.text || ''}
            onChange={(e) => setContent({ text: e.target.value })}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          />
        );

      case 'link':
      case 'video':
        return (
          <div className="space-y-2">
            <input
              type="url"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple"
              placeholder={evidenceType === 'video' ? 'Video URL (YouTube, Vimeo)' : 'https://example.com'}
              value={content.url || ''}
              onChange={(e) => setContent({ ...content, url: e.target.value })}
              style={{ fontFamily: 'Poppins, sans-serif' }}
            />
            {evidenceType === 'link' && (
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple"
                placeholder="Link title (optional)"
                value={content.title || ''}
                onChange={(e) => setContent({ ...content, title: e.target.value })}
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
            )}
          </div>
        );

      case 'image':
      case 'document':
        return (
          <div className="space-y-2">
            {/* Toggle upload mode */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadMode('file');
                  setContent({});
                  setPendingFile(null);
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  uploadMode === 'file'
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                📤 Upload File
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadMode('url');
                  setContent({});
                  setPendingFile(null);
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  uploadMode === 'url'
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                🔗 Enter URL
              </button>
            </div>

            {uploadMode === 'file' ? (
              <div>
                {content.url ? (
                  evidenceType === 'image' ? (
                    <div className="relative group">
                      <img
                        src={content.url}
                        alt={content.alt || 'Evidence image preview'}
                        className="w-full max-h-48 object-contain rounded-lg border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (content.url?.startsWith('blob:')) URL.revokeObjectURL(content.url);
                          setContent({});
                          setPendingFile(null);
                        }}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                      <p className="mt-2 text-sm text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>{content.filename}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border-2 border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">📄</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>{content.filename}</p>
                          <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {pendingFile ? `${(pendingFile.size / 1024).toFixed(1)} KB` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (content.url?.startsWith('blob:')) URL.revokeObjectURL(content.url);
                          setContent({});
                          setPendingFile(null);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  )
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-optio-purple transition-colors"
                  >
                    <div className="text-3xl mb-2">{evidenceType === 'image' ? '📸' : '📄'}</div>
                    <p className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Click to upload {evidenceType}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {evidenceType === 'image' ? 'JPG, PNG, GIF, WebP, HEIC up to 10MB' : 'PDF, DOC, DOCX up to 10MB'}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={evidenceType === 'image' ? '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif' : '.pdf,.doc,.docx'}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file, evidenceType);
                  }}
                />
              </div>
            ) : (
              <input
                type="url"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple"
                placeholder={`https://example.com/${evidenceType === 'image' ? 'image.jpg' : 'document.pdf'}`}
                value={content.url || ''}
                onChange={(e) => setContent({ url: e.target.value })}
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Add Evidence
        </h4>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Evidence Type Selector */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {EVIDENCE_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => {
              setEvidenceType(type.value);
              setContent({});
              setPendingFile(null);
            }}
            className={`p-2 text-center border-2 rounded-lg transition-all ${
              evidenceType === type.value
                ? 'border-optio-purple bg-white'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-lg sm:text-xl mb-1">{type.icon}</div>
            <div className="text-xs font-semibold text-gray-900 hidden sm:block" style={{ fontFamily: 'Poppins, sans-serif' }}>{type.label}</div>
          </button>
        ))}
      </div>

      {/* Content Editor */}
      <div>{renderContentEditor()}</div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          {uploading ? 'Uploading...' : 'Upload Evidence'}
        </button>
      </div>

      <p className="text-xs text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Your student will see this evidence when they work on this task. They can edit or remove it before completing.
      </p>
    </div>
  );
}
