import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import TrackSelector from '../interest-tracks/TrackSelector';
import SparkSelector from '../curiosity-threads/SparkSelector';

const PILLAR_CONFIG = {
  arts_creativity: {
    label: 'Arts & Creativity',
    light: 'bg-pink-50 border-pink-200 text-pink-700 hover:border-pink-300',
    selected: 'bg-pink-600 border-pink-600 text-white'
  },
  stem_logic: {
    label: 'STEM & Logic',
    light: 'bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-300',
    selected: 'bg-blue-600 border-blue-600 text-white'
  },
  life_wellness: {
    label: 'Life & Wellness',
    light: 'bg-green-50 border-green-200 text-green-700 hover:border-green-300',
    selected: 'bg-green-600 border-green-600 text-white'
  },
  language_communication: {
    label: 'Language & Communication',
    light: 'bg-orange-50 border-orange-200 text-orange-700 hover:border-orange-300',
    selected: 'bg-orange-600 border-orange-600 text-white'
  },
  society_culture: {
    label: 'Society & Culture',
    light: 'bg-purple-50 border-purple-200 text-purple-700 hover:border-purple-300',
    selected: 'bg-purple-600 border-purple-600 text-white'
  }
};

const LearningEventModal = ({
  isOpen,
  onClose,
  onSuccess,
  quickMode = false,
  initialTrackId = null,
  initialParentMomentId = null,
  editEvent = null  // Pass existing event to edit
}) => {
  const isEditMode = !!editEvent;
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [selectedPillars, setSelectedPillars] = useState([]);
  const [evidenceBlocks, setEvidenceBlocks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(!quickMode);

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);

  // Track and thread state
  const [trackId, setTrackId] = useState(initialTrackId);
  const [parentMomentId, setParentMomentId] = useState(initialParentMomentId);

  const fileInputRef = useRef(null);
  const descriptionRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const blockTypes = {
    text: { label: 'Text Note', color: 'bg-gray-50', border: 'border-gray-200' },
    image: { label: 'Image', color: 'bg-gray-50', border: 'border-gray-200' },
    video: { label: 'Video', color: 'bg-gray-50', border: 'border-gray-200' },
    link: { label: 'Link', color: 'bg-gray-50', border: 'border-gray-200' },
    document: { label: 'Document', color: 'bg-gray-50', border: 'border-gray-200' }
  };

  // Focus description field when modal opens
  useEffect(() => {
    if (isOpen && descriptionRef.current) {
      setTimeout(() => descriptionRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal opens (or populate from editEvent)
  useEffect(() => {
    if (isOpen) {
      if (editEvent) {
        // Edit mode - populate from existing event
        setDescription(editEvent.description || '');
        setTitle(editEvent.title || '');
        setSelectedPillars(editEvent.pillars || []);
        setEvidenceBlocks(
          (editEvent.evidence_blocks || editEvent.learning_event_evidence_blocks || []).map((block, index) => ({
            id: block.id || `block_${Date.now()}_${index}`,
            block_type: block.block_type,
            content: block.content || {},
            order_index: block.order_index ?? index
          }))
        );
        setTrackId(editEvent.track_id || null);
        setParentMomentId(editEvent.parent_moment_id || null);
        setShowAdvanced(true); // Always show advanced in edit mode
        setAiSuggestions(null);
        setAiDismissed(true); // Don't show AI suggestions in edit mode
      } else {
        // Create mode - reset all fields
        setDescription('');
        setTitle('');
        setSelectedPillars([]);
        setEvidenceBlocks([]);
        setAiSuggestions(null);
        setAiDismissed(false);
        setShowAdvanced(!quickMode);
        setTrackId(initialTrackId);
        setParentMomentId(initialParentMomentId);
      }
    }
  }, [isOpen, quickMode, initialTrackId, initialParentMomentId, editEvent]);

  // Debounced AI suggestions
  const fetchAISuggestions = useCallback(async (text) => {
    if (text.length < 30 || aiDismissed) return;

    setIsLoadingAI(true);
    try {
      const response = await api.post('/api/learning-events/ai-suggestions', {
        description: text
      });

      if (response.data.success) {
        setAiSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
    } finally {
      setIsLoadingAI(false);
    }
  }, [aiDismissed]);

  const handleDescriptionChange = (e) => {
    const text = e.target.value;
    setDescription(text);

    // Debounce AI suggestions
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (text.length >= 30 && !aiDismissed) {
      debounceTimerRef.current = setTimeout(() => {
        fetchAISuggestions(text);
      }, 1500);
    }
  };

  const acceptAISuggestion = (type) => {
    if (!aiSuggestions) return;

    if (type === 'title' && aiSuggestions.title) {
      setTitle(aiSuggestions.title);
      toast.success('Title applied');
    }
    if (type === 'pillars' && aiSuggestions.pillars?.length > 0) {
      setSelectedPillars(aiSuggestions.pillars);
      toast.success('Pillars applied');
    }
    if (type === 'all') {
      if (aiSuggestions.title) setTitle(aiSuggestions.title);
      if (aiSuggestions.pillars?.length > 0) setSelectedPillars(aiSuggestions.pillars);
      toast.success('All suggestions applied');
    }
  };

  const dismissAISuggestions = () => {
    setAiSuggestions(null);
    setAiDismissed(true);
  };

  const togglePillar = (pillarKey) => {
    setSelectedPillars(prev =>
      prev.includes(pillarKey)
        ? prev.filter(p => p !== pillarKey)
        : [...prev, pillarKey]
    );
  };

  const addBlock = (type) => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      block_type: type,
      content: getDefaultContent(type),
      order_index: evidenceBlocks.length
    };
    setEvidenceBlocks([...evidenceBlocks, newBlock]);
    setShowAdvanced(true);
  };

  const getDefaultContent = (type) => {
    switch (type) {
      case 'text':
        return { text: '' };
      case 'image':
        return { url: '', alt: '', caption: '' };
      case 'video':
        return { url: '', title: '' };
      case 'link':
        return { url: '', title: '', description: '' };
      case 'document':
        return { url: '', title: '', filename: '' };
      default:
        return {};
    }
  };

  const updateBlock = (blockId, newContent) => {
    setEvidenceBlocks(evidenceBlocks.map(block =>
      block.id === blockId
        ? { ...block, content: { ...block.content, ...newContent } }
        : block
    ));
  };

  const deleteBlock = (blockId) => {
    const block = evidenceBlocks.find(b => b.id === blockId);
    if (block?.content?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(block.content.url);
    }
    setEvidenceBlocks(evidenceBlocks.filter(block => block.id !== blockId));
  };

  const handleFileUpload = async (file, blockId, type) => {
    try {
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(`File is too large (${fileSizeMB}MB). Maximum size is 10MB.`);
        return;
      }

      const localUrl = URL.createObjectURL(file);
      updateBlock(blockId, {
        url: localUrl,
        _fileToUpload: file,
        filename: file.name,
        alt: type === 'image' ? file.name : undefined
      });
    } catch (error) {
      console.error('File preparation error:', error);
      toast.error('Failed to prepare file for upload');
    }
  };

  const uploadBlockFiles = async (eventId) => {
    const uploadPromises = evidenceBlocks.map(async (block, index) => {
      const file = block.content._fileToUpload;
      if (file) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('block_type', block.block_type);
          formData.append('order_index', index);

          const response = await api.post(`/api/learning-events/${eventId}/upload`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

          if (response.data.success) {
            return { success: true, block_id: response.data.block_id, file_url: response.data.file_url };
          }
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          return { success: false, filename: file.name };
        }
      }
      return { success: true };
    });

    return await Promise.all(uploadPromises);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please describe what you learned');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build request payload
      const payload = {
        description: description.trim()
      };

      // Add optional fields
      if (title.trim()) payload.title = title.trim();
      if (selectedPillars.length > 0) payload.pillars = selectedPillars;
      if (trackId) payload.track_id = trackId;
      if (parentMomentId) payload.parent_moment_id = parentMomentId;

      // Store AI suggestions metadata if used (only in create mode)
      if (!isEditMode && aiSuggestions) {
        if (title === aiSuggestions.title) {
          payload.ai_generated_title = aiSuggestions.title;
        }
        if (JSON.stringify(selectedPillars.sort()) === JSON.stringify(aiSuggestions.pillars?.sort())) {
          payload.ai_suggested_pillars = aiSuggestions.pillars;
        }
      }

      let eventId;
      let response;

      if (isEditMode) {
        // Update existing event
        response = await api.put(`/api/learning-events/${editEvent.id}`, payload);
        eventId = editEvent.id;
      } else {
        // Create new event
        const endpoint = quickMode && evidenceBlocks.length === 0
          ? '/api/learning-events/quick'
          : '/api/learning-events';
        response = await api.post(endpoint, payload);
        eventId = response.data.event?.id;
      }

      if (response.data.success) {
        // Save evidence blocks if any
        if (evidenceBlocks.length > 0) {
          const cleanedBlocks = evidenceBlocks.map((block, index) => {
            const cleanContent = { ...block.content };
            if (cleanContent.url?.startsWith('blob:')) {
              delete cleanContent.url;
            }
            delete cleanContent._fileToUpload;

            return {
              block_type: block.block_type,
              content: cleanContent,
              order_index: index
            };
          });

          await api.post(`/api/learning-events/${eventId}/evidence`, {
            blocks: cleanedBlocks
          });

          const uploadResults = await uploadBlockFiles(eventId);
          const failedUploads = uploadResults.filter(r => !r.success);

          if (failedUploads.length > 0) {
            toast.error(`Some files failed to upload: ${failedUploads.map(f => f.filename).join(', ')}`);
          }
        }

        const successMessage = isEditMode
          ? 'Learning moment updated!'
          : (quickMode ? 'Moment captured!' : 'Learning moment captured successfully.');
        toast.success(successMessage);
        onSuccess && onSuccess(response.data.event);
        handleClose();
      } else {
        toast.error(response.data.error || 'Failed to save learning moment');
      }
    } catch (error) {
      console.error('Error saving learning event:', error);
      toast.error(error.response?.data?.error || 'Failed to save learning moment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    evidenceBlocks.forEach(block => {
      if (block.content?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(block.content.url);
      }
    });

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setDescription('');
    setTitle('');
    setSelectedPillars([]);
    setEvidenceBlocks([]);
    setAiSuggestions(null);
    setAiDismissed(false);
    onClose();
  };

  const renderTextBlock = (block) => (
    <textarea
      value={block.content.text || ''}
      onChange={(e) => updateBlock(block.id, { text: e.target.value })}
      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-base bg-white"
      rows={3}
      placeholder="Add a note..."
    />
  );

  const renderImageBlock = (block) => (
    <div>
      {block.content.url ? (
        <div className="relative">
          <img
            src={block.content.url}
            alt={block.content.alt || ''}
            className="w-full max-h-64 object-contain rounded-lg border border-gray-200"
          />
          <button
            onClick={() => updateBlock(block.id, { url: '', alt: '', caption: '' })}
            className="absolute top-2 right-2 p-1.5 bg-gray-900/70 text-white rounded-lg hover:bg-gray-900"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-optio-purple hover:bg-purple-50/50 transition-colors"
          onClick={() => {
            fileInputRef.current.accept = 'image/*';
            fileInputRef.current.onchange = (e) => {
              const file = e.target.files[0];
              if (file) handleFileUpload(file, block.id, 'image');
            };
            fileInputRef.current.click();
          }}
        >
          <p className="text-sm text-gray-500">Click to upload an image</p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF up to 10MB</p>
        </div>
      )}
    </div>
  );

  const renderVideoBlock = (block) => (
    <div className="space-y-2">
      <input
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
        placeholder="YouTube, Vimeo, or video URL"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
        placeholder="Title (optional)"
      />
    </div>
  );

  const renderLinkBlock = (block) => (
    <div className="space-y-2">
      <input
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
        placeholder="https://example.com"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
        placeholder="Title (optional)"
      />
    </div>
  );

  const renderDocumentBlock = (block) => (
    <div>
      {block.content.url ? (
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-900">{block.content.filename || 'Document'}</p>
          </div>
          <button
            onClick={() => updateBlock(block.id, { url: '', title: '', filename: '' })}
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className="border border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-optio-purple hover:bg-purple-50/50 transition-colors"
          onClick={() => {
            fileInputRef.current.accept = '.pdf,.doc,.docx';
            fileInputRef.current.onchange = (e) => {
              const file = e.target.files[0];
              if (file) handleFileUpload(file, block.id, 'document');
            };
            fileInputRef.current.click();
          }}
        >
          <p className="text-sm text-gray-500">Click to upload a document</p>
          <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX up to 10MB</p>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-6 rounded-t-xl sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {isEditMode
                  ? 'Edit Learning Moment'
                  : (quickMode ? 'Quick Capture' : 'Capture a Learning Moment')}
              </h2>
              <p className="text-white/90 text-sm">
                {isEditMode
                  ? 'Update your moment or add evidence.'
                  : (quickMode
                    ? 'Just describe what you learned. Details are optional.'
                    : 'Record any moment of growth, discovery, or skill development.')}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description Field */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={handleDescriptionChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-base bg-white"
              rows={4}
              placeholder="What did you learn, create, or figure out?"
              maxLength={5000}
            />
            <div className="mt-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                {isLoadingAI && (
                  <span className="text-xs text-gray-400">
                    Getting suggestions...
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {description.length} / 5000
              </span>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          {aiSuggestions && !aiDismissed && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Suggestions</p>
                </div>
                <button
                  onClick={dismissAISuggestions}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Suggested Title */}
                {aiSuggestions.title && (
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Title</p>
                      <p className="text-sm font-medium text-gray-900">{aiSuggestions.title}</p>
                    </div>
                    <button
                      onClick={() => acceptAISuggestion('title')}
                      className="ml-3 px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg hover:border-optio-purple hover:text-optio-purple transition-colors"
                    >
                      Use
                    </button>
                  </div>
                )}

                {/* Suggested Pillars */}
                {aiSuggestions.pillars?.length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Pillars</p>
                      <div className="flex flex-wrap gap-1">
                        {aiSuggestions.pillars.map(pillar => (
                          <span
                            key={pillar}
                            className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700"
                          >
                            {PILLAR_CONFIG[pillar]?.label || pillar}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => acceptAISuggestion('pillars')}
                      className="ml-3 px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg hover:border-optio-purple hover:text-optio-purple transition-colors"
                    >
                      Use
                    </button>
                  </div>
                )}

                {/* Apply All */}
                {aiSuggestions.title && aiSuggestions.pillars?.length > 0 && (
                  <button
                    onClick={() => acceptAISuggestion('all')}
                    className="w-full py-2 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
                  >
                    Apply All
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Advanced Options Toggle (for quick mode) */}
          {quickMode && (
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mb-4 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              {showAdvanced ? 'Hide' : 'Show'} additional options
            </button>
          )}

          {/* Advanced Fields */}
          {showAdvanced && (
            <>
              {/* Title Field */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
                  placeholder="Give your moment a short title"
                  maxLength={200}
                />
              </div>

              {/* Pillars Selection */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Learning Pillars
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PILLAR_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => togglePillar(key)}
                      className={`
                        px-4 py-2 rounded-lg border text-sm font-medium transition-all
                        ${selectedPillars.includes(key) ? config.selected : config.light}
                      `}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic of Interest Selection */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Topic of Interest
                </label>
                <TrackSelector
                  value={trackId}
                  onChange={setTrackId}
                  placeholder="Select or create a topic"
                  showAISuggestion={description.length >= 30}
                  momentDescription={description}
                />
              </div>

              {/* Curiosity Thread / Spark Selector */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Sparked By
                </label>
                <SparkSelector
                  value={parentMomentId}
                  onChange={setParentMomentId}
                />
              </div>

              {/* Evidence Blocks */}
              {evidenceBlocks.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Evidence
                  </label>
                  <div className="space-y-3">
                    {evidenceBlocks.map((block) => {
                      const config = blockTypes[block.block_type];
                      return (
                        <div key={block.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{config.label}</span>
                            <button
                              onClick={() => deleteBlock(block.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                          {block.block_type === 'text' && renderTextBlock(block)}
                          {block.block_type === 'image' && renderImageBlock(block)}
                          {block.block_type === 'video' && renderVideoBlock(block)}
                          {block.block_type === 'link' && renderLinkBlock(block)}
                          {block.block_type === 'document' && renderDocumentBlock(block)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add Evidence Block Buttons */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Add Evidence
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(blockTypes).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => addBlock(type)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:border-optio-purple hover:text-optio-purple transition-colors"
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleClose}
              className="min-h-[44px] w-full sm:w-auto flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="min-h-[44px] w-full sm:w-auto flex-1 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{isEditMode ? 'Saving...' : 'Capturing...'}</span>
                </>
              ) : (
                <span>{isEditMode ? 'Save Changes' : (quickMode ? 'Capture' : 'Capture Moment')}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default LearningEventModal;
