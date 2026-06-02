import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { SUBJECTS, getSubject } from '../../constants/subjects';

export const DEFAULT_PROMOTED_TASK_XP = 50;

const PILLAR_CONFIG = {
  art: { label: 'Art', color: 'bg-purple-600', light: 'bg-purple-50 text-purple-700 border-purple-200' },
  stem: { label: 'STEM', color: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  wellness: { label: 'Wellness', color: 'bg-orange-600', light: 'bg-orange-50 text-orange-700 border-orange-200' },
  communication: { label: 'Communication', color: 'bg-green-600', light: 'bg-green-50 text-green-700 border-green-200' },
  civics: { label: 'Civics', color: 'bg-red-600', light: 'bg-red-50 text-red-700 border-red-200' }
};

/**
 * AddToQuestModal — the single "Add to quest" action for a learning moment.
 *
 * Adding a moment to a quest turns it into a task (50 XP default) in one step;
 * there is no separate "promote" step. Collects a title, a learning pillar, and
 * an optional diploma credit. When the quest is a class, the diploma credit is
 * locked to that class's subject.
 *
 * (File name kept as PromoteToTaskModal for import stability.)
 */
const AddToQuestModal = ({ isOpen, onClose, moment, quest, onSuccess }) => {
  const isClass = quest?.quest_type === 'class';
  const classSubject = isClass ? (quest?.transcript_subject || null) : null;

  const [title, setTitle] = useState('');
  const [pillar, setPillar] = useState('stem');
  const [xpValue, setXpValue] = useState(DEFAULT_PROMOTED_TASK_XP);
  const [diplomaSubject, setDiplomaSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !moment) return;
    setTitle(moment.title || moment.ai_generated_title || '');
    setPillar(moment.pillars?.[0] || 'stem');
    setXpValue(DEFAULT_PROMOTED_TASK_XP);
    setDiplomaSubject(isClass ? (classSubject || '') : '');
  }, [isOpen, moment, isClass, classSubject]);

  if (!isOpen || !moment || !quest) return null;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const response = await api.post(`/api/learning-events/${moment.id}/convert-to-task`, {
        quest_id: quest.id,
        title: title.trim() || null,
        pillar,
        xp_value: xpValue,
        // A class quest forces its own subject server-side; only send a
        // diploma_subject for non-class quests (optional).
        diploma_subject: isClass ? undefined : (diplomaSubject || null)
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Added to quest');
        onSuccess?.(response.data.task);
        onClose();
      } else {
        toast.error(response.data.error || 'Failed to add to quest');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add to quest');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-5 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold mb-1 truncate">Add to {quest.name || 'quest'}</h2>
              <p className="text-white/90 text-sm">
                This becomes a task you complete to earn XP.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="add-quest-title"
              className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2"
            >
              Task Title
            </label>
            <input
              id="add-quest-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Learning Pillar
            </span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PILLAR_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPillar(key)}
                  className={`
                    px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
                    ${pillar === key
                      ? `${config.color} text-white border-transparent`
                      : `${config.light} hover:border-gray-300`}
                  `}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Diploma Credit {!isClass && <span className="normal-case text-gray-400">(optional)</span>}
            </span>
            {isClass ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-200">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getSubject(classSubject)?.accent || '#6D469B' }}
                />
                <span className="text-sm font-medium text-gray-900">
                  {getSubject(classSubject)?.name || classSubject}
                </span>
                <span className="ml-auto text-xs text-purple-700">Class credit</span>
              </div>
            ) : (
              <select
                value={diplomaSubject}
                onChange={(e) => setDiplomaSubject(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm"
              >
                <option value="">No diploma credit</option>
                {SUBJECTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="add-quest-xp"
              className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2"
            >
              XP Value
            </label>
            <div className="flex items-center gap-3">
              <input
                id="add-quest-xp"
                type="range"
                min="10"
                max="200"
                step="10"
                value={xpValue}
                onChange={(e) => setXpValue(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-optio-purple"
              />
              <span className="text-sm font-bold text-gray-900 w-16 text-right">{xpValue} XP</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Default {DEFAULT_PROMOTED_TASK_XP} XP. You can edit the task's title, pillar, and XP later from the quest page.
            </p>
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl hover:shadow-lg disabled:opacity-50 transition-all font-medium text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                Add to quest
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddToQuestModal;
