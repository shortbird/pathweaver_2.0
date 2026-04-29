import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  FlagIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const getTopicAssignments = (moment) =>
  (moment?.topics || []).filter((t) => t.type === 'topic');

const RequestXpModal = ({
  isOpen,
  onClose,
  moment,
  onAttachAndPromote,
  onEvolveTopic
}) => {
  const topicAssignments = useMemo(() => getTopicAssignments(moment), [moment]);

  const [step, setStep] = useState('choose');
  const [activeQuests, setActiveQuests] = useState([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(false);
  const [questsError, setQuestsError] = useState(null);
  const [isAttaching, setIsAttaching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep('choose');
    setQuestsError(null);
  }, [isOpen, moment?.id]);

  const fetchActiveQuests = async () => {
    setIsLoadingQuests(true);
    setQuestsError(null);
    try {
      const response = await api.get('/api/topics/unified');
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to load quests');
      }
      const quests = (response.data.topics || []).filter((t) => t.type === 'quest');
      const projectQuests = (response.data.course_topics || [])
        .flatMap((c) => c.projects || []);
      setActiveQuests([...quests, ...projectQuests]);
    } catch (error) {
      setQuestsError(error?.response?.data?.error || error.message || 'Failed to load quests');
    } finally {
      setIsLoadingQuests(false);
    }
  };

  const handleChooseAttach = () => {
    setStep('attach');
    fetchActiveQuests();
  };

  const handleChooseEvolve = () => {
    if (topicAssignments.length === 0) return;
    if (topicAssignments.length === 1) {
      onEvolveTopic?.({ id: topicAssignments[0].id, name: topicAssignments[0].name });
      onClose();
      return;
    }
    setStep('evolve-pick');
  };

  const handleAttachToQuest = async (quest) => {
    if (!quest?.id) return;
    try {
      setIsAttaching(true);
      const response = await api.post(`/api/learning-events/${moment.id}/assign-topic`, {
        type: 'quest',
        topic_id: quest.id,
        action: 'add'
      });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to attach moment to quest');
      }
      toast.success(`Attached to ${quest.name || 'quest'}`);
      onClose();
      onAttachAndPromote?.({
        questId: quest.id,
        questName: quest.name
      });
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || 'Failed to attach moment');
    } finally {
      setIsAttaching(false);
    }
  };

  if (!isOpen || !moment) return null;

  const renderHeader = (title, subtitle) => (
    <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-5 rounded-t-xl">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold mb-1">{title}</h2>
          <p className="text-white/90 text-sm">{subtitle}</p>
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
  );

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {step === 'choose' && (
          <>
            {renderHeader('Request XP', 'Moments earn XP through a quest. Pick how you want to connect this one.')}
            <div className="p-5 space-y-3">
              <button
                type="button"
                onClick={handleChooseAttach}
                className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-purple-50 text-left transition-all"
              >
                <FlagIcon className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">
                    Attach to one of my active quests
                  </p>
                  <p className="text-xs text-gray-500">
                    Pick a quest, then promote this moment into a task on it
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleChooseEvolve}
                disabled={topicAssignments.length === 0}
                className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-purple-50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">
                    Evolve a topic into a quest
                  </p>
                  <p className="text-xs text-gray-500">
                    {topicAssignments.length === 0
                      ? 'Available once this moment is in a topic'
                      : 'Turn one of this moment\'s topics into a quest with tasks'}
                  </p>
                </div>
              </button>
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'attach' && (
          <>
            {renderHeader('Attach to a Quest', 'Pick one of your active quests')}
            <div className="p-5 space-y-3">
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="flex items-center gap-1.5 text-xs text-optio-purple hover:underline"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              {isLoadingQuests ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : questsError ? (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between gap-2">
                  <span>{questsError}</span>
                  <button
                    type="button"
                    onClick={fetchActiveQuests}
                    className="flex items-center gap-1 text-red-700 hover:underline"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              ) : activeQuests.length === 0 ? (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  You don't have any active quests yet. Pick up a quest first, or evolve a topic into one.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activeQuests.map((quest) => (
                    <button
                      key={quest.id}
                      type="button"
                      onClick={() => handleAttachToQuest(quest)}
                      disabled={isAttaching}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-purple-50 text-left transition-all disabled:opacity-50"
                    >
                      {quest.type === 'project' ? (
                        <AcademicCapIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                      ) : (
                        <FlagIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {quest.name || 'Quest'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'evolve-pick' && (
          <>
            {renderHeader('Pick a Topic to Evolve', 'Pick which of this moment\'s topics to turn into a quest')}
            <div className="p-5 space-y-3">
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="flex items-center gap-1.5 text-xs text-optio-purple hover:underline"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="space-y-2">
                {topicAssignments.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      onEvolveTopic?.({ id: topic.id, name: topic.name });
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 hover:border-optio-purple hover:bg-purple-50 text-left transition-all"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: topic.color || '#9333ea' }}
                    />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {topic.name || 'Topic'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default RequestXpModal;
