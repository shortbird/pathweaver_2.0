import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';
import useHidePillars from '../../hooks/useHidePillars';
import { useStudentScope } from '../../hooks/useStudentScope';
import ManualTaskCreator from './ManualTaskCreator';
import logger from '../../utils/logger';
import { useAIAccess } from '../../contexts/AIAccessContext';
import { useAuth } from '../../contexts/AuthContext';
import { getCreditStanding, XP_PER_CREDIT } from '../../utils/creditRequirements';
import { getSubjectName } from '../../constants/subjects';

// Requirements and progress come from utils/creditRequirements — the same
// source the diploma panel reads.
//
// This file used to carry its own copy of the requirement table, and the two
// had drifted: Social Studies asked 7000 XP here and 8000 there, so a student
// was told a different thing about the same subject on two screens. The copy
// also predated elective overflow, so a subject completed by surplus from
// another (Electives, filled by over-earned CTE) still showed as unfinished
// and invited a student to spend a quest on credit they already had.

// QF-02: one component per wizard step, in ./personalizationWizard/. The
// wizard keeps the state -- a wizard's state genuinely crosses its steps --
// and each step owns its own markup.
import { CHALLENGE_LEVELS, DIPLOMA_SUBJECTS, MAX_ADJUST_STEPS } from './personalizationWizard/wizardOptions';
import ChooseMethodStep from './personalizationWizard/ChooseMethodStep';
import InterestsStep from './personalizationWizard/InterestsStep';
import TaskReviewStep from './personalizationWizard/TaskReviewStep';
import WizardFooter from './personalizationWizard/WizardFooter';

/**
 * @param hideDiplomaSubjects   When true, hide Optio-platform-specific
 *   framing that doesn't translate to a Canvas-graded assignment:
 *     • the "Diploma Credits" picker on the interests step
 *     • the pillar badge + diploma-credits row on the review step
 *   The "Any specific ideas?" textarea stays visible regardless.
 * @param embedded              When true, render in-flow instead of as a
 *   fixed-position modal. Inside the Canvas LTI iframe the page height is
 *   content-driven (LtiShell frameResize), so `fixed inset-0` centers the
 *   dialog against the full — possibly very tall — iframe and clips it out
 *   of the visible viewport. Embedded mode drops the overlay, the viewport
 *   max-height, and the inner scrollbar; the iframe just grows.
 * @param classSubject          The transcript subject key when the parent quest
 *   is a credit class (quest_type='class'). Only affects copy: the backend
 *   routes 100% of a class task's XP into that subject, so the student is told
 *   which credit their tasks feed rather than being asked to pick.
 *
 * Family scope: a parent runs this exact wizard for a child. Every request
 * below carries `student_id` (hooks/useStudentScope) and the backend's
 * @student_scope writes the session, the tasks and the enrollment to the
 * CHILD, stamped with the parent as created_by. The subject-XP ring reads
 * the child's credits the same way. Until 2026-09-15 this took
 * onAcceptTaskOverride / onManualTasksOverride callbacks that rerouted two of
 * the writes to /api/family and left the AI session on the parent's own row.
 */
export default function QuestPersonalizationWizard({
  questId,
  questTitle,
  onComplete,
  onCancel,
  hideDiplomaSubjects = false,
  embedded = false,
  classSubject = null,
}) {
  const classSubjectName = classSubject ? getSubjectName(classSubject) : null;
  const hidePillars = useHidePillars();
  const { params: scope, studentId } = useStudentScope();
  // Drafts of hand-written tasks are keyed per child so two children's
  // half-written lists never mix.
  const draftScope = studentId;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { canUseTaskGeneration } = useAIAccess();
  const { user } = useAuth();

  // NEW: Creation method selection
  const [creationMethod, setCreationMethod] = useState(null); // 'ai' | 'manual'

  // Wizard state
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [crossCurricularSubjects, setCrossCurricularSubjects] = useState([]);
  // Off by default: cross-curricular tasks are the point for most learners.
  // On, it stops the AI paying a slice of every task into a subject the
  // student did not pick — which is what made it impossible to tell how close
  // they were to finishing the one credit they were actually working on.
  const [strictSubjects, setStrictSubjects] = useState(false);
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
  // Cache of already-generated difficulty variants per task: { [taskIndex]: { [step]: task } }.
  // Revisiting a step (easier then harder again) restores the exact same task
  // instead of paying for a new AI rewrite.
  const [taskVariants, setTaskVariants] = useState({});
  const [adjustingTask, setAdjustingTask] = useState(false);

  // Credit progress state
  const [subjectXP, setSubjectXP] = useState({});
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Keyed by subject so a card can look itself up. Same standing the diploma
  // panel shows, elective overflow and all.
  const creditStanding = getCreditStanding(subjectXP).progress.reduce((acc, c) => {
    acc[c.subject] = c;
    return acc;
  }, {});

  // Fetch user's subject XP on mount
  useEffect(() => {
    // Parent-authoring mode: this endpoint is caller-scoped, so it would show
    // the parent's credits, not the child's. Leave the map empty instead.

    const fetchSubjectXP = async () => {
      setLoadingCredits(true);
      try {
        const response = await api.get('/api/users/subject-xp', { params: scope });
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
  }, [studentId]);

  // Start personalization session
  const startSession = async (method) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/start-personalization`, { ...scope });
      const newSessionId = response.data.session_id;
      if (!newSessionId) {
        throw new Error('No session ID returned from server');
      }
      setSessionId(newSessionId);

      // Set with the step, not before the request: the method decides the
      // step count, so setting it early redrew step 1 of 4 (25%) over step 1
      // of 3 (33%) and the progress bar ran backwards while this loaded.
      setCreationMethod(method);
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
        ...scope,
        session_id: sessionId,
        approach: 'hybrid', // Default since we removed the approach selection
        interests: selectedInterests,
        cross_curricular_subjects: crossCurricularSubjects,
        strict_subjects: strictSubjects,
        // Parity with the mobile app: tell the AI which tasks already exist so it
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
      setTaskVariants({});
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
      // A throw lands in the catch below and the task is not marked accepted.
      const response = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
        ...scope,
        session_id: sessionId,
        task: currentTask
      });
      const accepted = response.data.success;

      if (accepted) {
        // Track accepted task
        const nowAccepted = [...acceptedTasks, currentTask];
        setAcceptedTasks(nowAccepted);

        // Move to next task or complete
        if (currentTaskIndex < generatedTasks.length - 1) {
          setCurrentTaskIndex(currentTaskIndex + 1);
        } else {
          // All tasks reviewed, complete wizard. Pass the new count: the state
          // above has not landed yet, and reading it here refused a student
          // whose only accepted task was the last one.
          completeWizard(nowAccepted.length);
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
        ...scope,
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
  // Each generated variant is cached by step, so stepping back to a difficulty
  // the student has already seen restores that exact task without an AI call.
  const handleAdjustTask = async (direction) => {
    if (adjustingTask || loading) return;
    const task = generatedTasks[currentTaskIndex];
    const steps = taskAdjustments[currentTaskIndex] || 0;
    if ((direction === 'harder' && steps >= MAX_ADJUST_STEPS) ||
        (direction === 'easier' && steps <= -MAX_ADJUST_STEPS)) {
      return;
    }

    const newStep = steps + (direction === 'harder' ? 1 : -1);
    const cached = taskVariants[currentTaskIndex]?.[newStep];
    if (cached) {
      setGeneratedTasks(prev =>
        prev.map((t, i) => (i === currentTaskIndex ? cached : t))
      );
      setTaskAdjustments(prev => ({ ...prev, [currentTaskIndex]: newStep }));
      return;
    }

    setAdjustingTask(true);
    setError(null);
    try {
      const response = await api.post(`/api/quests/${questId}/adjust-task-difficulty`, {
        ...scope,
        task,
        direction
      });

      if (response.data.success && response.data.task) {
        setGeneratedTasks(prev =>
          prev.map((t, i) => (i === currentTaskIndex ? response.data.task : t))
        );
        setTaskAdjustments(prev => ({ ...prev, [currentTaskIndex]: newStep }));
        // Remember both the task the student was looking at and the new
        // variant, keyed by their dial steps.
        setTaskVariants(prev => ({
          ...prev,
          [currentTaskIndex]: {
            ...prev[currentTaskIndex],
            [steps]: task,
            [newStep]: response.data.task
          }
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

  // Complete wizard. Also the review step's early exit: each accepted task is
  // already saved on the quest, so finishing needs no further request.
  const completeWizard = (acceptedCount = acceptedTasks.length) => {
    if (acceptedCount > 0) {
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
    setCrossCurricularSubjects(prev => {
      const next = prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId];
      // A lock with nothing selected is a promise we cannot keep, and the
      // backend drops the flag anyway. Clear it rather than leave a checked
      // box that does nothing.
      if (next.length === 0) setStrictSubjects(false);
      return next;
    });
  };

  // "Only Fine Arts" reads better than "only these subjects" when there is one.
  const selectedSubjectNames = crossCurricularSubjects
    .map(id => DIPLOMA_SUBJECTS.find(s => s.id === id)?.label)
    .filter(Boolean)
    .join(', ');

  const currentTask = generatedTasks[currentTaskIndex];

  // The Generate button sits at the bottom of a long interests form, so the
  // first generated task would otherwise open below the fold. Bring the wizard
  // back to its top when the review step appears.
  const scrollBoxRef = useRef(null);
  useEffect(() => {
    if (step !== 4) return;
    const box = scrollBoxRef.current;
    if (!box) return;
    if (embedded) {
      // Embedded, the host page scrolls rather than the wizard.
      box.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    } else {
      box.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
  }, [step, embedded]);

  // AI: method, interests, generation, review (4). Manual: method, manual creator (3).
  const totalSteps = creationMethod === 'ai' ? 4 : 3;

  // Step 1 column count flexes with how many creation options are visible.
  const step1GridCols = canUseTaskGeneration ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-md';

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
        ref={scrollBoxRef}
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
                <span className={sz.progressLabel}>
                  Step {step} of {totalSteps}
                </span>
              </div>
              <div className={`w-full bg-gray-200 rounded-full ${sz.progressBar}`}>
                <div
                  className={`bg-gradient-primary ${sz.progressBar} rounded-full transition-all duration-300`}
                  style={{ width: `${(step / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

      {error && (
        <div className={embedded ? 'mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm' : 'mb-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl text-red-700'}>
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Step 1: Choose Creation Method */}
      {step === 1 && (
        <ChooseMethodStep
          canUseTaskGeneration={canUseTaskGeneration} embedded={embedded}
          loading={loading} questTitle={questTitle}
          startSession={startSession} step1GridCols={step1GridCols} sz={sz}
        />
      )}

      {/* Step 2: Select Interests & Subjects (previously Step 3) */}
      {step === 2 && (
        <InterestsStep
          additionalFeedback={additionalFeedback} setAdditionalFeedback={setAdditionalFeedback}
          challengeLevel={challengeLevel} setChallengeLevel={setChallengeLevel}
          classSubjectName={classSubjectName} creditStanding={creditStanding}
          crossCurricularSubjects={crossCurricularSubjects} embedded={embedded}
          generateTasks={generateTasks} hideDiplomaSubjects={hideDiplomaSubjects}
          loading={loading} loadingCredits={loadingCredits}
          selectedInterests={selectedInterests} setStep={setStep} sz={sz}
          toggleInterest={toggleInterest} toggleSubject={toggleSubject}
          strictSubjects={strictSubjects} setStrictSubjects={setStrictSubjects}
          selectedSubjectNames={selectedSubjectNames}
          XP_PER_CREDIT={XP_PER_CREDIT}
        />
      )}

      {/* Step 3: Manual Task Creator (manual path only) */}
      {step === 3 && creationMethod === 'manual' && (
        <ManualTaskCreator
          questId={questId}
          sessionId={sessionId}
          onTasksCreated={handleManualTasksCreated}
          onCancel={onCancel}
          draftScope={draftScope}
        />
      )}

      {/* Step 4: One-at-a-Time Task Review (AI path only) */}
      {step === 4 && creationMethod === 'ai' && currentTask && (
        <TaskReviewStep
          acceptedTasks={acceptedTasks} adjustingTask={adjustingTask}
          creationMethod={creationMethod} currentTask={currentTask}
          currentTaskIndex={currentTaskIndex} embedded={embedded}
          generatedTasks={generatedTasks} getPillarData={getPillarData}
          handleAcceptTask={handleAcceptTask} handleAdjustTask={handleAdjustTask}
          handleSkipTask={handleSkipTask} hideDiplomaSubjects={hideDiplomaSubjects}
          onFinish={() => completeWizard()}
          hidePillars={hidePillars} loading={loading}
          MAX_ADJUST_STEPS={MAX_ADJUST_STEPS} setShowFlagModal={setShowFlagModal}
          step={step} taskAdjustments={taskAdjustments}
        />
      )}
      <WizardFooter
        embedded={embedded} loading={loading}
        showFlagModal={showFlagModal} setShowFlagModal={setShowFlagModal}
        flagReason={flagReason} setFlagReason={setFlagReason}
        handleFlagTask={handleFlagTask}
        onCancel={onCancel}
      />
        </div>
      </div>
    </div>
  );
}
