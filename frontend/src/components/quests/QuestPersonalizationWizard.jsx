import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Flag, BookOpen } from 'lucide-react';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';
import ManualTaskCreator from './ManualTaskCreator';

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

  // NEW: Creation method selection
  const [creationMethod, setCreationMethod] = useState(null); // 'ai' or 'manual'

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
  const startSession = async (method) => {
    setCreationMethod(method);
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/start-personalization`, {});
      const newSessionId = response.data.session_id;
      if (!newSessionId) {
        throw new Error('No session ID returned from server');
      }
      setSessionId(newSessionId);

      if (method === 'ai') {
        setStep(2); // Go to interests selection
      } else {
        setStep(3); // Go directly to manual task creation
      }
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

    // Prevent duplicate submissions if already loading
    if (loading) {
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
      setStep(4); // Move to one-at-a-time review for AI path
    } catch (err) {
      console.error('Failed to generate tasks:', err);

      // Handle rate limiting errors with user-friendly message
      const errorMessage = err.response?.data?.error || err.message || 'Failed to generate tasks';
      if (errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('quota')) {
        setError('AI service is temporarily busy. Please wait 30 seconds and try again.');
      } else if (errorMessage.includes('403') || errorMessage.includes('API key')) {
        setError('AI service configuration error. Please contact support.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle manual task creation completion
  const handleManualTasksCreated = (response) => {
    console.log('Manual tasks created:', response);
    onComplete(response);
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
  const totalSteps = creationMethod === 'ai' ? 4 : 3; // AI: path selection, interests, generation, review. Manual: path selection, skip interests, manual creator

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Progress indicator - hide for manual path step 3 (full-screen component) */}
      {!(creationMethod === 'manual' && step === 3) && (
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
      )}

      {error && (
        <div className="mb-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl text-red-700">
          <p className="font-semibold" style={{ fontFamily: 'Poppins' }}>{error}</p>
        </div>
      )}

      {/* Step 1: Choose Creation Method */}
      {step === 1 && (
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
            How would you like to create tasks?
          </h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'Poppins' }}>
            Choose how you want to build your quest for "{questTitle}"
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-6">
            {/* AI Generation Option */}
            <button
              onClick={() => startSession('ai')}
              disabled={loading}
              className="group p-8 border-2 border-gray-300 rounded-xl hover:border-purple-500 hover:shadow-xl transition-all text-left disabled:opacity-50"
            >
              <div className="text-5xl mb-4">✨</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins' }}>
                AI Generate
              </h3>
              <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
                Let AI create personalized tasks based on your interests and learning style
              </p>
            </button>

            {/* Manual Creation Option */}
            <button
              onClick={() => startSession('manual')}
              disabled={loading}
              className="group p-8 border-2 border-gray-300 rounded-xl hover:border-pink-500 hover:shadow-xl transition-all text-left disabled:opacity-50"
            >
              <div className="text-5xl mb-4">✍️</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins' }}>
                Write My Own
              </h3>
              <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
                Create custom tasks based on your own ideas with AI quality feedback
              </p>
            </button>
          </div>

          {/* OR Divider */}
          <div className="flex items-center gap-4 max-w-3xl mx-auto mb-6">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 font-semibold" style={{ fontFamily: 'Poppins' }}>OR</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          {/* Add from Task Library Button */}
          <div className="max-w-md mx-auto mb-6">
            <button
              onClick={() => navigate(`/quests/${questId}/library`)}
              disabled={loading}
              className="w-full p-6 border-2 border-gray-300 rounded-xl hover:border-blue-500 hover:shadow-xl transition-all text-left disabled:opacity-50 group"
            >
              <div className="flex items-center gap-4">
                <BookOpen className="w-10 h-10 text-blue-500 group-hover:scale-110 transition-transform" />
                <div>
                  <h3 className="text-xl font-bold mb-1 group-hover:text-blue-600 transition-colors" style={{ fontFamily: 'Poppins' }}>
                    Add from Task Library
                  </h3>
                  <p className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins' }}>
                    Browse tasks created by other students and add them to your quest
                  </p>
                </div>
              </div>
            </button>
          </div>

          {loading && (
            <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins' }}>
              Starting...
            </p>
          )}
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

      {/* Step 3: Manual Task Creator (manual path only) */}
      {step === 3 && creationMethod === 'manual' && (
        <ManualTaskCreator
          questId={questId}
          sessionId={sessionId}
          onTasksCreated={handleManualTasksCreated}
          onCancel={onCancel}
        />
      )}

      {/* Step 4: One-at-a-Time Task Review (AI path only) */}
      {step === 4 && creationMethod === 'ai' && currentTask && (
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
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 sm:p-8 mb-8 shadow-lg relative">
            {/* XP Badge - Top Right */}
            <div className="absolute top-3 right-3 sm:top-6 sm:right-6 flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-green-100 text-green-800 rounded-full">
              <span className="text-sm sm:text-base font-semibold" style={{ fontFamily: 'Poppins' }}>
                {currentTask.xp_value} XP
              </span>
            </div>

            {/* Flag Icon - Top Left Corner */}
            <button
              onClick={() => setShowFlagModal(true)}
              disabled={loading}
              className="absolute top-3 left-3 sm:top-6 sm:left-6 p-2 hover:bg-yellow-50 rounded-lg transition-all disabled:opacity-50 group"
              title="Flag this task as inappropriate"
            >
              <Flag className="w-5 h-5 text-gray-400 group-hover:text-yellow-500 transition-colors" />
            </button>

            <div className="mb-6 pr-20 sm:pr-24 pl-10 sm:pl-12">
              <h3 className="text-xl sm:text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                {currentTask.title}
              </h3>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                {currentTask.description}
              </p>
            </div>

            <div className="flex items-center gap-4 pl-10 sm:pl-12">
              {/* Pillar Badge */}
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-full">
                <span className="font-semibold" style={{ fontFamily: 'Poppins' }}>
                  {getPillarData(currentTask.pillar).name}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons - 2 Column Layout */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Skip Button */}
            <button
              onClick={handleSkipTask}
              disabled={loading}
              className="flex flex-col items-center justify-center p-6 border-2 border-red-300 bg-red-50 rounded-xl hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50"
            >
              <X className="w-12 h-12 text-red-600 mb-2" />
              <span className="font-bold text-lg text-red-700" style={{ fontFamily: 'Poppins' }}>
                Skip
              </span>
            </button>

            {/* Accept Button */}
            <button
              onClick={handleAcceptTask}
              disabled={loading}
              className="flex flex-col items-center justify-center p-6 border-2 border-green-300 bg-green-50 rounded-xl hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50"
            >
              <Check className="w-12 h-12 text-green-600 mb-2" />
              <span className="font-bold text-lg text-green-700" style={{ fontFamily: 'Poppins' }}>
                {loading ? 'Adding...' : 'Add'}
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
