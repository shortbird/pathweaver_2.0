/**
 * useMessagingRealtime - instant message delivery via Supabase Realtime
 * Broadcast. The backend fires fire-and-forget broadcasts on the topics
 * `dm:{conversation_id}` / `group:{group_id}` whenever a message is sent,
 * reacted to, edited, deleted, pinned, or the group settings change.
 *
 * This hook subscribes with the existing supabase client (the one otherwise
 * used only for OAuth) and hands each event to the caller, which applies it to
 * local message state. The existing 15s polling in useMessages stays as the
 * fallback for missed broadcasts, so this is purely a latency win — no
 * correctness depends on it.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Message, MessageReaction } from './useMessages';

export interface MessagingRealtimeHandlers {
  /** Full enriched message object (same shape as the GET endpoints return). */
  onMessage?: (message: Message) => void;
  onReactions?: (payload: { message_id: string; reactions: MessageReaction[] }) => void;
  onEdited?: (payload: { message_id: string; content: string; edited_at: string }) => void;
  onDeleted?: (payload: { message_id: string }) => void;
  /** Group only: pin changed (null = unpinned). */
  onPinned?: (payload: { pinned_message_id: string | null }) => void;
  /** Group only: settings changed. */
  onSettings?: (payload: { announcement_only: boolean }) => void;
}

/**
 * Subscribe to a messaging broadcast topic (`dm:{conversationId}` or
 * `group:{groupId}`). Pass null to skip (e.g. no conversation open).
 * Handlers are held in a ref, so callers may pass fresh closures every render
 * without re-subscribing.
 */
export function useMessagingRealtime(
  topic: string | null,
  handlers: MessagingRealtimeHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!topic) return;

    const channel = supabase.channel(topic);
    channel
      .on('broadcast', { event: 'message' }, ({ payload }: { payload: any }) => {
        if (payload) handlersRef.current.onMessage?.(payload as Message);
      })
      .on('broadcast', { event: 'reactions' }, ({ payload }: { payload: any }) => {
        if (payload?.message_id) handlersRef.current.onReactions?.(payload);
      })
      .on('broadcast', { event: 'edited' }, ({ payload }: { payload: any }) => {
        if (payload?.message_id) handlersRef.current.onEdited?.(payload);
      })
      .on('broadcast', { event: 'deleted' }, ({ payload }: { payload: any }) => {
        if (payload?.message_id) handlersRef.current.onDeleted?.(payload);
      })
      .on('broadcast', { event: 'pinned' }, ({ payload }: { payload: any }) => {
        if (payload) handlersRef.current.onPinned?.(payload);
      })
      .on('broadcast', { event: 'settings' }, ({ payload }: { payload: any }) => {
        if (payload) handlersRef.current.onSettings?.(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic]);
}

// ── State-patching helpers shared by ChatWindow + GroupChatWindow ──

/**
 * Append a broadcast message to local state, deduping against messages we
 * already have (poll races, our own optimistic bubble). If the incoming
 * message is ours and an optimistic bubble with the same content is pending,
 * the broadcast replaces it (the broadcast can beat the send response).
 */
export function appendRealtimeMessage(prev: Message[], incoming: Message): Message[] {
  if (!incoming?.id) return prev;
  if (prev.some((m) => m.id === incoming.id)) return prev;
  const optimisticIdx = prev.findIndex(
    (m) => m.isOptimistic
      && m.sender_id === incoming.sender_id
      && m.message_content === incoming.message_content,
  );
  if (optimisticIdx >= 0) {
    const next = [...prev];
    next[optimisticIdx] = { ...incoming, isOptimistic: false };
    return next;
  }
  return [...prev, incoming];
}

export function patchMessageReactions(
  prev: Message[],
  messageId: string,
  reactions: MessageReaction[],
): Message[] {
  return prev.map((m) => (m.id === messageId ? { ...m, reactions } : m));
}

export function patchMessageEdited(
  prev: Message[],
  payload: { message_id: string; content: string; edited_at: string },
): Message[] {
  return prev.map((m) => (m.id === payload.message_id
    ? { ...m, message_content: payload.content, edited_at: payload.edited_at }
    : m));
}

export function patchMessageDeleted(prev: Message[], messageId: string): Message[] {
  return prev.map((m) => (m.id === messageId
    ? { ...m, is_deleted: true, message_content: '', attachments: [] }
    : m));
}
