/**
 * Family quests (/api/family/quests), for the Family tab.
 *
 * A quest is the family's when the parent set it up (created_by) or is
 * enrolled in it themselves -- a school's training quest, or one they made
 * on their own account. Each carries `members`: the parent (is_self) and the
 * children with an enrollment, each with their own progress and rhythm. A
 * child's own quests are not here; those are on the child's card.
 *
 * The writes are the same three the web dashboard makes: create (private,
 * owned by the parent) then enroll the chosen children; add a child to a
 * quest the family already has -- they arrive with the quest's task list, a
 * copy of a sibling's when the quest has no template, which is every
 * parent-made quest (2026-09-18); and end one member's run at a quest --
 * POST /api/quests/:id/end with `student_id`, the route the quest screen's
 * own End button uses, so the work and XP are kept and the quest can be
 * reopened from the child's completed quests.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useRefetchOnForeground } from './useRefetchOnForeground';
import type { RhythmState } from './useDashboard';

export interface QuestRhythm extends RhythmState {
  last_7_days?: { date: string; intensity: number }[];
  active_days_last_week?: number;
}

export interface FamilyQuestMember {
  user_id: string;
  first_name: string;
  avatar_url: string | null;
  is_self: boolean;
  completed_at: string | null;
  progress?: { completed_tasks: number; total_tasks: number };
  rhythm?: QuestRhythm | null;
}

export interface FamilyQuest {
  id: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  members: FamilyQuestMember[];
}

export function useFamilyQuests() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [quests, setQuests] = useState<FamilyQuest[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const { data } = await api.get('/api/family/quests');
      setQuests(data?.quests || []);
    } catch {
      // Not a parent, or the route is not there yet: an empty section.
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refetch(); }, [refetch]);
  useRefetchOnForeground(refetch);

  const enrollChildren = useCallback(async (questId: string, childIds: string[]) => {
    const { data } = await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: childIds });
    await refetch();
    return { enrolled: data?.enrolled || [], failed: data?.failed || [] } as
      { enrolled: unknown[]; failed: { error?: string }[] };
  }, [refetch]);

  const endMemberQuest = useCallback(async (questId: string, studentId: string | null) => {
    await api.post(`/api/quests/${questId}/end`, studentId ? { student_id: studentId } : {});
    await refetch();
  }, [refetch]);

  return { quests, loading, refetch, enrollChildren, endMemberQuest };
}

/**
 * Set up a family quest: create it on the parent's account, then enroll the
 * chosen children. Returns the new quest id. Shared by CreateQuestSheet in
 * its family mode and its single-child mode (which passes one id).
 */
export async function createFamilyQuest(
  body: { title: string; description?: string },
  childIds: string[],
): Promise<{ questId: string | null; failed: { error?: string }[] }> {
  const { data } = await api.post('/api/family/quests/create', body);
  const questId: string | null = data?.quest_id || data?.quest?.id || null;
  let failed: { error?: string }[] = [];
  if (questId && childIds.length > 0) {
    const res = await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: childIds });
    failed = res.data?.failed || [];
  }
  return { questId, failed };
}
