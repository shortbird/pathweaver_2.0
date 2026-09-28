/**
 * The student's class due dates, for the dashboard's Upcoming card
 * (ticket 26c91e25).
 *
 * GET /api/student/agenda -> { success, agenda: [...] }. Each row is a class
 * quest (kind 'quest') or one task inside it (kind 'task') with a due date.
 * The backend drops a quest row once the quest is complete and a task row
 * once the task is complete, so everything here is still owed.
 *
 * Every field the app reads off a row is read in toAgendaItem and nowhere
 * else, so a rename on the wire is a one-line change.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { parseDueDate } from '../utils/dueDate';
import { scopedTo } from './useDashboard';

export interface AgendaItem {
  key: string;
  kind: 'quest' | 'task';
  questId: string;
  questTitle: string;
  taskId: string | null;
  taskTitle: string | null;
  className: string | null;
  dueDate: string;
}

/** One wire row -> AgendaItem, or null when it is unusable (no quest, no date). */
export function toAgendaItem(raw: any): AgendaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const questId = raw.quest_id;
  const dueDate = raw.due_date;
  if (!questId || !parseDueDate(dueDate)) return null;
  const kind: 'quest' | 'task' = raw.kind === 'task' ? 'task' : 'quest';
  const taskId = kind === 'task' ? raw.task_id || null : null;
  return {
    key: `${raw.class_id || ''}:${questId}:${taskId || 'quest'}`,
    kind,
    questId,
    // `title` is the quest title on the pre-26c91e25 agenda shape.
    questTitle: raw.quest_title || raw.title || 'Quest',
    taskId,
    taskTitle: kind === 'task' ? raw.task_title || null : null,
    className: raw.class_name || null,
    dueDate,
  };
}

/**
 * Upcoming first (soonest first), then past-due work at the BOTTOM, oldest
 * first. Owner decision: past-due work stays on the list, below what is
 * coming, until it is done.
 */
export function orderAgenda(items: AgendaItem[], now: Date = new Date()): {
  upcoming: AgendaItem[];
  pastDue: AgendaItem[];
} {
  const t = (i: AgendaItem) => parseDueDate(i.dueDate)!.getTime();
  const sorted = [...items].sort((a, b) => t(a) - t(b));
  const cut = now.getTime();
  return {
    upcoming: sorted.filter((i) => t(i) >= cut),
    pastDue: sorted.filter((i) => t(i) < cut),
  };
}

/** @param studentId Family scope: the child's agenda (the route is
 *  @student_scope'd). Silent on every failure: the card simply does not show. */
export function useStudentAgenda(studentId?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [items, setItems] = useState<AgendaItem[]>([]);

  const fetchAgenda = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await api.get('/api/student/agenda', {
        params: studentId ? { student_id: studentId } : undefined,
      });
      if (studentId && !scopedTo(data, studentId)) {
        setItems([]);
        return;
      }
      const rows: unknown[] = Array.isArray(data?.agenda) ? data.agenda : [];
      setItems(rows.map(toAgendaItem).filter((i): i is AgendaItem => i !== null));
    } catch {
      setItems([]);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

  return { items, refetch: fetchAgenda };
}
