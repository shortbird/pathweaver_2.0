/**
 * Quest Detail hook - fetches quest with enrollment, tasks, and engagement.
 * Provides actions: enroll, complete task, create task, generate tasks.
 *
 * Pass `studentId` and every read and write points at that CHILD instead of the
 * signed-in user: the reads carry `?student_id=`, which the backend answers with
 * the child's own quest payload (utils/guardian_scope), and the writes go to the
 * parent-on-behalf-of endpoints under /api/family. That is what lets a parent
 * open the quest screen their kid sees rather than a thinner parent-shaped copy
 * of it — one component, one payload shape, no second UI to keep in step.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface QuestTask {
  id: string;
  title: string;
  description: string;
  /** 2-4 checkable statements defining "done" (AI-personalized tasks). */
  success_criteria?: string[] | null;
  pillar: string;
  xp_value: number;
  xp_amount: number;
  diploma_subjects: string[];
  order_index: number;
  is_completed: boolean;
  is_required: boolean;
  is_moment?: boolean;
  evidence_text?: string;
  evidence_url?: string;
  evidence_blocks?: any[];
  completed_at?: string;
}

/** What a parent may DO on a delegated quest view, per the backend's own write
 *  rules. Present only when the quest was read with `student_id`. */
export interface QuestViewerContext {
  student_id: string;
  student_name: string;
  is_dependent: boolean;
  can_add_tasks: boolean;
  can_complete_tasks: boolean;
  can_remove_tasks: boolean;
}

export interface QuestDetail {
  id: string;
  title: string;
  description: string;
  /** Rich marketing-style description. Curated quests fill this; user-created
   *  quests duplicate `description` into it. Render `big_idea || description`. */
  big_idea?: string;
  header_image_url: string | null;
  image_url: string | null;
  quest_type: string;
  /** Set when quest_type='class' — one of the 11 school_subject keys. */
  transcript_subject?: string | null;
  class_review_status?: 'submitted_for_review' | 'credit_awarded' | 'rejected' | null;
  approach_examples: any;
  allow_custom_tasks: boolean;
  is_active: boolean;
  user_enrollment: any | null;
  completed_enrollment: any | null;
  quest_tasks: QuestTask[];
  template_tasks: any[];
  sample_tasks: any[];
  preset_tasks: any[];
  has_template_tasks: boolean;
  progress: { completed_tasks: number; total_tasks: number; percentage: number } | null;
  /** Set only on a parent's delegated read of a child's quest. */
  viewer_context?: QuestViewerContext;
}

export interface UseQuestDetailOptions {
  /** Parent mode: read and write this child's copy of the quest instead of the
   *  signed-in user's. */
  studentId?: string | null;
}

export function useQuestDetail(questId: string | null, options?: UseQuestDetailOptions) {
  const studentId = options?.studentId || null;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quest, setQuest] = useState<QuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuest = useCallback(async () => {
    if (!isAuthenticated || !questId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = studentId
        ? await api.get(`/api/quests/${questId}`, { params: { student_id: studentId } })
        : await api.get(`/api/quests/${questId}`);
      setQuest(data.quest || data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load quest');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, questId, studentId]);

  const enroll = async (enrollOptions?: { force_new?: boolean; load_previous_tasks?: boolean }) => {
    if (!questId) return;
    // A parent doesn't enroll themselves in their kid's quest — enroll-children
    // starts it on the CHILD's account and copies the template tasks across,
    // exactly as the "Browse quests for <kid>" flow does.
    const { data } = studentId
      ? await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: [studentId] })
      : await api.post(`/api/quests/${questId}/enroll`, enrollOptions || {});
    await fetchQuest();
    return data;
  };

  const completeTask = async (taskId: string, evidenceBlocks?: any[]) => {
    if (!questId) return;
    // Normalize blocks: backend expects `type`, DB returns `block_type`
    const normalized = (evidenceBlocks || []).map((b: any) => ({
      ...b,
      type: b.type || b.block_type,
    }));
    // Parent completing for a managed dependent: the evidence-document endpoint
    // only ever writes the caller's own document, so the on-behalf-of path goes
    // through the task completion endpoint, which takes acting_as_dependent_id
    // and awards the XP to the child.
    let data: any;
    if (studentId) {
      const form = new FormData();
      form.append('acting_as_dependent_id', studentId);
      form.append('evidence_type', 'text');
      form.append('text_content', 'Marked complete by parent');
      form.append('is_confidential', 'false');
      ({ data } = await api.post(`/api/tasks/${taskId}/complete`, form));
    } else {
      ({ data } = await api.post(`/api/evidence/documents/${taskId}`, {
        blocks: normalized,
        status: 'completed',
      }));
    }
    // Update local state immediately
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: prev.quest_tasks.map((t) =>
          t.id === taskId ? { ...t, is_completed: true } : t
        ),
      };
    });
    return data;
  };

  // Personalization session management
  const sessionRef = useRef<string | null>(null);

  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    if (!questId) throw new Error('No quest ID');
    const { data } = await api.post(`/api/quests/${questId}/start-personalization`, {});
    const sid = data.session_id;
    if (!sid) throw new Error('No session ID returned');
    sessionRef.current = sid;
    return sid;
  };

  const generateTasks = async (interests?: string, pillar?: string, subject?: string, challengeLevel?: string) => {
    if (!questId) return [];
    const sessionId = await ensureSession();
    // Pass existing task titles so AI avoids suggesting duplicates
    const existingTitles = (quest?.quest_tasks || []).map((t) => t.title);
    // Split comma-separated interests into a proper list so the AI sees them
    // as distinct items (matches v1 web behavior).
    const interestList = interests
      ? interests.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const { data } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId,
      approach: 'hybrid',
      interests: interestList,
      cross_curricular_subjects: subject ? [subject] : [],
      exclude_tasks: existingTitles,
      // Omitted -> backend falls back to the user's stored preference.
      ...(challengeLevel ? { challenge_level: challengeLevel } : {}),
      // AI generation runs several model calls; override the 15s global timeout.
    }, { timeout: 90000 });
    return data.tasks || data.generated_tasks || [];
  };

  /** Complexity dial: rewrite a suggested task one step easier or harder.
   *  Stateless server call - returns the adjusted task for the caller to swap
   *  into its local suggestion list. */
  const adjustTask = async (task: any, direction: 'easier' | 'harder') => {
    if (!questId) return null;
    const { data } = await api.post(`/api/quests/${questId}/adjust-task-difficulty`, {
      task,
      direction,
    });
    return data.task || null;
  };

  const acceptTask = async (task: any) => {
    if (!questId) return;
    // Parent mode writes to the child's enrollment through the family endpoint,
    // which persists via the same helper the student's own accept-task path
    // uses — success criteria and diploma subjects carry over identically.
    if (studentId) {
      const { data: delegated } = await api.post(`/api/family/quests/${questId}/tasks`, {
        child_id: studentId,
        title: task.title,
        description: task.description,
        pillar: task.pillar,
        xp_value: task.xp_value,
        success_criteria: task.success_criteria,
        diploma_subjects: task.diploma_subjects,
      });
      const created = delegated?.task || {
        id: `temp-${Date.now()}`,
        title: task.title,
        description: task.description || '',
        pillar: task.pillar || 'stem',
        xp_value: task.xp_value || 50,
        xp_amount: task.xp_value || 50,
        diploma_subjects: task.diploma_subjects || [],
        order_index: (quest?.quest_tasks?.length || 0),
        is_completed: false,
        is_required: false,
      };
      setQuest((prev) => (prev ? { ...prev, quest_tasks: [...prev.quest_tasks, created] } : prev));
      return delegated;
    }
    const sessionId = await ensureSession();
    const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
      session_id: sessionId,
      task,
    });
    // Optimistically add the task to local state instead of refetching
    // (refetch causes re-render that can unmount the wizard mid-flow)
    const newTask = data.task || {
      id: data.task_id || `temp-${Date.now()}`,
      title: task.title,
      description: task.description || '',
      pillar: task.pillar || 'stem',
      xp_value: task.xp_value || 50,
      xp_amount: task.xp_value || 50,
      diploma_subjects: task.diploma_subjects || [],
      order_index: (quest?.quest_tasks?.length || 0),
      is_completed: false,
      is_required: false,
    };
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: [...prev.quest_tasks, newTask],
      };
    });
    return data;
  };

  const deleteTask = async (taskId: string) => {
    // Removing a child's task is managed-dependent only; the family endpoint is
    // where that rule lives, so parent mode never touches /api/tasks/<id>.
    if (studentId) {
      await api.delete(`/api/family/quests/${questId}/tasks/${taskId}`, {
        params: { child_id: studentId },
      });
    } else {
      await api.delete(`/api/tasks/${taskId}`);
    }
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quest_tasks: prev.quest_tasks.filter((t) => t.id !== taskId),
      };
    });
  };

  useEffect(() => { fetchQuest(); }, [fetchQuest]);

  return {
    quest, loading, error,
    refetch: fetchQuest,
    enroll, completeTask, generateTasks, acceptTask, adjustTask, deleteTask,
  };
}

export const PILLARS = [
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Communication' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
];

// Display names must match the backend SUBJECT_NORMALIZATION map in
// routes/tasks/xp_helpers.py — unrecognized names produce credit keys the
// diploma system can't count.
export const DIPLOMA_SUBJECTS = [
  'Language Arts', 'Math', 'Science', 'Social Studies', 'Financial Literacy',
  'Health', 'PE', 'Fine Arts', 'CTE', 'Digital Literacy', 'Electives',
];
