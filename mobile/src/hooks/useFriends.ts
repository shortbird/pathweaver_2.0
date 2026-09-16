/**
 * Friends, the student's side (/api/connections).
 *
 * Until 2026-09-16 the app had no student-facing surface for peer
 * connections at all: the web had a code-only page, and a kid on the phone
 * had nothing. The rules live on the server (peer_connection_service and
 * peer_policy_service): a parent turns Friends on per child and picks the
 * boundaries; the student connects inside them. This hook reads the state,
 * lists the friends and the requests, and sends the writes. It decides
 * nothing.
 *
 * Every read here accepts a `studentId`: with it the request is made ABOUT
 * that student through student scope, which is how a parent works a
 * dependent's friends from the Family tab. Without it the caller is the
 * student.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { extractApiError } from '../services/apiError';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export type EligibilityState = 'eligible' | 'needs_dob' | 'friends_off' | 'module_off';

export interface FriendPolicySummary {
  enabled: boolean;
  approval_mode: 'auto' | 'ask_first';
  request_sources: string[];
  friends_can: string[];
  origin?: string;
}

export interface Eligibility {
  state: EligibilityState;
  reason: string | null;
  who_can_enable: 'parent' | 'org_admin' | 'self' | 'nobody' | null;
  policy: FriendPolicySummary | null;
}

export interface PeerProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ConnectionItem {
  id: string;
  status: string;
  peer: PeerProfile;
  source?: string | null;
  created_at: string;
  activated_at?: string | null;
  /** Active rows only: both families allow chat (phase 3). The send path
   *  re-checks; this only decides whether a Message button shows. */
  can_message?: boolean;
}

export interface Connections {
  active: ConnectionItem[];
  incoming: ConnectionItem[];
  outgoing: ConnectionItem[];
  awaiting_approval: ConnectionItem[];
}

export type SuggestionState = 'none' | 'outgoing' | 'incoming' | 'awaiting_approval' | 'active';

export interface Suggestion {
  peer: PeerProfile;
  class_names: string[];
  state: SuggestionState;
  connection_id: string | null;
}

export interface Suggestions {
  classmates: Suggestion[];
  school: Suggestion[];
  school_pool: boolean;
}

const EMPTY: Connections = { active: [], incoming: [], outgoing: [], awaiting_approval: [] };

/** The query/body param student scope reads. */
function scoped(studentId?: string | null): Record<string, string> {
  return studentId ? { student_id: studentId } : {};
}

/** The body of a success_response envelope ({data: {data}}), or a bare body. */
function unwrap<T>(res: { data?: { data?: unknown } | unknown }): T {
  const body = res?.data as { data?: unknown } | undefined;
  return ((body && typeof body === 'object' && 'data' in body ? body.data : body) ?? {}) as T;
}

export function useFriends(studentId?: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [connections, setConnections] = useState<Connections>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const [elig, conns] = await Promise.all([
        api.get('/api/connections/eligibility', { params: scoped(studentId) }),
        api.get('/api/connections', { params: scoped(studentId) }),
      ]);
      setEligibility(unwrap<Eligibility>(elig));
      const d = unwrap<Partial<Connections>>(conns);
      setConnections({
        active: d.active || [], incoming: d.incoming || [],
        outgoing: d.outgoing || [], awaiting_approval: d.awaiting_approval || [],
      });
      setError(null);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Could not load your friends.').message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, studentId]);

  useEffect(() => { refetch(); }, [refetch]);
  useRefetchOnForeground(refetch);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  /** The receiving student says yes or no. */
  const respond = useCallback((connectionId: string, accept: boolean) =>
    run(() => api.post(`/api/connections/${connectionId}/respond`, { accept, ...scoped(studentId) })),
  [run, studentId]);

  /** End a friendship (either student, or a parent of either). */
  const revoke = useCallback((connectionId: string) =>
    run(() => api.post(`/api/connections/${connectionId}/revoke`, { ...scoped(studentId) })),
  [run, studentId]);

  /** Record a self-attested date of birth, once. Never delegated. */
  const submitDob = useCallback(async (dateOfBirth: string) => {
    setBusy(true);
    try {
      const res = await api.post('/api/connections/age-check', { date_of_birth: dateOfBirth });
      setEligibility(unwrap<Eligibility>(res));
    } finally {
      setBusy(false);
    }
  }, []);

  return { eligibility, connections, loading, busy, error, refetch, respond, revoke, submitDob };
}

/** Mint a fresh share code (retires the previous one). */
export async function issueCode(studentId?: string | null): Promise<{ code: string; expires_at: string }> {
  const res = await api.post('/api/connections/code', { ...scoped(studentId) });
  return unwrap(res);
}

/** Send a request: by another student's code, or by naming a classmate. */
export async function requestFriend(args: {
  code?: string;
  peerId?: string;
  source?: 'classmates' | 'school' | 'link' | 'parent';
  studentId?: string | null;
}): Promise<{ id: string; status: string }> {
  const body: Record<string, string> = { ...scoped(args.studentId) };
  if (args.code) body.code = args.code.trim().toUpperCase();
  if (args.peerId) body.peer_id = args.peerId;
  if (args.source) body.source = args.source;
  const res = await api.post('/api/connections/request', body);
  return unwrap(res);
}

/** The invite link a code travels in. Same host the web bridge page lives on. */
export function inviteLinkFor(code: string): string {
  return `https://app.optioeducation.com/f/${code}`;
}

export function useFriendSuggestions(studentId?: string | null, enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<Suggestions>({ classmates: [], school: [], school_pool: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isAuthenticated || !enabled) { setLoading(false); return; }
    try {
      const res = await api.get('/api/connections/suggestions', { params: scoped(studentId) });
      const d = unwrap<Partial<Suggestions>>(res);
      setData({ classmates: d.classmates || [], school: d.school || [], school_pool: !!d.school_pool });
      setError(null);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Could not load classmates.').message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enabled, studentId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// Reactions and peer comments (feed cards)
// ---------------------------------------------------------------------------

export type ReactionKey = 'proud' | 'inspired' | 'curious' | 'keep_going' | 'thanks';

/** The palette, in display order. Mirrors REACTIONS in
 *  backend/services/peer_connection_service.py; the server refuses any
 *  other key, so a drift here shows up as a 400, not a silent nothing. */
export const REACTIONS: { key: ReactionKey; label: string; emoji: string }[] = [
  { key: 'proud', label: 'Proud of you', emoji: '🌟' },
  { key: 'inspired', label: 'This inspires me', emoji: '💡' },
  { key: 'curious', label: 'Tell me more', emoji: '🤔' },
  { key: 'keep_going', label: 'Keep going', emoji: '💪' },
  { key: 'thanks', label: 'Thanks for sharing', emoji: '🙏' },
];

export interface ReactionSummary {
  by_key: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey | null;
}

export interface ReactionTarget {
  studentId: string;
  completionId?: string | null;
  learningEventId?: string | null;
}

export async function setReaction(target: ReactionTarget, reaction: ReactionKey): Promise<void> {
  await api.post('/api/connections/reactions', {
    student_id: target.studentId,
    reaction,
    task_completion_id: target.completionId ?? null,
    learning_event_id: target.learningEventId ?? null,
  });
}

export async function clearReaction(target: ReactionTarget): Promise<void> {
  const params: Record<string, string> = {};
  if (target.completionId) params.task_completion_id = target.completionId;
  else if (target.learningEventId) params.learning_event_id = target.learningEventId;
  await api.delete('/api/connections/reactions', { params });
}

export interface PeerComment {
  id: string;
  comment_text: string;
  created_at: string;
  author: PeerProfile;
  author_id: string;
}

export async function getPeerComments(target: ReactionTarget): Promise<PeerComment[]> {
  const params: Record<string, string> = { student_id: target.studentId };
  if (target.completionId) params.task_completion_id = target.completionId;
  else if (target.learningEventId) params.learning_event_id = target.learningEventId;
  const res = await api.get('/api/connections/comments', { params });
  return unwrap<{ comments?: PeerComment[] }>(res).comments || [];
}

export async function postPeerComment(target: ReactionTarget, text: string): Promise<PeerComment> {
  const res = await api.post('/api/connections/comments', {
    student_id: target.studentId,
    text,
    task_completion_id: target.completionId ?? null,
    learning_event_id: target.learningEventId ?? null,
  });
  return unwrap(res);
}

export async function deletePeerComment(commentId: string): Promise<void> {
  await api.delete(`/api/connections/comments/${commentId}`);
}

/** A parent takes a comment off their child's work. Hidden, not deleted: the
 *  parent's activity view keeps the record. */
export async function hidePeerComment(commentId: string): Promise<void> {
  await api.post(`/api/connections/comments/${commentId}/hide`, {});
}

export type ReportTarget = 'peer_comment' | 'message' | 'group_message' | 'learning_event' | 'task_completion' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'self_harm' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Bullying or harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'other', label: 'Something else' },
];

/** File a report. The moderation queue can take a peer comment or a
 *  message down; other targets are reviewed by hand. */
export async function reportContent(targetType: ReportTarget, targetId: string, reason: ReportReason): Promise<void> {
  await api.post('/api/moderation/report', { target_type: targetType, target_id: targetId, reason });
}

/** A student whose family has Friends off asks the parent to turn it on.
 *  Every guardian gets a notification and an email. Three a day. */
export async function askParent(): Promise<{ asked: number }> {
  const res = await api.post('/api/connections/ask-parent', {});
  return unwrap(res);
}

// -- a friend's page, and Collaborate (2026-09-16) ---------------------------

export interface FriendQuest {
  id: string;
  title: string;
  image_url: string | null;
  quest_type?: string | null;
  /** Both students are on it. Shared quests come first. */
  shared: boolean;
}

export interface FriendPage {
  peer: PeerProfile;
  connection_id: string | null;
  friends_since: string | null;
  can_message: boolean;
  shared_classes: string[];
  /** The friend's public quests in progress, plus any the viewer shares. */
  quests: FriendQuest[];
  /** The viewer's own quests in progress, for the Collaborate picker. */
  my_quests: { id: string; title: string; shared: boolean }[];
}

/** A friend's page. Refused (rejects) for anyone who is not an active friend. */
export async function getFriendPage(peerId: string, studentId?: string | null): Promise<FriendPage> {
  const res = await api.get(`/api/connections/friends/${peerId}`, { params: scoped(studentId) });
  return unwrap(res);
}

/** Invite a friend to do a quest alongside you: one notification with the
 *  quest one tap away. The sender has to be on the quest. */
export async function collaborate(peerId: string, questId: string, studentId?: string | null)
  : Promise<{ invited: boolean; already_on_quest: boolean }> {
  const res = await api.post(`/api/connections/friends/${peerId}/collaborate`, { quest_id: questId, ...scoped(studentId) });
  return unwrap(res);
}

export interface FriendOnQuest extends PeerProfile {
  can_message: boolean;
}

/** Which of the student's friends are on this quest right now. */
export async function friendsOnQuest(questId: string, studentId?: string | null): Promise<FriendOnQuest[]> {
  const res = await api.get(`/api/connections/quests/${questId}/friends`, { params: scoped(studentId) });
  return unwrap<{ friends?: FriendOnQuest[] }>(res).friends || [];
}

/** Where a friend chat lives: the Messages tab, opened on that person. */
export function messagesRouteFor(userId: string): string {
  return `/(app)/(tabs)/messages?user=${encodeURIComponent(userId)}`;
}
