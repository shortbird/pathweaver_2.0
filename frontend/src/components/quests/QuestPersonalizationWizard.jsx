import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, BookOpen, Zap } from 'lucide-react';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';

const APPROACH_OPTIONS = [
  {
    id: 'real_world_project',
    title: 'Real-World Project',
    description: 'Apply this learning to something you care about (sports, hobbies, interests)',
    IconComponent: Globe
  },
  {
    id: 'traditional_class',
    title: 'Traditional Class',
    description: 'Study this like a school subject (textbook, lessons, practice)',
    IconComponent: BookOpen
  },
  {
    id: 'hybrid',
    title: 'Hybrid Approach',
    description: 'Mix of real-world application and traditional study',
    IconComponent: Zap
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
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [additionalFeedback, setAdditionalFeedback] = useState('');

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
      setStep(2);
    } catch (err) {
      console.error('Failed to start session:', err);
      setError(err.response?.data?.error || err.message || 'Failed to start personalization');
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
        approach: selectedApproach,
        interests: selectedInterests,
        cross_curricular_subjects: crossCurricularSubjects
      });
      const tasks = response.data.tasks;
      setGeneratedTasks(tasks);
      // Deselect all tasks by default - user must choose
      setSelectedTasks([]);
      setStep(4);
    } catch (err) {
      console.error('Failed to generate tasks:', err);
      setError(err.response?.data?.error || 'Failed to generate tasks');
    } finally {
      setLoading(false);
    }
  };

  // Regenerate non-selected tasks
  const regenerateNonSelected = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get titles of selected tasks to avoid duplicates
      const selectedTaskTitles = generatedTasks
        .filter((_, index) => selectedTasks.includes(index))
        .map(task => task.title);

      const response = await api.post(`/api/quests/${questId}/generate-tasks`, {
        session_id: sessionId,
        approach: selectedApproach,
        interests: selectedInterests,
        cross_curricular_subjects: crossCurricularSubjects,
        exclude_tasks: selectedTaskTitles,
        additional_feedback: additionalFeedback
      });

      // Replace non-selected tasks with new ones
      const newTasks = [...generatedTasks];
      let newTaskIndex = 0;
      for (let i = 0; i < newTasks.length; i++) {
        if (!selectedTasks.includes(i) && newTaskIndex < response.data.tasks.length) {
          newTasks[i] = response.data.tasks[newTaskIndex];
          newTaskIndex++;
        }
      }

      setGeneratedTasks(newTasks);
      // Keep only previously selected tasks selected
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to regenerate tasks');
    } finally {
      setLoading(false);
    }
  };

  // Finalize and save tasks
  const finalizeTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      // Only send selected tasks
      const tasksToFinalize = generatedTasks.filter((_, index) => selectedTasks.includes(index));

      await api.post(`/api/quests/${questId}/finalize-tasks`, {
        session_id: sessionId,
        tasks: tasksToFinalize
      });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to finalize tasks');
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = (index) => {
    setSelectedTasks(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
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
    <div className="max-w-4xl mx-auto p-8">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Step {step} of 4</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-3 rounded-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
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
          <h2 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>Personalize Your Quest</h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'Poppins' }}>
            Let's customize "{questTitle}" to match your interests and learning style.
            Our AI will help generate tasks that are meaningful to you.
          </p>
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 mb-4 max-w-2xl mx-auto">
            <p className="text-sm text-red-900" style={{ fontFamily: 'Poppins' }}>
              <strong>⚠️ Important:</strong> All personalized quests must be approved by a licensed teacher before they count toward XP or diploma credits.
            </p>
          </div>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 mb-6 max-w-2xl mx-auto">
            <p className="text-sm text-blue-900" style={{ fontFamily: 'Poppins' }}>
              💡 <strong>Remember:</strong> You're in control. The AI suggests tasks based on your choices,
              but you decide what to learn. We recommend working with an Optio teacher for the best experience.
            </p>
          </div>
          <button
            onClick={startSession}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-xl font-bold text-lg hover:shadow-xl transition-all disabled:opacity-50"
            style={{ fontFamily: 'Poppins' }}
          >
            {loading ? 'Starting...' : 'Begin Personalization'}
          </button>
        </div>
      )}

      {/* Step 2: Choose Approach */}
      {step === 2 && (
        <div>
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>How do you want to learn?</h2>
          <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins' }}>Choose the approach that excites you most</p>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {APPROACH_OPTIONS.map(option => {
              const IconComponent = option.IconComponent;
              return (
                <button
                  key={option.id}
                  onClick={() => setSelectedApproach(option.id)}
                  className={`p-6 border-2 rounded-xl text-left transition-all hover:shadow-lg ${
                    selectedApproach === option.id
                      ? 'border-[#ef597b] bg-pink-50 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <IconComponent className="w-12 h-12 mb-3 text-[#6d469b]" />
                  <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Poppins' }}>{option.title}</h3>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins' }}>{option.description}</p>
                </button>
              );
            })}
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
              onClick={() => setStep(3)}
              disabled={!selectedApproach}
              className="px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-xl disabled:opacity-50 font-bold hover:shadow-xl transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Select Interests & Subjects */}
      {step === 3 && (
        <div>
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>What are you interested in?</h2>
          <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins' }}>Select your interests (at least one)</p>

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

          <h3 className="text-xl font-semibold mb-4">Additional Details (Optional)</h3>
          <p className="text-gray-600 mb-4">Any specific requirements or preferences for your tasks?</p>
          <textarea
            value={additionalFeedback}
            onChange={(e) => setAdditionalFeedback(e.target.value)}
            placeholder="E.g., 'I want tasks that involve video creation' or 'Focus on practical skills I can use at home'"
            className="w-full p-3 border border-gray-300 rounded-lg mb-6 min-h-[100px] focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
          />

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
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>Select Tasks to Keep</h2>
          <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins' }}>Choose which tasks to include in your quest</p>

          <div className="space-y-3 mb-8">
            {generatedTasks.map((task, index) => {
              const isSelected = selectedTasks.includes(index);
              return (
                <div
                  key={index}
                  className={`border-2 rounded-lg p-4 transition-all cursor-pointer ${
                    isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleTaskSelection(index)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTaskSelection(index)}
                      className="mt-1 w-5 h-5 text-green-500 rounded focus:ring-green-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg">{task.title}</h3>
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium whitespace-nowrap ml-2">
                          {task.xp_value} XP
                        </span>
                      </div>
                      <p className="text-gray-600 mb-3">{task.description}</p>
                      {task.bullet_points && task.bullet_points.length > 0 && (
                        <ul className="space-y-1 mb-3">
                          {task.bullet_points.map((point, idx) => (
                            <li key={idx} className="text-sm text-gray-700 flex items-start">
                              <span className="text-green-500 mr-2">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">
                          Pillar: <span className="font-medium">{getPillarData(task.pillar).name}</span>
                        </span>
                        {task.diploma_subjects && task.diploma_subjects.length > 0 && (
                          <span className="text-gray-500">
                            Subjects: <span className="font-medium">{task.diploma_subjects.join(', ')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              💡 <strong>Tip:</strong> Select the tasks you like, then regenerate the rest. You can repeat this until you're happy with all tasks.
            </p>
          </div>

          <div className="flex justify-between gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              {selectedTasks.length < generatedTasks.length && (
                <button
                  onClick={regenerateNonSelected}
                  disabled={loading}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Regenerating...' : 'Regenerate Non-Selected'}
                </button>
              )}
            </div>
            <button
              onClick={finalizeTasks}
              disabled={loading || selectedTasks.length === 0}
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Finalizing...' : `Finalize ${selectedTasks.length} Tasks`}
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
