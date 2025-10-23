import React, { useState, useRef, useEffect, useCallback } from 'react';
import Button from '../ui/Button';

const ImprovedEvidenceUploader = ({ evidenceType, onChange, error, taskDescription = '', onTypeChange }) => {
  const [textContent, setTextContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // File size limits
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25MB

  // Allowed file types
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
  const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  // Evidence type icons and colors
  const evidenceTypeConfig = {
    text: {
      icon: '📝',
      label: 'Written Response',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    link: {
      icon: '🔗',
      label: 'External Link',
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    image: {
      icon: '📸',
      label: 'Image',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    video: {
      icon: '🎥',
      label: 'Video Link',
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    },
    document: {
      icon: '📄',
      label: 'Document',
      color: 'from-gray-500 to-gray-700',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200'
    }
  };

  // Evidence templates and examples
  const evidenceTemplates = {
    text: [
      {
        title: 'Project Reflection',
        prompt: 'Describe your project, the challenges you faced, and how you overcame them...',
        example: 'I built a web application that helps users track their learning progress. The biggest challenge was...'
      },
      {
        title: 'Learning Summary',
        prompt: 'Summarize what you learned and how you can apply it...',
        example: 'Through this quest, I learned three key concepts: First,...'
      }
    ],
    link: [
      {
        title: 'GitHub Repository',
        placeholder: 'https://github.com/username/repository',
        tip: 'Share your code repository with clear documentation'
      },
      {
        title: 'Live Demo',
        placeholder: 'https://your-project.netlify.app',
        tip: 'Provide a working demo of your project'
      },
      {
        title: 'Blog Post',
        placeholder: 'https://medium.com/@username/article',
        tip: 'Share a detailed write-up of your learning journey'
      }
    ],
    image: [
      { tip: 'Include full screen context', icon: '🖥️' },
      { tip: 'Show completion status clearly', icon: '✅' },
      { tip: 'Highlight relevant sections', icon: '🎯' },
      { tip: 'Ensure text is readable', icon: '👁️' }
    ],
    video: [
      { tip: 'Keep under 2 minutes', icon: '⏱️' },
      { tip: 'Explain your process clearly', icon: '🎤' },
      { tip: 'Show your work in action', icon: '🎬' },
      { tip: 'Good lighting and audio', icon: '💡' }
    ],
    document: [
      { tip: 'Include your name and date', icon: '📅' },
      { tip: 'Use clear formatting', icon: '📐' },
      { tip: 'Add relevant diagrams', icon: '📊' },
      { tip: 'Cite your sources', icon: '📚' }
    ]
  };

  useEffect(() => {
    // Reset state when evidence type changes
    setTextContent('');
    setLinkUrl('');
    setLinkTitle('');
    setSelectedFile(null);
    setFilePreview(null);
    setUploadProgress(0);
    setShowTemplates(false);
  }, [evidenceType]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect({ target: { files: [files[0]] } });
    }
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

    let allowedTypes = [];
    let maxSize = 0;

    switch (evidenceType) {
      case 'image':
        allowedTypes = ALLOWED_IMAGE_TYPES;
        maxSize = MAX_IMAGE_SIZE;
        break;
      case 'document':
        allowedTypes = ALLOWED_DOCUMENT_TYPES;
        maxSize = MAX_DOCUMENT_SIZE;
        break;
      default:
        return;
    }

    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      alert(`Invalid file type. Allowed types: ${allowedTypes.map(t => t.split('/')[1]).join(', ')}`);
      return;
    }

    // Validate file size
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
    }

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 100);
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

  const applyTemplate = (template) => {
    if (evidenceType === 'text' && template.example) {
      setTextContent(template.example);
      onChange({ content: template.example });
    } else if (evidenceType === 'link' && template.placeholder) {
      setLinkUrl(template.placeholder);
      setLinkTitle(template.title);
      onChange({ url: template.placeholder, title: template.title });
    }
    setShowTemplates(false);
  };

  const renderEvidenceTypeSelector = () => (
    <div className="mb-6">
      <label className="block text-sm font-semibold text-gray-700 mb-3">
        Choose Evidence Type
      </label>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Object.entries(evidenceTypeConfig).map(([type, config]) => (
          <button
            key={type}
            type="button"
            onClick={() => onTypeChange && onTypeChange(type)}
            className={`
              relative p-3 rounded-xl border-2 transition-all duration-200
              ${evidenceType === type 
                ? `${config.borderColor} ${config.bgColor} border-opacity-100 shadow-md` 
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl">{config.icon}</span>
              <span className={`text-xs font-medium ${evidenceType === type ? 'text-gray-900' : 'text-gray-600'}`}>
                {config.label}
              </span>
            </div>
            {evidenceType === type && (
              <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${config.color} rounded-b-lg`} />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTextInput = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <label className="block text-sm font-semibold text-gray-700">
          Written Response
        </label>
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-sm text-optio-purple hover:text-optio-pink font-medium transition-colors"
        >
          {showTemplates ? 'Hide Templates' : 'Use Template'}
        </button>
      </div>

      {showTemplates && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
          {evidenceTemplates.text.map((template, idx) => (
            <div 
              key={idx}
              className="p-3 bg-white rounded-lg border border-blue-100 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => applyTemplate(template)}
            >
              <h4 className="font-medium text-sm text-gray-900 mb-1">{template.title}</h4>
              <p className="text-xs text-gray-600 line-clamp-2">{template.prompt}</p>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <textarea
          value={textContent}
          onChange={handleTextChange}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none transition-all"
          rows={8}
          placeholder="Share your experience, challenges you faced, and what you learned..."
          minLength={50}
          maxLength={5000}
        />
        <div className="absolute bottom-3 right-3 text-xs text-gray-500">
          {textContent.length} / 5000
        </div>
      </div>

      {textContent.length > 0 && textContent.length < 50 && (
        <p className="text-xs text-orange-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Minimum 50 characters required
        </p>
      )}
    </div>
  );

  const renderLinkInput = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <label className="block text-sm font-semibold text-gray-700">
          External Link
        </label>
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-sm text-optio-purple hover:text-optio-pink font-medium transition-colors"
        >
          {showTemplates ? 'Hide Examples' : 'See Examples'}
        </button>
      </div>

      {showTemplates && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-purple-50 rounded-xl border border-purple-200">
          {evidenceTemplates.link.map((template, idx) => (
            <div 
              key={idx}
              className="p-3 bg-white rounded-lg border border-purple-100 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => applyTemplate(template)}
            >
              <h4 className="font-medium text-sm text-gray-900 mb-1">{template.title}</h4>
              <p className="text-xs text-gray-500 mb-2 font-mono truncate">{template.placeholder}</p>
              <p className="text-xs text-gray-600">{template.tip}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            URL *
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => handleLinkChange('url', e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent transition-all"
            placeholder="https://example.com/your-work"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Display Title (optional)
          </label>
          <input
            type="text"
            value={linkTitle}
            onChange={(e) => handleLinkChange('title', e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent transition-all"
            placeholder="My Amazing Project"
          />
        </div>
      </div>

      {linkUrl && (
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
          <p className="text-xs text-gray-600 mb-1">Preview:</p>
          <a 
            href={linkUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-optio-purple hover:text-optio-pink font-medium break-all"
          >
            {linkTitle || linkUrl}
          </a>
        </div>
      )}
    </div>
  );

  const renderFileInput = () => {
    const config = evidenceTypeConfig[evidenceType];
    const tips = evidenceTemplates[evidenceType] || [];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <label className="block text-sm font-semibold text-gray-700">
            Upload {config.label}
          </label>
          {tips.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-sm text-optio-purple hover:text-optio-pink font-medium transition-colors"
            >
              {showTemplates ? 'Hide Tips' : 'Show Tips'}
            </button>
          )}
        </div>

        {showTemplates && tips.length > 0 && (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 p-4 ${config.bgColor} rounded-xl border ${config.borderColor}`}>
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                <span className="text-lg">{tip.icon}</span>
                <span>{tip.tip}</span>
              </div>
            ))}
          </div>
        )}

        {!selectedFile ? (
          <div 
            ref={dropZoneRef}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
              ${isDragging 
                ? `${config.borderColor} ${config.bgColor} border-opacity-100` 
                : 'border-gray-300 hover:border-gray-400 bg-white'
              }
            `}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={`text-5xl mb-3 ${isDragging ? 'animate-bounce' : ''}`}>
              {config.icon}
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              {isDragging ? 'Drop your file here!' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-xs text-gray-500">
              {evidenceType === 'image' && 'PNG, JPG, GIF up to 10MB'}
              {evidenceType === 'document' && 'PDF, DOC, DOCX up to 25MB'}
            </p>
            
            {isDragging && (
              <div className={`absolute inset-0 bg-gradient-to-r ${config.color} opacity-10 rounded-xl pointer-events-none`} />
            )}
          </div>
        ) : (
          <div className={`border-2 ${config.borderColor} ${config.bgColor} rounded-xl p-4`}>
            {filePreview && evidenceType === 'image' && (
              <div className="mb-4">
                <img 
                  src={filePreview} 
                  alt="Preview" 
                  className="max-h-64 mx-auto rounded-lg shadow-md"
                />
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{config.icon}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${config.color} rounded-full transition-all duration-300`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadProgress === 100 && (
              <div className="mt-4 flex items-center gap-2 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">Ready to submit!</span>
              </div>
            )}
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept={
            evidenceType === 'image' ? ALLOWED_IMAGE_TYPES.join(',') :
            evidenceType === 'document' ? ALLOWED_DOCUMENT_TYPES.join(',') : ''
          }
          className="hidden"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {onTypeChange && renderEvidenceTypeSelector()}
      
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        {evidenceType === 'text' && renderTextInput()}
        {(evidenceType === 'link' || evidenceType === 'video') && renderLinkInput()}
        {['image', 'document'].includes(evidenceType) && renderFileInput()}
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Context-aware help text */}
      {taskDescription && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Task Context
          </h4>
          <p className="text-xs text-gray-600">{taskDescription}</p>
        </div>
      )}
    </div>
  );
};

export default ImprovedEvidenceUploader;