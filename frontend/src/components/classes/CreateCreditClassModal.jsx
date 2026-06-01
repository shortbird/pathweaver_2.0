import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { SUBJECTS } from '../../constants/subjects';

/**
 * CreateCreditClassModal
 *
 * Creates a transcript "credit class" (quest_type='class' + transcript_subject).
 * Every task in the class counts 100% toward the chosen subject, and the student
 * works toward a 1,000-XP target (a 0.5 / semester credit) before submitting the
 * class for an Optio review. Mirrors the v2 mobile "Start a Class" flow.
 */
const CreateCreditClassModal = ({ onClose, onCreated }) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canCreate = title.trim().length > 0 && !!subject;

  const handleCreate = async () => {
    if (!canCreate || submitting) return;
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

      toast.success('Class created');
      onCreated?.(questId);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Start a High School Class</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label htmlFor="class-title" className="block text-sm font-semibold text-gray-700 mb-2">
              Class name *
            </label>
            <input
              id="class-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., US History"
              maxLength={120}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Counts toward credit *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SUBJECTS.map((s) => {
                const selected = subject?.key === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={`text-left rounded-lg p-3 border-2 transition ${
                      selected
                        ? 'border-optio-purple bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.accent }}
                      />
                      <span className="font-semibold text-sm text-gray-900">{s.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="class-description" className="block text-sm font-semibold text-gray-700 mb-2">
              What will you do? (optional)
            </label>
            <textarea
              id="class-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sentence or two helps us suggest better tasks later."
              rows={3}
              maxLength={600}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              You'll add tasks on the class page. Everything you do here counts toward your
              {subject ? ` ${subject.name}` : ''} credit.
            </p>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || submitting}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
          >
            {submitting ? 'Creating…' : 'Create class'}
          </button>
        </div>
      </div>
    </div>
  );
};

CreateCreditClassModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
};

export default CreateCreditClassModal;
