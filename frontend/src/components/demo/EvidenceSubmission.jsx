import React, { useState, useRef } from 'react';
import { 
  Upload, Image, Video, FileText, Link, 
  CheckCircle, X, Plus, Sparkles 
} from 'lucide-react';

const EvidenceSubmission = ({ task, onSubmit, onBack }) => {
  const [selectedType, setSelectedType] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [textEvidence, setTextEvidence] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const evidenceTypes = [
    { id: 'image', label: 'Photo', icon: Image, color: 'text-blue-600' },
    { id: 'video', label: 'Video', icon: Video, color: 'text-purple-600' },
    { id: 'document', label: 'Document', icon: FileText, color: 'text-green-600' },
    { id: 'text', label: 'Written', icon: FileText, color: 'text-orange-600' },
    { id: 'link', label: 'Link', icon: Link, color: 'text-pink-600' }
  ];

  const sampleEvidence = {
    'image': 'photo_of_performance.jpg',
    'video': 'cooking_process.mp4',
    'document': 'business_plan.pdf',
    'text': 'I learned so much from this experience...',
    'link': 'https://my-portfolio.com/project'
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Simulate file upload
    const fileName = sampleEvidence[selectedType] || 'evidence_file.pdf';
    setUploadedFile({
      name: fileName,
      size: Math.floor(Math.random() * 5000000) + 500000,
      type: selectedType
    });
  };

  const handleFileSelect = () => {
    // Simulate file selection
    const fileName = sampleEvidence[selectedType] || 'evidence_file.pdf';
    setUploadedFile({
      name: fileName,
      size: Math.floor(Math.random() * 5000000) + 500000,
      type: selectedType
    });
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    
    const evidence = {
      type: selectedType,
      content: selectedType === 'text' ? textEvidence : uploadedFile?.name,
      preview: uploadedFile?.name || textEvidence.substring(0, 100)
    };

    // Simulate submission delay
    setTimeout(() => {
      onSubmit(evidence);
      setIsSubmitting(false);
    }, 1500);
  };

  const canSubmit = (selectedType === 'text' && textEvidence.length > 0) || 
                    (selectedType && selectedType !== 'text' && uploadedFile);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
        <h3 className="text-2xl font-bold text-[#003f5c] mb-2">Submit Your Evidence</h3>
        <p className="text-gray-600">
          Show how you completed "{task.title}" - this is what makes your learning real!
        </p>
      </div>

      {/* Evidence Type Selection */}
      {!selectedType && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-4">Choose your evidence type:</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {evidenceTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className="group p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-[#6d469b] hover:shadow-lg transition-all duration-300"
                >
                  <Icon className={`w-8 h-8 ${type.color} mx-auto mb-2 group-hover:scale-110 transition-transform`} />
                  <p className="text-sm font-medium text-gray-700">{type.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Text Evidence Input */}
      {selectedType === 'text' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-700">Write your reflection:</p>
            <button
              onClick={() => setSelectedType(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Change type
            </button>
          </div>
          
          <textarea
            value={textEvidence}
            onChange={(e) => setTextEvidence(e.target.value)}
            placeholder="Describe what you learned, how you completed the task, and what challenges you overcame..."
            className="w-full h-40 p-4 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none resize-none"
          />
          
          <div className="flex justify-between text-sm text-gray-500">
            <span>{textEvidence.length} characters</span>
            <span>Minimum 50 characters recommended</span>
          </div>
        </div>
      )}

      {/* File Upload Area */}
      {selectedType && selectedType !== 'text' && !uploadedFile && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-700">Upload your {selectedType}:</p>
            <button
              onClick={() => setSelectedType(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Change type
            </button>
          </div>
          
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-3 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300
              ${isDragging 
                ? 'border-[#6d469b] bg-[#6d469b]/5' 
                : 'border-gray-300 hover:border-[#6d469b] hover:bg-gray-50'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            
            <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-[#6d469b]' : 'text-gray-400'}`} />
            
            <p className="text-lg font-medium text-gray-700 mb-2">
              {isDragging ? 'Drop your file here' : 'Click or drag to upload'}
            </p>
            
            <p className="text-sm text-gray-500">
              Supported formats: JPG, PNG, PDF, MP4, etc. (Max 10MB)
            </p>
            
            {/* Sample File Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFileSelect();
              }}
              className="mt-4 px-4 py-2 bg-[#6d469b]/10 text-[#6d469b] rounded-lg hover:bg-[#6d469b]/20 transition-colors"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Use Sample File
            </button>
          </div>
        </div>
      )}

      {/* Link Input */}
      {selectedType === 'link' && !uploadedFile && (
        <div className="space-y-4">
          <input
            type="url"
            placeholder="https://example.com/my-project"
            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none"
            onChange={(e) => {
              if (e.target.value.length > 5) {
                setUploadedFile({ name: e.target.value, type: 'link' });
              }
            }}
          />
        </div>
      )}

      {/* Uploaded File Preview */}
      {uploadedFile && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-semibold text-gray-700">Evidence Ready!</p>
                <p className="text-sm text-gray-600">{uploadedFile.name}</p>
                {uploadedFile.size && (
                  <p className="text-xs text-gray-500">
                    {(uploadedFile.size / 1000000).toFixed(2)} MB
                  </p>
                )}
              </div>
            </div>
            
            <button
              onClick={() => setUploadedFile(null)}
              className="p-2 hover:bg-green-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          {/* Preview */}
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-2">Preview:</p>
            {selectedType === 'image' && (
              <div className="h-32 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center">
                <Image className="w-12 h-12 text-gray-400" />
              </div>
            )}
            {selectedType === 'video' && (
              <div className="h-32 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
                <Video className="w-12 h-12 text-gray-400" />
              </div>
            )}
            {selectedType === 'document' && (
              <div className="h-32 bg-gradient-to-br from-green-100 to-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
        >
          Back to Task
        </button>
        
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className={`px-8 py-3 font-semibold rounded-lg transition-all duration-300 flex items-center gap-2
            ${canSubmit 
              ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white hover:shadow-lg' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          {isSubmitting ? (
            <>
              <Sparkles className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Submit Evidence
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EvidenceSubmission;