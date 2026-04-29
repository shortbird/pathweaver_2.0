import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftIcon,
  FlagIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

export const DEFAULT_PROMOTED_TASK_XP = 50;

const PILLAR_CONFIG = {
  art: { label: 'Art', color: 'bg-purple-600', light: 'bg-purple-50 text-purple-700 border-purple-200' },
  stem: { label: 'STEM', color: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  wellness: { label: 'Wellness', color: 'bg-orange-600', light: 'bg-orange-50 text-orange-700 border-orange-200' },
  communication: { label: 'Communication', color: 'bg-green-600', light: 'bg-green-50 text-green-700 border-green-200' },
  civics: { label: 'Civics', color: 'bg-red-600', light: 'bg-red-50 text-red-700 border-red-200' }
};

const getQuestTopics = (moment) =>
  (moment?.topics || []).filter((t) => t.type === 'quest');

const PromoteToTaskModal = ({
  isOpen,
  onClose,
  moment,
  presetQuestId = null,
  onSuccess
}) => {
  const questTopics = useMemo(() => getQuestTopics(moment), [moment]);
  const initialQuestId = presetQuestId
    || (questTopics.length === 1 ? questTopics[0].id : null);

  const [step, setStep] = useState(initialQuestId ? 'form' : 'pick-quest');
  const [questId, setQuestId] = useState(initialQuestId);
  const [title, setTitle] = useState('');
  const [pillar, setPillar] = useState('stem');
  const [xpValue, setXpValue] = useState(DEFAULT_PROMOTED_TASK_XP);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !moment) return;

    const quests = getQuestTopics(moment);
    const next = presetQuestId || (quests.length === 1 ? quests[0].id : null);
    setQuestId(next);
    setStep(next ? 'form' : 'pick-quest');

    setTitle(moment.title || moment.ai_generated_title || '');
    setPillar(moment.pillars?.[0] || 'stem');
    setXpValue(DEFAULT_PROMOTED_TASK_XP);
  }, [isOpen, moment, presetQuestId]);

  if (!isOpen || !moment) return null;

  const selectedQuest = questTopics.find((q) => q.id === questId);

  const handleSubmit = async () => {
    if (!questId) {
      setStep('pick-quest');
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await api.post(`/api/learning-events/${moment.id}/convert-to-task`, {
        quest_id: questId,
        title: title.trim() || null,
        pillar,
        xp_value: xpValue
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Task created!');
        onSuccess?.(response.data.task);
        onClose();
      } else {
        toast.error(response.data.error || 'Failed to create task');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create task');
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
              <h2 className="text-xl font-bold mb-1">Promote to Task</h2>
              <p className="text-white/90 text-sm">
                Turn this learning moment into a quest task you can earn XP for
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

        {step === 'pick-quest' ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">
              This moment is attached to multiple quests. Pick the one to create the task under.
            </p>
            {questTopics.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                This moment isn't attached to a quest yet. Attach it first, then promote.
              </div>
            ) : (
              <div className="space-y-2">
                {questTopics.map((quest) => (
                  <button
                    key={quest.id}
                    type="button"
                    onClick={() => {
                      setQuestId(quest.id);
                      setStep('form');
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-purple-50 text-left transition-all"
                  >
                    <FlagIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {quest.name || 'Quest'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="pt-2">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              {questTopics.length > 1 && selectedQuest && (
                <button
                  type="button"
                  onClick={() => setStep('pick-quest')}
                  className="flex items-center gap-1.5 text-xs text-optio-purple hover:underline"
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                  <span>Quest: {selectedQuest.name || 'Quest'} (change)</span>
                </button>
              )}

              <div>
                <label
                  htmlFor="promote-task-title"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2"
                >
                  Task Title
                </label>
                <input
                  id="promote-task-title"
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
                <label
                  htmlFor="promote-task-xp"
                  className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2"
                >
                  XP Value
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="promote-task-xp"
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
                  Default {DEFAULT_PROMOTED_TASK_XP} XP. You can adjust the task's XP and pillar later from the quest page; advisor confirms at credit time.
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
                    Creating...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Create Task
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PromoteToTaskModal;
