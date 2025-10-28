import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Flag } from 'lucide-react';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';

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

// Updated pillar names
const DIPLOMA_SUBJECTS = [
  { id: 'stem', label: 'STEM' },
  { id: 'wellness', label: 'Wellness' },
  { id: 'communication', label: 'Communication' },
  { id: 'civics', label: 'Civics' },
  { id: 'art', label: 'Art' }
];

export default function QuestPersonalizationWizard({ questId, questTitle, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Wizard state
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [crossCurricularSubjects, setCrossCurricularSubjects] = useState([]);
  const [generatedTasks, setGeneratedTasks] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [acceptedTasks, setAcceptedTasks] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [additionalFeedback, setAdditionalFeedback] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  // Start personalization session
  const startSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/start-personalization`, {});
      const newSessionId = response.data.session_id;
      if (!newSessionId) {
        throw new Error('No session ID returned from server');
      }
      setSessionId(newSessionId);
      setStep(2); // Skip to interests (was step 3, now step 2)
    } catch (err) {
      console.error('Failed to start session:', err);
      setError(err.response?.data?.error || err.message || 'Failed to start personalization');
    } finally {
      setLoading(false);
    }
  };

  // Generate tasks from AI (always generates 10)
  const generateTasks = async () => {
    if (selectedInterests.length === 0) {
      setError('Please select at least one interest');
      return;
    }

    if (!sessionId) {
      setError('No session ID found. Please restart the wizard.');
      console.error('Missing session_id:', sessionId);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/generate-tasks`, {
        session_id: sessionId,
        approach: 'hybrid', // Default since we removed the approach selection
        interests: selectedInterests,
        cross_curricular_subjects: crossCurricularSubjects,
        additional_feedback: additionalFeedback
      });

      const tasks = response.data.tasks || [];
      if (tasks.length === 0) {
        throw new Error('No tasks were generated');
      }

      setGeneratedTasks(tasks);
      setCurrentTaskIndex(0);
      setAcceptedTasks([]);
      setStep(3); // Move to one-at-a-time review (was step 4, now step 3)
    } catch (err) {
      console.error('Failed to generate tasks:', err);
      setError(err.response?.data?.error || err.message || 'Failed to generate tasks');
    } finally {
      setLoading(false);
    }
  };

  // Handle accepting a task
  const handleAcceptTask = async () => {
    const currentTask = generatedTasks[currentTaskIndex];
    setLoading(true);
    setError(null);

    try {
      // Add task immediately to user's quest
      const response = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
        session_id: sessionId,
        task: currentTask
      });

      if (response.data.success) {
        // Track accepted task
        setAcceptedTasks([...acceptedTasks, currentTask]);

        // Move to next task or complete
        if (currentTaskIndex < generatedTasks.length - 1) {
          setCurrentTaskIndex(currentTaskIndex + 1);
        } else {
          // All tasks reviewed, complete wizard
          completeWizard();
        }
      }
    } catch (err) {
      console.error('Failed to accept task:', err);
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setLoading(false);
    }
  };

  // Handle skipping a task
  const handleSkipTask = async () => {
    const currentTask = generatedTasks[currentTaskIndex];

    // Save skipped task to library for other users (non-blocking)
    try {
      await api.post(`/api/quests/${questId}/personalization/skip-task`, {
        session_id: sessionId,
        task: currentTask
      });
      console.log('Skipped task saved to library:', currentTask.title);
    } catch (err) {
      // Don't block the user if library save fails
      console.warn('Failed to save skipped task to library:', err);
    }

    // Move to next task or complete wizard
    if (currentTaskIndex < generatedTasks.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      // Last task, complete wizard with what we have
      completeWizard();
    }
  };

  // Handle flagging a task
  const handleFlagTask = async () => {
    const currentTask = generatedTasks[currentTaskIndex];
    setLoading(true);
    setError(null);

    try {
      // Flag the task (assuming we need to save it to library first to get an ID)
      // For now, we'll just log it and move on
      console.log('Task flagged:', currentTask.title, 'Reason:', flagReason);

      // TODO: Send flag to backend once task is in library
      // await api.post(`/api/quests/${questId}/task-library/${taskId}/flag`, {
      //   reason: flagReason
      // });

      setShowFlagModal(false);
      setFlagReason('');

      // User can still skip or accept after flagging
    } catch (err) {
      console.error('Failed to flag task:', err);
      setError('Failed to flag task');
    } finally {
      setLoading(false);
    }
  };

  // Complete wizard
  const completeWizard = () => {
    if (acceptedTasks.length > 0) {
      onComplete();
    } else {
      setError('You must accept at least one task');
    }
  };

  // Toggle interest selection
  const toggleInterest = (interestId) => {
    setSelectedInterests(prev =>
      prev.includes(interestId)
        ? prev.filter(id => id !== interestId)
        : [...prev, interestId]
    );
  };

  // Toggle subject selection
  const toggleSubject = (subjectId) => {
    setCrossCurricularSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const currentTask = generatedTasks[currentTaskIndex];
  const totalSteps = 3; // Reduced from 4

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>
            Step {step} of {totalSteps}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-primary h-3 rounded-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl text-red-700">
          <p className="font-semibold" style={{ fontFamily: 'Poppins' }}>{error}</p>
        </div>
      )}

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
            Personalize Your Quest
          </h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'Poppins' }}>
            Let's customize "{questTitle}" to match your interests and learning style.
            Our AI will help generate tasks that are meaningful to you.
          </p>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 mb-6 max-w-2xl mx-auto">
            <p className="text-sm text-blue-900" style={{ fontFamily: 'Poppins' }}>
              💡 <strong>Remember:</strong> You're in control. The AI suggests tasks based on your choices,
              but you decide what to learn. You can accept, skip, or flag any task.
            </p>
          </div>
          <button
            onClick={startSession}
            disabled={loading}
            className="px-8 py-4 bg-gradient-primary text-white rounded-xl font-bold text-lg hover:shadow-xl transition-all disabled:opacity-50"
            style={{ fontFamily: 'Poppins' }}
          >
            {loading ? 'Starting...' : 'Begin Personalization'}
          </button>
        </div>
      )}

      {/* Step 2: Select Interests & Subjects (previously Step 3) */}
      {step === 2 && (
        <div>
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
            What are you interested in?
          </h2>
          <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins' }}>
            Select your interests to personalize your tasks
          </p>

          {/* Interests */}
          <div className="mb-8">
            <h3 className="font-semibold text-lg mb-3" style={{ fontFamily: 'Poppins' }}>Your Interests</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {INTEREST_OPTIONS.map(interest => (
                <button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  className={`p-4 border-2 rounded-xl text-center transition-all hover:shadow-lg ${
                    selectedInterests.includes(interest.id)
                      ? 'border-optio-pink bg-pink-50 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{interest.icon}</div>
                  <div className="text-sm font-medium" style={{ fontFamily: 'Poppins' }}>{interest.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Diploma Subjects */}
          <div className="mb-8">
            <h3 className="font-semibold text-lg mb-3" style={{ fontFamily: 'Poppins' }}>
              Focus Areas (Optional)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {DIPLOMA_SUBJECTS.map(subject => (
                <button
                  key={subject.id}
                  onClick={() => toggleSubject(subject.id)}
                  className={`p-4 border-2 rounded-xl text-center transition-all hover:shadow-lg ${
                    crossCurricularSubjects.includes(subject.id)
                      ? 'border-optio-purple bg-purple-50 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium" style={{ fontFamily: 'Poppins' }}>{subject.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Additional Feedback */}
          <div className="mb-8">
            <h3 className="font-semibold text-lg mb-3" style={{ fontFamily: 'Poppins' }}>
              Any specific ideas? (Optional)
            </h3>
            <textarea
              value={additionalFeedback}
              onChange={(e) => setAdditionalFeedback(e.target.value)}
              placeholder="Tell us more about what you'd like to learn..."
              className="w-full p-4 border-2 border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              rows={4}
              style={{ fontFamily: 'Poppins' }}
            />
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              Back
            </button>
            <button
              onClick={generateTasks}
              disabled={loading || selectedInterests.length === 0}
              className="px-6 py-3 bg-gradient-primary text-white rounded-xl disabled:opacity-50 font-bold hover:shadow-xl transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              {loading ? 'Generating Tasks...' : 'Generate Tasks'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: One-at-a-Time Task Review (previously Step 4) */}
      {step === 3 && currentTask && (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-3xl font-bold" style={{ fontFamily: 'Poppins' }}>Review Tasks</h2>
              <span className="text-lg font-semibold text-gray-600" style={{ fontFamily: 'Poppins' }}>
                Task {currentTaskIndex + 1} of {generatedTasks.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentTaskIndex + 1) / generatedTasks.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Task Card */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-8 shadow-lg relative">
            {/* XP Badge - Top Right */}
            <div className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full">
              <span className="font-semibold" style={{ fontFamily: 'Poppins' }}>
                {currentTask.xp_value} XP
              </span>
            </div>

            <div className="mb-6 pr-24">
              <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                {currentTask.title}
              </h3>
              <p className="text-gray-700 text-lg leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                {currentTask.description}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Pillar Badge */}
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-full">
                <span className="font-semibold" style={{ fontFamily: 'Poppins' }}>
                  {getPillarData(currentTask.pillar).name}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Skip Button */}
            <button
              onClick={handleSkipTask}
              disabled={loading}
              className="flex flex-col items-center justify-center p-6 border-2 border-red-300 bg-red-50 rounded-2xl hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50"
            >
              <X className="w-12 h-12 text-red-600 mb-2" />
              <span className="font-bold text-lg text-red-700" style={{ fontFamily: 'Poppins' }}>
                Skip Task
              </span>
            </button>

            {/* Flag Button */}
            <button
              onClick={() => setShowFlagModal(true)}
              disabled={loading}
              className="flex flex-col items-center justify-center p-6 border-2 border-yellow-300 bg-yellow-50 rounded-2xl hover:bg-yellow-100 hover:border-yellow-400 transition-all disabled:opacity-50"
            >
              <Flag className="w-12 h-12 text-yellow-600 mb-2" />
              <span className="font-bold text-lg text-yellow-700" style={{ fontFamily: 'Poppins' }}>
                Flag Task
              </span>
            </button>

            {/* Accept Button */}
            <button
              onClick={handleAcceptTask}
              disabled={loading}
              className="flex flex-col items-center justify-center p-6 border-2 border-green-300 bg-green-50 rounded-2xl hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50"
            >
              <Check className="w-12 h-12 text-green-600 mb-2" />
              <span className="font-bold text-lg text-green-700" style={{ fontFamily: 'Poppins' }}>
                {loading ? 'Adding...' : 'Add Task'}
              </span>
            </button>
          </div>

          {/* Progress Summary */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
            <p className="text-sm text-blue-900" style={{ fontFamily: 'Poppins' }}>
              💡 <strong>Progress:</strong> You've accepted {acceptedTasks.length} task{acceptedTasks.length !== 1 ? 's' : ''} so far.
              {currentTaskIndex === generatedTasks.length - 1 && ' This is the last task!'}
            </p>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
              Flag This Task
            </h3>
            <p className="text-gray-600 mb-4" style={{ fontFamily: 'Poppins' }}>
              Help us improve by reporting tasks that don't make sense or are inappropriate.
            </p>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Why are you flagging this task? (optional)"
              className="w-full p-4 border-2 border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent mb-4"
              rows={4}
              style={{ fontFamily: 'Poppins' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowFlagModal(false);
                  setFlagReason('');
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all"
                style={{ fontFamily: 'Poppins' }}
              >
                Cancel
              </button>
              <button
                onClick={handleFlagTask}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 font-bold transition-all disabled:opacity-50"
                style={{ fontFamily: 'Poppins' }}
              >
                {loading ? 'Flagging...' : 'Submit Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel button (always visible) */}
      <div className="mt-8 text-center">
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-sm"
          style={{ fontFamily: 'Poppins' }}
        >
          Cancel Personalization
        </button>
      </div>
    </div>
  );
}
