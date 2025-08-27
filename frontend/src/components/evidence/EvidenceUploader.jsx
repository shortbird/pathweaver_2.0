import React, { useState, useRef, useEffect } from 'react';

const EvidenceUploader = ({ evidenceType, onChange, error }) => {
  const [textContent, setTextContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  // File size limits
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

  // Allowed file types
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

  useEffect(() => {
    // Reset state when evidence type changes
    setTextContent('');
    setLinkUrl('');
    setLinkTitle('');
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
  }, [evidenceType]);

  const handleTextChange = (e) => {
    const content = e.target.value;
    setTextContent(content);
    onChange({ content });
  };

  const handleLinkChange = (field, value) => {
    if (field === 'url') {
      setLinkUrl(value);
      onChange({ url: value, title: linkTitle });
    } else {
      setLinkTitle(value);
      onChange({ url: linkUrl, title: value });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = evidenceType === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!allowedTypes.includes(file.type)) {
      alert(`Invalid file type. Allowed types: ${allowedTypes.map(t => t.split('/')[1]).join(', ')}`);
      return;
    }

    // Validate file size
    const maxSize = evidenceType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      alert(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setSelectedFile(file);
    onChange({ file });

    // Create preview for images
    if (evidenceType === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      // For videos, just show file info
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    onChange({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderTextInput = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Describe what you did and what you learned (minimum 50 characters)
      </label>
      <textarea
        value={textContent}
        onChange={handleTextChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        rows={6}
        placeholder="Share your experience, challenges you faced, and what you learned..."
        minLength={50}
        maxLength={5000}
      />
      <div className="mt-1 text-xs text-gray-500 text-right">
        {textContent.length} / 5000 characters
      </div>
    </div>
  );

  const renderLinkInput = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Link URL
        </label>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => handleLinkChange('url', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="https://example.com/your-work"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Link Title (optional)
        </label>
        <input
          type="text"
          value={linkTitle}
          onChange={(e) => handleLinkChange('title', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="My Amazing Project"
        />
      </div>
    </div>
  );

  const renderFileInput = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Upload {evidenceType === 'image' ? 'Image' : 'Video'}
      </label>
      
      {!selectedFile ? (
        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 cursor-pointer transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {evidenceType === 'image' 
              ? 'PNG, JPG, GIF up to 10MB'
              : 'MP4, MOV, AVI up to 100MB'}
          </p>
        </div>
      ) : (
        <div className="border border-gray-300 rounded-lg p-4">
          {filePreview && evidenceType === 'image' ? (
            <div className="mb-3">
              <img 
                src={filePreview} 
                alt="Preview" 
                className="max-h-48 mx-auto rounded-lg"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center mb-3">
              <svg className="h-12 w-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 100 4h2a2 2 0 100-4h-.5a1 1 0 000-2H8a2 2 0 012-2z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              type="button"
              onClick={removeFile}
              className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Remove file
            </button>
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept={evidenceType === 'image' ? ALLOWED_IMAGE_TYPES.join(',') : ALLOWED_VIDEO_TYPES.join(',')}
        className="hidden"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {evidenceType === 'text' && renderTextInput()}
      {evidenceType === 'link' && renderLinkInput()}
      {(evidenceType === 'image' || evidenceType === 'video') && renderFileInput()}
      
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default EvidenceUploader;