import { useState, useEffect } from 'react';
import { Modal, Alert, FormFooter } from '../ui';
import { DIPLOMA_PILLARS } from '../../utils/pillarMappings';

const PILLAR_OPTIONS = Object.entries(DIPLOMA_PILLARS).map(([value, p]) => ({
  value,
  label: p.name,
  color: p.color,
}));

const MAX_STUDENT_XP = 200;

// Display names must match the backend SUBJECT_NORMALIZATION map in
// routes/tasks/xp_helpers.py (same list as ManualTaskCreator).
const SUBJECT_OPTIONS = [
  'Language Arts',
  'Math',
  'Science',
  'Social Studies',
  'Financial Literacy',
  'Health',
  'PE',
  'Fine Arts',
  'CTE',
  'Digital Literacy',
  'Electives'
];

// diploma_subjects is stored as either a {subject: xp} dict (AI-generated
// tasks) or a plain list of names (previously re-tagged tasks).
const subjectsFromTask = (task) => {
  const raw = task?.diploma_subjects;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.keys(raw);
  return [];
};

export default function StudentTaskEditModal({ task, onClose, onSave, isClassQuest = false }) {
  const [pillar, setPillar] = useState('stem');
  const [xpValue, setXpValue] = useState(100);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setPillar(task.pillar || 'stem');
      setXpValue(task.xp_value || 100);
      setSubjects(subjectsFromTask(task));
    }
  }, [task]);

  const toggleSubject = (s) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const xp = parseInt(xpValue, 10);
    if (!Number.isFinite(xp) || xp < 1 || xp > MAX_STUDENT_XP) {
      setError(`XP must be between 1 and ${MAX_STUDENT_XP}`);
      return;
    }
    if (!isClassQuest && subjects.length === 0) {
      setError('Pick at least one diploma subject');
      return;
    }

    setLoading(true);
    try {
      const payload = { pillar, xp_value: xp };
      // Class quests lock credit to the class subject; don't send subjects.
      if (!isClassQuest) payload.diploma_subjects = subjects;
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Edit Task"
      className="max-w-full sm:max-w-xl mx-2 sm:mx-0"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Skill Pillar
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PILLAR_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPillar(p.value)}
                className={`px-4 py-3 rounded-md border-2 transition-all min-h-[44px] ${
                  pillar === p.value
                    ? 'border-optio-purple bg-optio-purple/10'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-sm font-medium text-gray-900">{p.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {!isClassQuest && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Diploma Credit
            </label>
            <div className="flex flex-wrap gap-2">
              {[...SUBJECT_OPTIONS, ...subjects.filter((s) => !SUBJECT_OPTIONS.includes(s))].map((s) => {
                const selected = subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={`px-3 py-2 rounded-full border-2 text-sm font-medium transition-all min-h-[40px] ${
                      selected
                        ? 'border-optio-purple bg-optio-purple text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {selected && <span className="mr-1">✓</span>}
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Choose the subject(s) this task counts toward. Picking more than one splits the XP evenly. Final credit values are confirmed during diploma review.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="xp_value" className="block text-sm font-semibold text-gray-700 mb-2">
            XP Value
          </label>
          <input
            type="number"
            id="xp_value"
            value={xpValue}
            onChange={(e) => setXpValue(e.target.value)}
            min="1"
            max={MAX_STUDENT_XP}
            step="1"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-optio-purple focus:border-optio-purple min-h-[44px]"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum {MAX_STUDENT_XP} XP per task. Final credit values are confirmed during diploma review.
          </p>
        </div>

        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={loading ? 'Saving...' : 'Save'}
          isSubmitting={loading}
          disabled={loading}
        />
      </form>
    </Modal>
  );
}
