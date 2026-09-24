/**
 * The To do list: the tasks a school assigned to this person, for the school
 * hub's To do tab.
 *
 * One endpoint serves both readers. A guardian asks for ?audience=family and
 * names the school on screen (they may have children at more than one); a
 * student asks for ?audience=student and the server uses their own org. The
 * audience is never inferred server-side from the caller -- one person can be
 * a guardian in one place and staff in another, and a teacher's onboarding
 * showing up in a family's list is a bug this codebase has shipped before.
 *
 * Bespoke useState, like the other school hooks (react-query was dropped from
 * this app on 2026-09-03). Every write refetches the list: the server derives
 * the task's status and counts from its steps, and computing them here would
 * be a second copy of that rule to drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api, { uploadTaskDocument, type PickedFile } from '@/src/services/api';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export type TaskStatus = 'todo' | 'in_progress' | 'waiting_on_admin' | 'done' | 'expired';
export type StepStatus = 'pending' | 'complete' | 'approved' | 'rejected';
export type TaskAudience = 'family' | 'student';

export interface TaskDocument {
  path: string;
  filename?: string | null;
}

export interface TaskStep {
  key: string;
  title: string;
  description?: string | null;
  required?: boolean;
  needs_document?: boolean;
  needs_signature?: boolean;
  needs_approval?: boolean;
  link?: string | null;
  due_date?: string | null;
  status: StepStatus;
  documents?: TaskDocument[] | null;
  /** Older rows carry one file here instead of `documents`. */
  document_url?: string | null;
  signature?: { name: string; signed_at: string } | null;
  admin_notes?: string | null;
  /** Documents the office shared for this step to be signed against. Absent
   *  means the step never had one; an EMPTY array means it is meant to have
   *  one and it has not been attached yet, so there is nothing to sign. */
  sign_docs?: { id: string; title: string }[];
}

export interface Task {
  id: string;
  type: 'task' | 'signature';
  title: string;
  description?: string | null;
  audience?: string;
  status: TaskStatus;
  due_date?: string | null;
  overdue?: boolean;
  priority?: null | 'low' | 'normal' | 'high' | 'urgent';
  action?: 'do' | 'reply';
  thread_link?: string | null;
  occurrence_date?: string | null;
  assigned_by_name?: string | null;
  created_at?: string;
  done_count?: number;
  total_count?: number;
  comment_count?: number;
  items: TaskStep[];
}

export interface TaskComment {
  id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface TaskCounts {
  todo?: number;
  in_progress?: number;
  waiting_on_admin?: number;
  done?: number;
  expired?: number;
  overdue?: number;
  open?: number;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting_on_admin: 'With the office',
  done: 'Done',
  expired: 'Expired',
};

/** The server's error text when it sent one: a 4xx here is usually a rule
 *  the person can act on ("sign with your full name"), so it is shown as is. */
export function taskErrorText(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: unknown } }; message?: unknown };
  const server = err?.response?.data?.error;
  if (typeof server === 'string' && server) return server;
  return fallback;
}

/** Throws the server's error when a 2xx body still says success:false. */
function ensureOk(data: any, fallback: string) {
  if (data && data.success === false) {
    const err = new Error(data.error || fallback) as Error & { response?: { data?: unknown } };
    err.response = { data };
    throw err;
  }
}

export function useMyTasks({ organizationId, audience, enabled = true }: {
  organizationId?: string | null;
  audience: TaskAudience;
  enabled?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<TaskCounts>({});
  const [signatureStatement, setSignatureStatement] = useState<string | null>(null);
  const [includeDone, setIncludeDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A toggle flipped mid-request must not let the older answer land last.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const requestId = ++requestRef.current;
    try {
      const params: Record<string, string> = { audience };
      // A student's own org is the server's default; a guardian names the
      // school on screen.
      if (audience === 'family' && organizationId) params.organization_id = organizationId;
      if (includeDone) params.include_done = '1';
      const { data } = await api.get('/api/sis/tasks/mine', { params });
      if (requestId !== requestRef.current) return;
      if (data?.success) {
        setTasks(data.tasks || []);
        setCounts(data.counts || {});
        setSignatureStatement(data.signature_statement || null);
        setError(null);
      } else {
        setError(data?.error || 'Could not load your tasks');
      }
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError(taskErrorText(e, 'Could not load your tasks'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [enabled, audience, organizationId, includeDone]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnForeground(load);

  const patchItem = useCallback(async (taskId: string, key: string, body: Record<string, unknown>) => {
    const { data } = await api.patch(
      `/api/sis/tasks/${taskId}/items/${encodeURIComponent(key)}`, body,
    );
    ensureOk(data, 'Could not save that step');
    await load();
  }, [load]);

  const setStepDone = useCallback(
    (taskId: string, key: string, done: boolean) =>
      patchItem(taskId, key, { status: done ? 'complete' : 'pending' }),
    [patchItem],
  );

  const signStep = useCallback(
    (taskId: string, key: string, name: string) =>
      patchItem(taskId, key, { signature_name: name, signature_agreed: true }),
    [patchItem],
  );

  const uploadStepFile = useCallback(async (taskId: string, key: string, file: PickedFile) => {
    const up = await uploadTaskDocument(taskId, file);
    if (!up?.path) throw new Error('The upload did not return a file');
    await patchItem(taskId, key, {
      add_document: { path: up.path, filename: file.name }, status: 'complete',
    });
  }, [patchItem]);

  const removeStepFile = useCallback(
    (taskId: string, key: string, path: string) => patchItem(taskId, key, { remove_document: path }),
    [patchItem],
  );

  /** A signed link to a file this person uploaded. */
  const documentUrl = useCallback(async (taskId: string, path: string): Promise<string | null> => {
    const { data } = await api.get(`/api/sis/tasks/${taskId}/doc-url`, { params: { path } });
    return data?.url || null;
  }, []);

  /** A signed link to a document the office shared to be signed. */
  const signDocumentUrl = useCallback(async (taskId: string, docId: string): Promise<string | null> => {
    const { data } = await api.get(`/api/sis/tasks/${taskId}/sign-documents/${docId}/url`);
    return data?.url || null;
  }, []);

  const loadComments = useCallback(async (taskId: string): Promise<TaskComment[]> => {
    const { data } = await api.get(`/api/sis/tasks/${taskId}/comments`);
    return data?.comments || [];
  }, []);

  const addComment = useCallback(async (taskId: string, body: string): Promise<TaskComment | null> => {
    const { data } = await api.post(`/api/sis/tasks/${taskId}/comments`, { body });
    ensureOk(data, 'Could not send your comment');
    // The list carries each task's comment count.
    await load();
    return data?.comment || null;
  }, [load]);

  return {
    tasks, counts, signatureStatement,
    includeDone, setIncludeDone,
    loading, error, refresh: load,
    setStepDone, signStep, uploadStepFile, removeStepFile,
    documentUrl, signDocumentUrl,
    loadComments, addComment,
  };
}

export type MyTasks = ReturnType<typeof useMyTasks>;
