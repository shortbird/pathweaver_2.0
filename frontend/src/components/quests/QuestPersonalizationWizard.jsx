import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const APPROACH_OPTIONS = [
  {
    id: 'real_world',
    title: 'Real-World Project',
    description: 'Apply this learning to something you care about (sports, hobbies, interests)',
    icon: '🌍'
  },
  {
    id: 'traditional',
    title: 'Traditional Class',
    description: 'Study this like a school subject (textbook, lessons, practice)',
    icon: '📚'
  },
  {
    id: 'hybrid',
    title: 'Hybrid Approach',
    description: 'Mix of real-world application and traditional study',
    icon: '⚡'
  }
];

const INTEREST_OPTIONS = [
  { id: 'sports', label: 'Sports & Athletics', icon: '⚽' },
  { id: 'music', label: 'Music & Performance', icon: '🎵' },
  { id: 'art', label: 'Visual Arts', icon: '🎨' },
  { id: 'gaming', label: 'Gaming & Esports', icon: '🎮' },
  { id: 'business', label: 'Business & Entrepreneurship', icon: '💼' },
  { id: 'technology', label: 'Technology & Coding', icon: '💻' },
  { id: 'nature', label: 'Nature & Environment', icon: '🌿' },
  { id: 'cooking', label: 'Cooking & Food', icon: '🍳' },
  { id: 'writing', label: 'Creative Writing', icon: '✍️' },
  { id: 'social', label: 'Social Impact', icon: '🤝' }
];

const DIPLOMA_SUBJECTS = [
  { id: 'stem_logic', label: 'STEM & Logic' },
  { id: 'life_wellness', label: 'Life & Wellness' },
  { id: 'language_communication', label: 'Language & Communication' },
  { id: 'society_culture', label: 'Society & Culture' },
  { id: 'arts_creativity', label: 'Arts & Creativity' }
];

export default function QuestPersonalizationWizard({ questId, questTitle, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Wizard state
  const [selectedApproach, setSelectedApproach] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [crossCurricularSubjects, setCrossCurricularSubjects] = useState([]);
  const [generatedTasks, setGeneratedTasks] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  // Start personalization session
  const startSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/start-personalization`, {});
      setSessionId(response.data.session_id);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start personalization');
    } finally {
      setLoading(false);
    }
  };

  // Generate tasks from AI
  const generateTasks = async () => {
    if (!selectedApproach || selectedInterests.length === 0) {
      setError('Please select an approach and at least one interest');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/generate-tasks`, {
        session_id: sessionId,
        approach: selectedApproach,
        interests: selectedInterests,
        cross_curricular_subjects: crossCurricularSubjects
      });
      setGeneratedTasks(response.data.tasks);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate tasks');
    } finally {
      setLoading(false);
    }
  };

  // Finalize and save tasks
  const finalizeTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/quests/${questId}/finalize-tasks`, {
        session_id: sessionId,
        tasks: generatedTasks
      });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to finalize tasks');
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interestId) => {
    setSelectedInterests(prev =>
      prev.includes(interestId)
        ? prev.filter(id => id !== interestId)
        : [...prev, interestId]
    );
  };

  const toggleSubject = (subjectId) => {
    setCrossCurricularSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Step {step} of 4</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Personalize Your Quest</h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Let's customize "{questTitle}" to match your interests and learning style.
            Our AI will help generate tasks that are meaningful to you.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
            <p className="text-sm text-blue-900">
              💡 <strong>Remember:</strong> You're in control. The AI suggests tasks based on your choices,
              but you decide what to learn. We recommend working with an Optio teacher for the best experience.
            </p>
          </div>
          <button
            onClick={startSession}
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Begin Personalization'}
          </button>
        </div>
      )}

      {/* Step 2: Choose Approach */}
      {step === 2 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">How do you want to learn?</h2>
          <p className="text-gray-600 mb-6">Choose the approach that excites you most</p>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {APPROACH_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setSelectedApproach(option.id)}
                className={`p-6 border-2 rounded-lg text-left transition-all ${
                  selectedApproach === option.id
                    ? 'border-[#ef597b] bg-pink-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-4xl mb-3">{option.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{option.title}</h3>
                <p className="text-sm text-gray-600">{option.description}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedApproach}
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Select Interests & Subjects */}
      {step === 3 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">What are you interested in?</h2>
          <p className="text-gray-600 mb-6">Select your interests (at least one)</p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            {INTEREST_OPTIONS.map(interest => (
              <button
                key={interest.id}
                onClick={() => toggleInterest(interest.id)}
                className={`p-4 border-2 rounded-lg transition-all ${
                  selectedInterests.includes(interest.id)
                    ? 'border-[#ef597b] bg-pink-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-3xl mb-2">{interest.icon}</div>
                <div className="text-sm font-medium">{interest.label}</div>
              </button>
            ))}
          </div>

          <h3 className="text-xl font-semibold mb-4">Connect to other subjects (optional)</h3>
          <p className="text-gray-600 mb-4">Make this a cross-curricular project</p>

          <div className="grid md:grid-cols-5 gap-3 mb-6">
            {DIPLOMA_SUBJECTS.map(subject => (
              <button
                key={subject.id}
                onClick={() => toggleSubject(subject.id)}
                className={`p-3 border-2 rounded-lg text-sm transition-all ${
                  crossCurricularSubjects.includes(subject.id)
                    ? 'border-[#6d469b] bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {subject.label}
              </button>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={generateTasks}
              disabled={loading || selectedInterests.length === 0}
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Generating Tasks...' : 'Generate Tasks'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Finalize Tasks */}
      {step === 4 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Review Your Personalized Tasks</h2>
          <p className="text-gray-600 mb-6">These tasks were generated based on your choices</p>

          <div className="space-y-4 mb-8">
            {generatedTasks.map((task, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{task.title}</h3>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    {task.xp_value} XP
                  </span>
                </div>
                <p className="text-gray-600 mb-2">{task.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">Pillar: {task.pillar.replace('_', ' ')}</span>
                  {task.is_required && <span className="text-blue-600">Required</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-900">
              ⚠️ You can edit these tasks or add your own after finalizing. Custom tasks will need admin approval.
            </p>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Regenerate
            </button>
            <button
              onClick={finalizeTasks}
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Finalizing...' : 'Finalize & Start Quest'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel button (always visible) */}
      <div className="mt-8 text-center">
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Cancel Personalization
        </button>
      </div>
    </div>
  );
}
