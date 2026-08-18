import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { SUBJECTS } from '../../constants/subjects';
import { ageFromDob, CLASS_MIN_AGE } from '../../utils/age';
import HowClassesWork from '../../components/classes/HowClassesWork';

/**
 * StartClassPage — the guided flow for creating a credit class
 * (quest_type='class' + transcript_subject).
 *
 * It doubles as the tutorial: most students meet the credit model here for the
 * first time, so each step explains the part of the loop it sets up. Creation
 * makes an empty class on purpose — tasks are added on the class page, where the
 * AI task wizard lives, so there is one canonical way to author a task.
 *
 * Ages 13+, mirroring the mobile gate. A student with no date of birth on file
 * is asked for it first (PUT /api/users/profile); the backend independently
 * refuses a self-service under-13 birthday (COPPA), which surfaces as the block
 * screen.
 */

const STEPS = ['name', 'subject', 'details'];
const STEP_TITLES = { name: 'Name', subject: 'Subject', details: 'Details' };

const StartClassPage = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState('name');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Birthday gate
  const [dob, setDob] = useState('');
  const [savingDob, setSavingDob] = useState(false);
  const [dobError, setDobError] = useState(null);

  const age = ageFromDob(user?.date_of_birth);
  const needsDob = !!user && age === null;
  const isUnderage = age !== null && age < CLASS_MIN_AGE;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step, needsDob, isUnderage]);

  const stepIndex = STEPS.indexOf(step);
  const canAdvance = useMemo(() => {
    if (step === 'name') return title.trim().length > 0;
    if (step === 'subject') return !!subject;
    return true;
  }, [step, title, subject]);

  const handleSaveDob = async () => {
    if (!dob || savingDob) return;
    setSavingDob(true);
    setDobError(null);
    try {
      await api.put('/api/users/profile', { date_of_birth: dob });
      await refreshUser?.();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'Could not save your birthday. Please try again.';
      setDobError(typeof msg === 'string' ? msg : 'Could not save your birthday.');
    } finally {
      setSavingDob(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !subject || submitting) return;
    setSubmitting(true);
    try {
      const response = await api.post('/api/quests/create', {
        title: title.trim(),
        description: description.trim() || undefined,
        quest_type: 'class',
        transcript_subject: subject.key,
      });

      const questId = response.data?.quest_id || response.data?.quest?.id;
      if (!questId) throw new Error('No quest id returned');

      toast.success('Class created — now add your first tasks');
      navigate(`/quests/${questId}`);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'Could not create class. Please try again.';
      toast.error(typeof msg === 'string' ? msg : 'Could not create class.');
      setSubmitting(false);
    }
  };

  if (isUnderage) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-gray-900">Classes unlock at {CLASS_MIN_AGE}</h1>
          <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
            High school classes earn transcript credit, so they open up when you turn{' '}
            {CLASS_MIN_AGE}. Until then, quests and bounties are all yours.
          </p>
          <Link to="/quests" className="btn-primary inline-block mt-6">
            Browse quests
          </Link>
        </div>
      </div>
    );
  }

  if (needsDob) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Start a class</h1>
        <p className="text-sm text-gray-500 mt-1">
          Classes are for students {CLASS_MIN_AGE} and up. Add your date of birth to continue.
        </p>

        <div className="card mt-6">
          <label htmlFor="class-dob" className="block text-sm font-medium text-gray-700">
            Date of birth
          </label>
          <input
            id="class-dob"
            type="date"
            value={dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDob(e.target.value)}
            className="input-field mt-1 max-w-xs"
          />
          {dobError && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {dobError}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            We only use this to check that classes are available to you.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link to="/my-classes" className="btn-quiet">
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSaveDob}
              disabled={!dob || savingDob}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingDob ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-optio-purple">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Start a class</h1>
          <p className="text-sm text-gray-500 mt-1">
            Turn something you already care about into high school credit.
          </p>
        </div>
        <Link to="/my-classes" className="btn-quiet flex-shrink-0">
          Cancel
        </Link>
      </div>

      <ol className="flex items-center gap-2 mt-6" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                i <= stepIndex ? 'bg-gradient-primary' : 'bg-gray-200'
              }`}
            />
            <span
              className={`mt-1 block text-xs ${
                i <= stepIndex ? 'text-gray-700 font-medium' : 'text-gray-400'
              }`}
            >
              {STEP_TITLES[s]}
            </span>
          </li>
        ))}
      </ol>

      {step === 'name' && (
        <div className="mt-6 space-y-6">
          <div className="card">
            <label htmlFor="class-title" className="block text-sm font-medium text-gray-700">
              Name your class
            </label>
            <p className="text-sm text-gray-500 mt-1 mb-3">
              Make it real — something you actually want to do.
            </p>
            <input
              id="class-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Soccer Conditioning"
              maxLength={120}
              autoFocus
              className="input-field"
            />
          </div>

          <HowClassesWork />
        </div>
      )}

      {step === 'subject' && (
        <div className="mt-6 space-y-6">
          <div className="card">
            <h2 className="text-sm font-medium text-gray-700">
              Which subject should this count toward?
            </h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Every task in this class counts 100% toward the subject you pick, so choose the one
              you want on your transcript.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUBJECTS.map((s) => {
                const selected = subject?.key === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSubject(s)}
                    className={`text-left rounded-lg p-3 border transition-all ${
                      selected
                        ? 'border-optio-purple bg-optio-purple/5'
                        : 'border-gray-200 hover:border-optio-purple/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.accent }}
                      />
                      <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className="mt-6 space-y-6">
          <div className="card">
            <label htmlFor="class-description" className="block text-sm font-medium text-gray-700">
              What are you actually doing for this class?
            </label>
            <p className="text-sm text-gray-500 mt-1 mb-3">
              A sentence or two helps us suggest better tasks later.
            </p>
            <textarea
              id="class-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Training for varsity tryouts and running three times a week"
              rows={4}
              maxLength={600}
              className="input-field resize-none"
            />
            <p className="text-xs text-gray-500 mt-2">
              Optional — you can add this later.
            </p>
          </div>

          <div className="card bg-optio-purple/5 border-optio-purple/20">
            <h2 className="text-sm font-semibold text-gray-900">Here is what happens next</h2>
            <p className="text-sm text-gray-600 mt-2">
              You are creating <span className="font-semibold">{title.trim()}</span>, counting
              toward <span className="font-semibold">{subject?.name}</span>. We will take you
              straight to your class page to add your first tasks — nothing is locked in, and you
              can keep adding tasks the whole time.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(STEPS[stepIndex - 1])}
          disabled={stepIndex === 0}
          className="btn-quiet disabled:opacity-0 disabled:cursor-default"
        >
          Back
        </button>

        {step === 'details' ? (
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create class'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(STEPS[stepIndex + 1])}
            disabled={!canAdvance}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default StartClassPage;
