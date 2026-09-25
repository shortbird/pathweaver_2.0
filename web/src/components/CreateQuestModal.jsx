import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import classService from '../services/classService';
import { useStudentScope } from '../hooks/useStudentScope';
import { useCreateFamilyQuest } from '../hooks/api/useFamilyQuests';
import { Modal, Alert, FormFooter } from './ui';
import SimilarQuestAutocomplete from './SimilarQuestAutocomplete';
import { useConfirm } from '../contexts/ConfirmContext'
import { toast } from 'react-hot-toast';

/**
 * CreateQuestModal - Modal for users to create their own quests
 *
 * Users can create quests directly, which are private by default (visible only to them)
 * until an admin makes them public. Created quests are immediately available for use.
 *
 * Two callers, one form:
 *  - a learner (or a parent in family scope, for one child): POST
 *    /api/quests/create, which enrolls the account it is made on;
 *  - the family dashboard, with `familyChildren`: a FAMILY quest -- created
 *    on the parent's account and the chosen children enrolled in it, each
 *    with their own copy (hooks/api/useFamilyQuests). The picker below is the
 *    only difference the parent sees.
 *
 * A learner in a school class can also say which class the quest is for
 * (Gryffin, 2026-09-25: a teacher assigned "create your own quest" and could
 * not see what came back). It stays private; the class's teacher sees it on
 * the class. `initialClassId` preselects one, from the class page.
 */
const CreateQuestModal = ({ isOpen, onClose, onSuccess, familyChildren = null, initialClassId = '' }) => {
  const { params: scope, studentId: scopedStudentId } = useStudentScope();
  const confirm = useConfirm()
  const navigate = useNavigate();
  const forFamily = Array.isArray(familyChildren);
  const createFamilyQuest = useCreateFamilyQuest();
  const [childIds, setChildIds] = useState([]);
  // Every child starts ticked: a family quest is usually for everyone, and
  // unticking one is less work than ticking three.
  useEffect(() => {
    if (isOpen && forFamily) setChildIds(familyChildren.map((c) => c.id));
  }, [isOpen, forFamily, familyChildren]);
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(initialClassId || '');

  // The learner's own classes. Best-effort: without them the form is the
  // personal quest form it always was.
  useEffect(() => {
    if (!isOpen || forFamily) return undefined;
    let live = true;
    setClassId(initialClassId || '');
    classService.getMyStudentClasses({ studentId: scopedStudentId })
      .then((r) => { if (live) setClasses((r?.classes || []).map((c) => ({ id: c.id, name: c.name }))); })
      .catch(() => { if (live) setClasses([]); });
    return () => { live = false; };
  }, [isOpen, forFamily, scopedStudentId, initialClassId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Show suggestions when title has 3+ characters
    if (name === 'title') {
      setShowSuggestions(value.length >= 3);
    }
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSelectSimilarQuest = async (selectedQuest) => {
    if (await confirm(`Use the existing quest "${selectedQuest.title}" instead of creating a new one?`)) {
      onClose();
      navigate(`/quests/${selectedQuest.id}`);
    }
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    if (forFamily && childIds.length === 0) {
      setError('Pick at least one child');
      return;
    }

    setIsSubmitting(true);

    try {
      if (forFamily) {
        const result = await createFamilyQuest.mutateAsync({
          title: formData.title.trim(),
          description: formData.description.trim(),
          childIds,
        });
        setFormData({ title: '', description: '' });
        onSuccess?.(result.quest, result);
        onClose();
        return;
      }

      // Call the new user quest creation endpoint
      // In family scope the quest is created on the CHILD's account, the way
      // the child would have made it (backend @student_scope).
      const response = await api.post('/api/quests/create', {
        ...scope,
        title: formData.title.trim(),
        big_idea: formData.description.trim(),
        ...(classId ? { class_id: classId } : {}),
      });

      if (response.data.success) {
        if (classId && !response.data.class_attached) {
          toast.error('Your quest was made, but it could not be added to your class. Tell your teacher.');
        }
        // Reset form
        setFormData({ title: '', description: '' });

        // Call success callback
        if (onSuccess) {
          onSuccess(response.data.quest);
        }

        // Close modal
        onClose();
      } else {
        setError(response.data.error || 'Failed to create quest');
      }
    } catch (err) {
      console.error('Error creating quest:', err);
      setError(err.response?.data?.error || 'Failed to create quest. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={forFamily ? 'New family quest' : 'Create Your Own Quest'}
      className="max-w-full sm:max-w-2xl mx-2 sm:mx-0"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info box */}
        <Alert variant="purple">
          {forFamily
            ? 'Set up a quest for your children. Each of them gets their own copy to work through, and you can add tasks from their quest page.'
            : 'Create your own quest and start working right away!'}
        </Alert>

        {/* Error message */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}

        {/* Title input */}
        <div className="relative">
          <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
            Quest Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            onFocus={() => formData.title.length >= 3 && setShowSuggestions(true)}
            placeholder="e.g., Learn to Play Guitar, Build a Personal Website, etc."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px]"
            disabled={isSubmitting}
            maxLength={200}
            autoComplete="off"
          />

          {/* Similar quest suggestions */}
          <SimilarQuestAutocomplete
            searchTerm={formData.title}
            onSelectQuest={handleSelectSimilarQuest}
            onClose={() => setShowSuggestions(false)}
            isOpen={showSuggestions}
          />

          <p className="mt-1 text-xs text-gray-500">
            {formData.title.length}/200 characters
          </p>
        </div>

        {/* Description input */}
        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
            Quest Description *
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe what you want to learn or accomplish. What skills will you develop? What will you create?"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none min-h-[120px]"
            rows={6}
            disabled={isSubmitting}
            maxLength={2000}
          />
          <p className="mt-1 text-xs text-gray-500">
            {formData.description.length}/2000 characters
          </p>
        </div>

        {!forFamily && classes.length > 0 && (
          <div>
            <label htmlFor="quest-class" className="block text-sm font-semibold text-gray-700 mb-2">
              Is this for a class?
            </label>
            <select
              id="quest-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px]"
            >
              <option value="">No, it’s just for me</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {classId && (
              <p className="mt-1 text-xs text-gray-500">
                Your teacher will see it on the class. Other students won’t.
              </p>
            )}
          </div>
        )}

        {forFamily && (
          <fieldset>
            <legend className="block text-sm font-semibold text-gray-700 mb-2">Who is it for? *</legend>
            <div className="flex flex-wrap gap-2">
              {familyChildren.map((child) => {
                const on = childIds.includes(child.id);
                return (
                  <label
                    key={child.id}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                      on ? 'border-optio-purple bg-optio-purple/5 text-optio-purple' : 'border-gray-300 text-gray-700 hover:border-optio-purple'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={isSubmitting}
                      onChange={() => setChildIds((prev) => (on ? prev.filter((id) => id !== child.id) : [...prev, child.id]))}
                    />
                    {child.avatarUrl ? (
                      <img src={child.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="w-5 h-5 rounded-full bg-optio-purple/10 text-optio-purple text-[10px] font-semibold flex items-center justify-center">
                        {(child.firstName || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    {child.firstName}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Footer buttons */}
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={isSubmitting ? 'Creating...' : (forFamily ? 'Create family quest' : 'Create Quest')}
          isSubmitting={isSubmitting}
        />
      </form>
    </Modal>
  );
};

export default CreateQuestModal;
