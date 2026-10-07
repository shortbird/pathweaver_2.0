import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/queryKeys';

/**
 * The quest page's two teacher-feedback handlers (ticket 4ea811d6, Horizon:
 * "A banner or pop-up attached to the quest itself would make sure they see
 * it").
 *
 * - bannerProps.onRead: the banner's "Read feedback" opens the task the newest
 *   unread note is on and scrolls the workspace into view.
 * - feedbackRead: the task's thread marks the note read once it loads
 *   (CreditFeedbackThread markRead); refetching the quest and the dashboard
 *   then drops the banner and the card's "New feedback" label.
 */
export default function useTeacherFeedbackActions({ questId, quest, onSelectTask }) {
  const queryClient = useQueryClient();

  const readFeedback = (feedback) => {
    const task = (quest?.quest_tasks || []).find((t) => t.id === feedback?.task_id);
    if (!task) return;
    onSelectTask(task);
    document.getElementById('quest-task-workspace')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const feedbackRead = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.quests.detailAll(questId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.user.all });
  };

  // Set only for the student on their own quest, never in family scope.
  const bannerProps = {
    count: quest?.unread_feedback_count,
    feedback: quest?.latest_feedback,
    onRead: readFeedback,
  };

  return { bannerProps, feedbackRead };
}
