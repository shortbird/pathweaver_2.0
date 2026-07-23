import { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon, FlagIcon, CheckCircleIcon, MapIcon, ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';
import ManualTaskCreator from './ManualTaskCreator';
import ApproachExampleCard from '../quest/ApproachExampleCard';
import logger from '../../utils/logger';
import { useAIAccess } from '../../contexts/AIAccessContext';
import { useAuth } from '../../contexts/AuthContext';

// Credit requirements per subject (XP needed for graduation)
const CREDIT_REQUIREMENTS = {
  language_arts: { required: 8000, label: 'Language Arts' },
  math: { required: 6000, label: 'Math' },
  science: { required: 6000, label: 'Science' },
  social_studies: { required: 7000, label: 'Social Studies' },
  financial_literacy: { required: 1000, label: 'Financial Literacy' },
  health: { required: 1000, label: 'Health' },
  pe: { required: 4000, label: 'PE' },
  fine_arts: { required: 3000, label: 'Fine Arts' },
  cte: { required: 2000, label: 'CTE' },
  digital_literacy: { required: 1000, label: 'Digital Literacy' },
  electives: { required: 8000, label: 'Electives' }
};

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

// Challenge levels for AI task generation. Values match the backend's
// VALID_CHALLENGE_LEVELS; the student's last choice is remembered server-side
// (users.preferred_challenge_level).
const CHALLENGE_LEVELS = [
  { id: 'easier', label: 'Easier', description: 'Smaller steps, quicker wins' },
  { id: 'standard', label: 'Standard', description: 'A good stretch for most students' },
  { id: 'challenge', label: 'Challenge', description: 'Bigger projects, more depth, more XP' }
];

// Max taps in one direction on the per-task complexity dial.
const MAX_ADJUST_STEPS = 2;

// Diploma subjects for credit tracking (11 subjects)
const DIPLOMA_SUBJECTS = [
  { id: 'language_arts', label: 'Language Arts', icon: '📖' },
  { id: 'math', label: 'Math', icon: '🔢' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'social_studies', label: 'Social Studies', icon: '🌍' },
  { id: 'financial_literacy', label: 'Financial Literacy', icon: '💰' },
  { id: 'health', label: 'Health', icon: '❤️' },
  { id: 'pe', label: 'PE', icon: '🏃' },
  { id: 'fine_arts', label: 'Fine Arts', icon: '🎨' },
  { id: 'cte', label: 'CTE', icon: '🔧' },
  { id: 'digital_literacy', label: 'Digital Literacy', icon: '💻' },
  { id: 'electives', label: 'Electives', icon: '✨' }
];

/**
 * @param hideDiplomaSubjects   When true, hide Optio-platform-specific
 *   framing that doesn't translate to a Canvas-graded assignment:
 *     • the "Diploma Credits" picker on the interests step
 *     • the pillar badge + diploma-credits row on the review step
 *   The "Any specific ideas?" textarea stays visible regardless.
 * @param approachExamples      The quest's pre-authored "paths"
 *   (quests.approach_examples). When this is a non-empty array, a third
 *   "Choose a Path" option appears on step 1 letting the student start from a
 *   curated task set. Null/empty → the option is hidden and the wizard behaves
 *   exactly as before (AI Generate + Write My Own only).
 * @param xpThreshold           The quest's XP requirement, shown on each path
 *   card so the student sees a path's total XP against the goal. Optional.
 * @param embedded              When true, render in-flow instead of as a
 *   fixed-position modal. Inside the Canvas LTI iframe the page height is
 *   content-driven (LtiShell frameResize), so `fixed inset-0` centers the
 *   dialog against the full — possibly very tall — iframe and clips it out
 *   of the visible viewport. Embedded mode drops the overlay, the viewport
 *   max-height, and the inner scrollbar; the iframe just grows.
 */
export default function QuestPersonalizationWizard({
  questId,
  questTitle,
  onComplete,
  onCancel,
  hideDiplomaSubjects = false,
  embedded = false,
  approachExamples = null,
  xpThreshold = null,
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { canUseTaskGeneration } = useAIAccess();
  const { user } = useAuth();

  // NEW: Creation method selection
  const [creationMethod, setCreationMethod] = useState(null); // 'ai' | 'manual' | 'path'

  // Pre-authored "paths" (quests.approach_examples). Only surface paths that
  // actually carry tasks; a malformed entry should never render an empty card.
  const paths = Array.isArray(approachExamples)
    ? approachExamples.filter((p) => p && Array.isArray(p.tasks) && p.tasks.length > 0)
    : [];
  const hasPaths = paths.length > 0;
  const [selectingPathIndex, setSelectingPathIndex] = useState(null);

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

  // Challenge level: pre-select the student's remembered preference.
  const [challengeLevel, setChallengeLevel] = useState(
    CHALLENGE_LEVELS.some(l => l.id === user?.preferred_challenge_level)
      ? user.preferred_challenge_level
      : 'standard'
  );

  // Per-task complexity dial: net steps per task index (-2..+2) and in-flight state.
  const [taskAdjustments, setTaskAdjustments] = useState({});
  const [adjustingTask, setAdjustingTask] = useState(false);

  // Credit progress state
  const [subjectXP, setSubjectXP] = useState({});
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Fetch user's subject XP on mount
  useEffect(() => {
    const fetchSubjectXP = async () => {
      setLoadingCredits(true);
      try {
        const response = await api.get('/api/users/subject-xp');
        if (response.data.success && response.data.subject_xp) {
          // Convert array to object for easy lookup
          const xpMap = {};
          response.data.subject_xp.forEach(item => {
            xpMap[item.school_subject] = item.xp_amount || 0;
          });
          setSubjectXP(xpMap);
        }
      } catch (err) {
        logger.error('Failed to fetch subject XP:', err);
      } finally {
        setLoadingCredits(false);
      }
    };
    fetchSubjectXP();
  }, []);

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
      logger.error('Failed to start session:', err);
      setError(err.response?.data?.error || err.message || 'Failed to start personalization');
    } finally {
      setLoading(false);
    }
  };

  // Generate tasks from AI (always generates 10)
  const generateTasks = async () => {
    // All selections are optional - AI will generate general tasks if nothing selected
    if (!sessionId) {
      setError('No session ID found. Please restart the wizard.');
      logger.error('Missing session_id:', sessionId);
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
        // Parity with v2 mobile: tell the AI which tasks already exist so it
        // doesn't re-suggest them. The backend also merges in the student's
        // persisted quest tasks server-side, so this covers any accepted this
        // session before a re-generate.
        exclude_tasks: acceptedTasks.map(t => t.title),
        additional_feedback: additionalFeedback,
        challenge_level: challengeLevel
      });

      const tasks = response.data.tasks || [];
      if (tasks.length === 0) {
        throw new Error('No tasks were generated');
      }

      setGeneratedTasks(tasks);
      setCurrentTaskIndex(0);
      setAcceptedTasks([]);
      setTaskAdjustments({});
      setStep(4); // Move to one-at-a-time review for AI path
    } catch (err) {
      logger.error('Failed to generate tasks:', err);

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
    logger.debug('Manual tasks created:', response);
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
      logger.error('Failed to accept task:', err);
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
      logger.debug('Skipped task saved to library:', currentTask.title);
    } catch (err) {
      // Don't block the user if library save fails
      logger.warn('Failed to save skipped task to library:', err);
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
      logger.debug('Task flagged:', currentTask.title, 'Reason:', flagReason);

      // TODO: Send flag to backend once task is in library
      // await api.post(`/api/quests/${questId}/task-library/${taskId}/flag`, {
      //   reason: flagReason
      // });

      setShowFlagModal(false);
      setFlagReason('');

      // User can still skip or accept after flagging
    } catch (err) {
      logger.error('Failed to flag task:', err);
      setError('Failed to flag task');
    } finally {
      setLoading(false);
    }
  };

  // Per-task complexity dial: ask the AI to rewrite the current task one step
  // easier or harder and swap the result in place. Capped at +/-2 net steps.
  const handleAdjustTask = async (direction) => {
    if (adjustingTask || loading) return;
    const task = generatedTasks[currentTaskIndex];
    const steps = taskAdjustments[currentTaskIndex] || 0;
    if ((direction === 'harder' && steps >= MAX_ADJUST_STEPS) ||
        (direction === 'easier' && steps <= -MAX_ADJUST_STEPS)) {
      return;
    }

    setAdjustingTask(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/adjust-task-difficulty`, {
        task,
        direction
      });

      if (response.data.success && response.data.task) {
        setGeneratedTasks(prev =>
          prev.map((t, i) => (i === currentTaskIndex ? response.data.task : t))
        );
        setTaskAdjustments(prev => ({
          ...prev,
          [currentTaskIndex]: steps + (direction === 'harder' ? 1 : -1)
        }));
      }
    } catch (err) {
      logger.error('Failed to adjust task:', err);
      const errorMessage = err.response?.data?.error || 'Failed to adjust task';
      setError(errorMessage.includes('429') || errorMessage.includes('rate limit')
        ? 'AI service is temporarily busy. Please wait 30 seconds and try again.'
        : errorMessage);
    } finally {
      setAdjustingTask(false);
    }
  };

  // Choose a pre-authored path: materialize its tasks server-side (mirrors the
  // AI-generated persistence path so XP/completion/grade passback behave the
  // same) and drop the student into the normal post-wizard quest view.
  const handleSelectPath = async (index) => {
    if (selectingPathIndex !== null) return;
    setSelectingPathIndex(index);
    setError(null);

    try {
      const response = await api.post(`/api/quests/${questId}/add-path-tasks`, {
        approach_index: index,
      });

      if (response.data.success) {
        onComplete(response.data);
      } else {
        setError(response.data.error || 'Failed to start this path');
        setSelectingPathIndex(null);
      }
    } catch (err) {
      logger.error('Failed to select path:', err);
      setError(err.response?.data?.error || 'Failed to start this path');
      setSelectingPathIndex(null);
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
  // AI: method, interests, generation, review (4). Manual: method, manual creator (3).
  // Path: method, path picker (2). The path picker lives at internal step 5 to
  // avoid colliding with the AI/manual step blocks, so displayStep maps it to 2.
  const totalSteps = creationMethod === 'ai' ? 4 : creationMethod === 'path' ? 2 : 3;
  const displayStep = creationMethod === 'path' && step === 5 ? 2 : step;

  // Step 1 column count flexes with how many creation options are visible.
  const step1OptionCount = 1 /* manual */ + (canUseTaskGeneration ? 1 : 0) + (hasPaths ? 1 : 0);
  const step1GridCols =
    step1OptionCount >= 3
      ? 'md:grid-cols-3'
      : step1OptionCount === 2
        ? 'md:grid-cols-2'
        : 'md:grid-cols-1 max-w-md';

  // Compact sizing for the embedded (Canvas iframe) mode. Students are often
  // on small Chromebook screens inside an already-chromed Canvas page, so the
  // full-app type scale and padding force constant vertical scrolling there.
  // Keyed map instead of inline ternaries so the two scales stay comparable.
  const sz = embedded
    ? {
        heading: 'text-xl font-bold mb-1',
        subheading: 'text-sm text-gray-600 mb-4',
        sectionTitle: 'font-semibold text-sm mb-0.5',
        sectionHint: 'text-gray-500 text-xs mb-2',
        section: 'mb-4',
        progressWrap: 'mb-4',
        progressLabel: 'text-xs font-bold uppercase tracking-wide',
        progressBar: 'h-2',
        navBtn: 'px-4 py-2 text-sm border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-semibold transition-all min-h-[40px] w-full sm:w-auto',
        primaryBtn: 'px-4 py-2 text-sm bg-gradient-primary text-white rounded-lg disabled:opacity-50 font-bold hover:shadow-lg transition-all min-h-[40px] w-full sm:w-auto',
      }
    : {
        heading: 'text-3xl sm:text-4xl font-bold mb-4',
        subheading: 'text-gray-600 mb-8 max-w-2xl mx-auto text-lg',
        sectionTitle: 'font-semibold text-lg mb-1',
        sectionHint: 'text-gray-500 text-sm mb-3',
        section: 'mb-8',
        progressWrap: 'mb-6 sm:mb-8',
        progressLabel: 'text-sm font-bold uppercase tracking-wide',
        progressBar: 'h-3',
        navBtn: 'px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all min-h-[44px] w-full sm:w-auto',
        primaryBtn: 'px-6 py-3 bg-gradient-primary text-white rounded-xl disabled:opacity-50 font-bold hover:shadow-xl transition-all min-h-[44px] w-full sm:w-auto',
      };

  return (
    <div
      className={
        embedded
          ? 'w-full'
          : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4'
      }
    >
      <div
        className={
          embedded
            ? 'bg-white rounded-2xl w-full'
            : 'bg-white rounded-2xl max-w-full sm:max-w-5xl mx-2 sm:mx-0 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto pb-safe-bottom w-full'
        }
      >
        <div className={embedded ? 'p-3 sm:p-4' : 'p-4 sm:p-8'}>
          {/* Progress indicator - hide for manual path step 3 (full-screen component) */}
          {!(creationMethod === 'manual' && step === 3) && (
            <div className={sz.progressWrap}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
                <span className={sz.progressLabel} style={{ fontFamily: 'Poppins' }}>
                  Step {displayStep} of {totalSteps}
                </span>
              </div>
              <div className={`w-full bg-gray-200 rounded-full ${sz.progressBar}`}>
                <div
                  className={`bg-gradient-primary ${sz.progressBar} rounded-full transition-all duration-300`}
                  style={{ width: `${(displayStep / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

      {error && (
        <div className={embedded ? 'mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm' : 'mb-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl text-red-700'}>
          <p className="font-semibold" style={{ fontFamily: 'Poppins' }}>{error}</p>
        </div>
      )}

      {/* Step 1: Choose Creation Method */}
      {step === 1 && (
        <div className="text-center">
          <h2 className={sz.heading} style={{ fontFamily: 'Poppins' }}>
            How would you like to create tasks?
          </h2>
          <p className={sz.subheading} style={{ fontFamily: 'Poppins' }}>
            Choose how you want to build your quest for "{questTitle}"
          </p>

          <div className={`grid ${step1GridCols} ${embedded ? 'gap-3 mb-3' : 'gap-6 mb-6'} max-w-3xl mx-auto`}>
            {/* AI Generation Option */}
            {canUseTaskGeneration && (
              <button
                onClick={() => startSession('ai')}
                disabled={loading}
                className={`group border-2 border-gray-300 hover:border-purple-500 transition-all text-left disabled:opacity-50 min-h-[44px] ${
                  embedded
                    ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
                    : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
                }`}
              >
                <div className={embedded ? 'text-2xl shrink-0' : 'text-4xl sm:text-5xl mb-4'}>✨</div>
                <div>
                  <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-optio-purple transition-colors`} style={{ fontFamily: 'Poppins' }}>
                    AI Generate
                  </h3>
                  <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'} style={{ fontFamily: 'Poppins' }}>
                    Let AI create personalized tasks based on your interests and learning style
                  </p>
                </div>
              </button>
            )}

            {/* Choose a Path Option — only when the quest ships curated paths */}
            {hasPaths && (
              <button
                onClick={() => {
                  setError(null);
                  setCreationMethod('path');
                  setStep(5);
                }}
                disabled={loading}
                className={`group border-2 border-gray-300 hover:border-blue-500 transition-all text-left disabled:opacity-50 min-h-[44px] ${
                  embedded
                    ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
                    : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
                }`}
              >
                <div className={embedded ? 'shrink-0' : 'mb-4'}>
                  <MapIcon className={`text-blue-500 ${embedded ? 'w-7 h-7' : 'w-10 h-10 sm:w-12 sm:h-12'}`} />
                </div>
                <div>
                  <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-blue-600 transition-colors`} style={{ fontFamily: 'Poppins' }}>
                    Choose a Path
                  </h3>
                  <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'} style={{ fontFamily: 'Poppins' }}>
                    Start from a ready-made set of tasks you can customize
                  </p>
                </div>
              </button>
            )}

            {/* Manual Creation Option */}
            <button
              onClick={() => startSession('manual')}
              disabled={loading}
              className={`group border-2 border-gray-300 hover:border-pink-500 transition-all text-left disabled:opacity-50 min-h-[44px] ${
                embedded
                  ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
                  : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
              }`}
            >
              <div className={embedded ? 'text-2xl shrink-0' : 'text-4xl sm:text-5xl mb-4'}>✍️</div>
              <div>
                <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-optio-pink transition-colors`} style={{ fontFamily: 'Poppins' }}>
                  Write My Own
                </h3>
                <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'} style={{ fontFamily: 'Poppins' }}>
                  Create custom tasks based on your own ideas and interests
                </p>
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
          <h2 className={sz.heading} style={{ fontFamily: 'Poppins' }}>
            Personalize Your Tasks
          </h2>
          <p className={embedded ? sz.subheading : 'text-gray-600 mb-6 text-lg'} style={{ fontFamily: 'Poppins' }}>
            {hideDiplomaSubjects
              ? 'Pick interests and add any specific ideas to generate tasks'
              : 'Select interests or diploma subjects to generate personalized tasks'}
          </p>

          {/* Interests */}
          <div className={sz.section}>
            <h3 className={sz.sectionTitle} style={{ fontFamily: 'Poppins' }}>Your Interests (Optional)</h3>
            <p className={sz.sectionHint} style={{ fontFamily: 'Poppins' }}>
              Choose topics you enjoy to make tasks more engaging
            </p>
            <div className={embedded ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2' : 'grid grid-cols-2 md:grid-cols-5 gap-3'}>
              {INTEREST_OPTIONS.map(interest => (
                <button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  className={`border-2 text-center transition-all min-h-[44px] ${
                    embedded ? 'p-2 rounded-lg hover:shadow-md' : 'p-4 rounded-xl hover:shadow-lg'
                  } ${
                    selectedInterests.includes(interest.id)
                      ? 'border-optio-pink bg-pink-50 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={embedded ? 'text-xl mb-0.5' : 'text-3xl mb-2'}>{interest.icon}</div>
                  <div className={embedded ? 'text-xs font-medium leading-tight' : 'text-sm font-medium'} style={{ fontFamily: 'Poppins' }}>{interest.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Diploma Subjects with Circular Progress.
              Suppressed for LTI/Canvas iframe consumers — diploma credits
              are an Optio-platform concept that doesn't translate to a
              Canvas-graded assignment. */}
          {!hideDiplomaSubjects && (
          <div className="mb-8">
            <h3 className="font-semibold text-lg mb-1" style={{ fontFamily: 'Poppins' }}>
              Diploma Credits (Optional)
            </h3>
            <p className="text-gray-500 text-sm mb-4" style={{ fontFamily: 'Poppins' }}>
              Select subjects you want to earn credits toward. Your progress is shown below.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {DIPLOMA_SUBJECTS.map(subject => {
                const current = subjectXP[subject.id] || 0;
                const required = CREDIT_REQUIREMENTS[subject.id]?.required || 0;
                const percentage = required > 0 ? Math.min(100, (current / required) * 100) : 0;
                const isComplete = percentage >= 100;
                const isSelected = crossCurricularSubjects.includes(subject.id);

                // Circular progress values
                const radius = 28;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percentage / 100) * circumference;

                return (
                  <button
                    key={subject.id}
                    onClick={() => toggleSubject(subject.id)}
                    className={`p-4 border-2 rounded-xl text-center transition-all hover:shadow-lg flex flex-col items-center ${
                      isSelected
                        ? 'border-optio-purple bg-purple-50 shadow-lg ring-2 ring-optio-purple ring-offset-2'
                        : isComplete
                          ? 'border-green-300 bg-green-50 hover:border-green-400'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {/* Circular Progress */}
                    <div className="relative w-16 h-16 mb-2">
                      <svg className="transform -rotate-90 w-16 h-16">
                        {/* Background circle */}
                        <circle
                          cx="32"
                          cy="32"
                          r={radius}
                          stroke="#E5E7EB"
                          strokeWidth="5"
                          fill="none"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="32"
                          cy="32"
                          r={radius}
                          stroke={isComplete ? '#10B981' : isSelected ? '#6D469B' : '#9CA3AF'}
                          strokeWidth="5"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={loadingCredits ? circumference : offset}
                          strokeLinecap="round"
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      {/* Center content */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {loadingCredits ? (
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-optio-purple rounded-full animate-spin" />
                        ) : isComplete ? (
                          <CheckIcon className="w-6 h-6 text-green-600 stroke-[3]" />
                        ) : (
                          <span className="text-sm font-bold text-gray-700">
                            {Math.round(percentage)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subject Label */}
                    <div className="text-xs font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Poppins' }}>
                      {subject.label}
                    </div>

                    {/* XP Progress */}
                    {!loadingCredits && (
                      <div className="text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
                        {current.toLocaleString()} / {required.toLocaleString()} XP
                      </div>
                    )}

                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="mt-2 text-xs font-medium text-optio-purple flex items-center gap-1" style={{ fontFamily: 'Poppins' }}>
                        <CheckIcon className="w-3 h-3" />
                        Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Challenge Level */}
          <div className={sz.section}>
            <h3 className={sz.sectionTitle} style={{ fontFamily: 'Poppins' }}>Challenge Level</h3>
            <p className={sz.sectionHint} style={{ fontFamily: 'Poppins' }}>
              How ambitious should your tasks be? We'll remember your choice.
            </p>
            <div className={embedded ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-3'}>
              {CHALLENGE_LEVELS.map(level => (
                <button
                  key={level.id}
                  onClick={() => setChallengeLevel(level.id)}
                  aria-pressed={challengeLevel === level.id}
                  className={`border-2 text-left transition-all min-h-[44px] ${
                    embedded ? 'p-2 rounded-lg' : 'p-4 rounded-xl hover:shadow-lg'
                  } ${
                    challengeLevel === level.id
                      ? 'border-optio-purple bg-purple-50 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={embedded ? 'text-sm font-bold' : 'font-bold'} style={{ fontFamily: 'Poppins' }}>
                    {level.label}
                  </div>
                  <div className={embedded ? 'text-xs text-gray-500 leading-tight' : 'text-sm text-gray-500'} style={{ fontFamily: 'Poppins' }}>
                    {level.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Additional Feedback */}
          <div className={sz.section}>
            <h3 id="additional-feedback-label" className={sz.sectionTitle} style={{ fontFamily: 'Poppins' }}>
              Any specific ideas? (Optional)
            </h3>
            <textarea
              id="additional-feedback"
              value={additionalFeedback}
              onChange={(e) => setAdditionalFeedback(e.target.value)}
              placeholder="Tell us more about what you'd like to learn..."
              className={`w-full border-2 border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] ${
                embedded ? 'p-2 rounded-lg text-sm' : 'p-4 rounded-xl'
              }`}
              rows={embedded ? 2 : 4}
              style={{ fontFamily: 'Poppins' }}
              aria-labelledby="additional-feedback-label"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <button
              onClick={() => setStep(1)}
              className={sz.navBtn}
              style={{ fontFamily: 'Poppins' }}
            >
              Back
            </button>
            <button
              onClick={generateTasks}
              disabled={loading}
              className={sz.primaryBtn}
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
          <div className={embedded ? 'mb-3' : 'mb-6'}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={embedded ? 'text-xl font-bold' : 'text-3xl font-bold'} style={{ fontFamily: 'Poppins' }}>Review Tasks</h2>
              <span className={embedded ? 'text-sm font-semibold text-gray-600' : 'text-lg font-semibold text-gray-600'} style={{ fontFamily: 'Poppins' }}>
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
          <div className={`bg-white border-2 border-gray-200 relative ${
            embedded ? 'rounded-xl p-4 mb-3 shadow' : 'rounded-2xl p-4 sm:p-8 mb-8 shadow-lg'
          }`}>
            {/* XP Badge - Top Right */}
            <div className={`absolute flex items-center gap-2 bg-green-100 text-green-800 rounded-full ${
              embedded ? 'top-3 right-3 px-2.5 py-1' : 'top-3 right-3 sm:top-6 sm:right-6 px-3 py-1.5 sm:px-4 sm:py-2'
            }`}>
              <span className={embedded ? 'text-xs font-semibold' : 'text-sm sm:text-base font-semibold'} style={{ fontFamily: 'Poppins' }}>
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
              <FlagIcon className="w-5 h-5 text-gray-400 group-hover:text-yellow-500 transition-colors" />
            </button>

            <div className={embedded ? 'mb-2 pr-16 pl-9' : 'mb-6 pr-20 sm:pr-24 pl-10 sm:pl-12'}>
              <h3 className={embedded ? 'text-base font-bold mb-1.5' : 'text-xl sm:text-2xl font-bold mb-4'} style={{ fontFamily: 'Poppins' }}>
                {currentTask.title}
              </h3>
              <p className={embedded ? 'text-gray-700 text-sm leading-snug' : 'text-gray-700 text-base sm:text-lg leading-relaxed'} style={{ fontFamily: 'Poppins' }}>
                {currentTask.description}
              </p>
            </div>

            {!hideDiplomaSubjects && (
            <div className="flex flex-col gap-3 pl-10 sm:pl-12">
              {/* Pillar Badge */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-full">
                  <span className="font-semibold" style={{ fontFamily: 'Poppins' }}>
                    {getPillarData(currentTask.pillar).name}
                  </span>
                </div>
              </div>

              {/* Subject XP Distribution */}
              {currentTask.diploma_subjects && Object.keys(currentTask.diploma_subjects).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium" style={{ fontFamily: 'Poppins' }}>
                    Diploma Credits:
                  </span>
                  {Object.entries(currentTask.diploma_subjects).map(([subject, xp]) => (
                    <div
                      key={subject}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      <span>{subject}</span>
                      <span className="text-blue-500">({xp} XP)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Complexity Dial - rewrite this task easier or harder */}
            <div className={`flex items-center gap-2 ${embedded ? 'mt-3 pl-9' : 'mt-4 pl-10 sm:pl-12'}`}>
              <span className={embedded ? 'text-xs text-gray-500 font-medium' : 'text-sm text-gray-500 font-medium'} style={{ fontFamily: 'Poppins' }}>
                {adjustingTask ? 'Adjusting task...' : 'Adjust difficulty:'}
              </span>
              <button
                onClick={() => handleAdjustTask('easier')}
                disabled={adjustingTask || loading || (taskAdjustments[currentTaskIndex] || 0) <= -MAX_ADJUST_STEPS}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold min-h-[36px]"
                style={{ fontFamily: 'Poppins' }}
                title="Make this task easier"
              >
                <ArrowDownIcon className="w-3.5 h-3.5" />
                Easier
              </button>
              <button
                onClick={() => handleAdjustTask('harder')}
                disabled={adjustingTask || loading || (taskAdjustments[currentTaskIndex] || 0) >= MAX_ADJUST_STEPS}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-all disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold min-h-[36px]"
                style={{ fontFamily: 'Poppins' }}
                title="Make this task harder"
              >
                <ArrowUpIcon className="w-3.5 h-3.5" />
                Harder
              </button>
              {adjustingTask && (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-optio-purple rounded-full animate-spin" />
              )}
            </div>
          </div>

          {/* Action Buttons - 2 Column Layout */}
          <div className={embedded ? 'grid grid-cols-2 gap-3 mb-3' : 'grid grid-cols-2 gap-4 mb-6'}>
            {/* Skip Button */}
            <button
              onClick={handleSkipTask}
              disabled={loading || adjustingTask}
              className={`items-center justify-center border-2 border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50 ${
                embedded ? 'flex flex-row gap-2 p-2.5 rounded-lg min-h-[44px]' : 'flex flex-col p-6 rounded-xl'
              }`}
            >
              <XMarkIcon className={embedded ? 'w-5 h-5 text-red-600' : 'w-12 h-12 text-red-600 mb-2'} />
              <span className={embedded ? 'font-bold text-sm text-red-700' : 'font-bold text-lg text-red-700'} style={{ fontFamily: 'Poppins' }}>
                Skip
              </span>
            </button>

            {/* Accept Button */}
            <button
              onClick={handleAcceptTask}
              disabled={loading || adjustingTask}
              className={`items-center justify-center border-2 border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50 ${
                embedded ? 'flex flex-row gap-2 p-2.5 rounded-lg min-h-[44px]' : 'flex flex-col p-6 rounded-xl'
              }`}
            >
              <CheckIcon className={embedded ? 'w-5 h-5 text-green-600' : 'w-12 h-12 text-green-600 mb-2'} />
              <span className={embedded ? 'font-bold text-sm text-green-700' : 'font-bold text-lg text-green-700'} style={{ fontFamily: 'Poppins' }}>
                {loading ? 'Adding...' : 'Add'}
              </span>
            </button>
          </div>

          {/* Progress Summary */}
          <div className={embedded ? 'bg-blue-50 border border-blue-200 rounded-lg p-2.5' : 'bg-blue-50 border-2 border-blue-200 rounded-xl p-5'}>
            <p className={embedded ? 'text-xs text-blue-900' : 'text-sm text-blue-900'} style={{ fontFamily: 'Poppins' }}>
              💡 <strong>Progress:</strong> You've accepted {acceptedTasks.length} task{acceptedTasks.length !== 1 ? 's' : ''} so far.
              {currentTaskIndex === generatedTasks.length - 1 && ' This is the last task!'}
            </p>
          </div>
        </div>
      )}

      {/* Step 5: Choose a Path (path picker) */}
      {step === 5 && creationMethod === 'path' && hasPaths && (
        <div>
          <h2 className={sz.heading} style={{ fontFamily: 'Poppins' }}>
            Choose a Path
          </h2>
          <p className={sz.subheading} style={{ fontFamily: 'Poppins' }}>
            Pick a ready-made set of tasks to get started. You can edit, add, or
            remove tasks afterward.
            {xpThreshold
              ? ` Each path's tasks add up to about ${xpThreshold} XP — enough to complete the quest.`
              : ''}
          </p>

          <div className={`grid grid-cols-1 sm:grid-cols-2 ${embedded ? 'gap-3 mb-4' : 'gap-4 mb-6'}`}>
            {paths.map((path, index) => (
              <ApproachExampleCard
                key={`${path.label}-${index}`}
                label={path.label}
                description={path.description}
                tasks={path.tasks || []}
                xpThreshold={xpThreshold || null}
                accentColor={['purple-50', 'pink-50', 'blue-50', 'teal-50'][index % 4]}
                isEnrolled={false}
                isSelecting={selectingPathIndex === index}
                onSelect={() => handleSelectPath(index)}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            <button
              onClick={() => {
                setStep(1);
                setCreationMethod(null);
                setSelectingPathIndex(null);
                setError(null);
              }}
              disabled={selectingPathIndex !== null}
              className={sz.navBtn}
              style={{ fontFamily: 'Poppins' }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Flag Modal — in-flow card in embedded (LTI iframe) mode, where a
          fixed overlay would center against the full iframe height and clip */}
      {showFlagModal && (
        <div
          className={
            embedded
              ? 'my-4'
              : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
          }
        >
          <div
            className={
              embedded
                ? 'bg-white rounded-2xl p-6 max-w-md w-full mx-auto border-2 border-yellow-300'
                : 'bg-white rounded-2xl p-8 max-w-md w-full'
            }
          >
            <h3 id="flag-modal-title" className={embedded ? 'text-lg font-bold mb-2' : 'text-2xl font-bold mb-4'} style={{ fontFamily: 'Poppins' }}>
              Flag This Task
            </h3>
            <p id="flag-modal-description" className={embedded ? 'text-gray-600 text-sm mb-3' : 'text-gray-600 mb-4'} style={{ fontFamily: 'Poppins' }}>
              Help us improve by reporting tasks that don't make sense or are inappropriate.
            </p>
            <textarea
              id="flag-reason"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Why are you flagging this task? (optional)"
              className={`w-full border-2 border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent mb-4 min-h-[44px] ${
                embedded ? 'p-2 rounded-lg text-sm' : 'p-4 rounded-xl'
              }`}
              rows={embedded ? 2 : 4}
              style={{ fontFamily: 'Poppins' }}
              aria-labelledby="flag-modal-title"
              aria-describedby="flag-modal-description"
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setShowFlagModal(false);
                  setFlagReason('');
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all min-h-[44px]"
                style={{ fontFamily: 'Poppins' }}
              >
                Cancel
              </button>
              <button
                onClick={handleFlagTask}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 font-bold transition-all disabled:opacity-50 min-h-[44px]"
                style={{ fontFamily: 'Poppins' }}
              >
                {loading ? 'Flagging...' : 'Submit Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel button (always visible) */}
      <div className={embedded ? 'mt-4 text-center' : 'mt-8 text-center'}>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-sm min-h-[44px]"
          style={{ fontFamily: 'Poppins' }}
        >
          Cancel Personalization
        </button>
      </div>
        </div>
      </div>
    </div>
  );
}
