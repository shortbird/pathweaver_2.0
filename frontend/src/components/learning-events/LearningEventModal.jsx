import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const LearningEventModal = ({ isOpen, onClose, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [selectedPillars, setSelectedPillars] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pillars = [
    { id: 'stem_logic', name: 'STEM & Logic', icon: '🔬', color: 'from-blue-500 to-cyan-500' },
    { id: 'life_wellness', name: 'Life & Wellness', icon: '🌱', color: 'from-green-500 to-emerald-500' },
    { id: 'language_communication', name: 'Language', icon: '💬', color: 'from-orange-500 to-yellow-500' },
    { id: 'society_culture', name: 'Society', icon: '🌍', color: 'from-red-500 to-rose-500' },
    { id: 'arts_creativity', name: 'Arts', icon: '🎨', color: 'from-purple-500 to-pink-500' }
  ];

  const togglePillar = (pillarId) => {
    setSelectedPillars(prev =>
      prev.includes(pillarId)
        ? prev.filter(id => id !== pillarId)
        : [...prev, pillarId]
    );
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Please describe what you learned');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/api/learning-events', {
        description: description.trim(),
        pillars: selectedPillars
      });

      if (response.data.success) {
        toast.success('✨ Learning moment captured! Your growth matters.');
        onSuccess && onSuccess(response.data.event);
        handleClose();
      } else {
        toast.error(response.data.error || 'Failed to capture learning moment');
      }
    } catch (error) {
      console.error('Error creating learning event:', error);
      toast.error(error.response?.data?.error || 'Failed to capture learning moment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDescription('');
    setSelectedPillars([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white p-6 rounded-t-xl sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Capture a Learning Moment</h2>
              </div>
              <p className="text-white/90 text-sm">
                Record any moment of growth, discovery, or skill development. Every step of your learning journey matters.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description Field */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What did you learn or discover? *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none transition-all"
              rows={6}
              placeholder="Describe what you learned, created, or figured out..."
              maxLength={5000}
            />
            <div className="mt-1 text-xs text-gray-500 text-right">
              {description.length} / 5000 characters
            </div>
          </div>

          {/* Pillar Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Which skill pillar does this relate to? (Optional)
            </label>
            <p className="text-sm text-gray-600 mb-3">
              You can select multiple pillars. Learning often crosses boundaries!
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {pillars.map((pillar) => (
                <button
                  key={pillar.id}
                  onClick={() => togglePillar(pillar.id)}
                  className={`
                    p-3 rounded-lg border-2 transition-all duration-200
                    ${selectedPillars.includes(pillar.id)
                      ? `bg-gradient-to-r ${pillar.color} text-white border-transparent shadow-md`
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl">{pillar.icon}</span>
                    <span className="text-xs font-medium text-center">{pillar.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Helper Text */}
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-800 mb-1">
                  Tip: Focus on the Process
                </h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Describe not just what you learned, but how you learned it. What challenges did you face? What surprised you? How did this moment of discovery feel?
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Capturing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Capture Moment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningEventModal;
