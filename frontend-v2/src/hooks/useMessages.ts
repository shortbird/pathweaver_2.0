/**
 * Messaging hooks - conversations, messages, contacts, groups.
 * Follows the same useState/useEffect pattern as useBounties.ts.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { messageAPI, groupAPI, type MessageAttachment, type SendMessageExtras } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useAppActive } from './useAppActive';
import { captureException } from '../services/sentry';

// ── Types ──

export interface Contact {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: string;
  relationship: string;
  // True for the always-present "Optio Support" alias (routes to superadmin).
  is_support?: boolean;
}

export interface Child {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  other_user?: Contact;
  group?: Group;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  /** True when the current viewer reacted with this emoji. */
  reacted: boolean;
}

export interface ReplyPreview {
  id: string;
  sender_name: string;
  content: string;
}

export type { MessageAttachment };

export interface Message {
  id: string;
  sender_id: string;
  recipient_id?: string;
  group_id?: string;
  message_content: string;
  created_at: string;
  read_at: string | null;
  sender?: {
    id: string;
    display_name: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  // Messaging overhaul fields (present on enriched GET/send/broadcast payloads).
  reactions?: MessageReaction[];
  reply_to?: ReplyPreview | null;
  reply_to_message_id?: string | null;
  attachments?: MessageAttachment[];
  edited_at?: string | null;
  is_deleted?: boolean;
  /** Set by the backend only for superadmin viewers: the message is deleted but
   *  its original content/attachments are retained for moderation, and the
   *  client shows a "Deleted" indicator instead of the tombstone. */
  deleted_visible_to_admin?: boolean;
  isOptimistic?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  member_count: number;
  /** When true, only group admins may post (others see a notice). */
  announcement_only?: boolean;
  pinned_message_id?: string | null;
  /** Hydrated pinned message for the pin banner (GET /api/groups/:id only). */
  pinned_message?: (Partial<Message> & { id: string }) | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  // Matches GET /api/groups/:id — each member row carries its `role` in the
  // group ('admin' | 'member') plus a hydrated `user` object.
  members?: Array<{
    id: string;
    user_id: string;
    role: string;
    user?: {
      id: string;
      display_name?: string;
      first_name?: string;
      last_name?: string;
      avatar_url?: string | null;
      role?: string;
    };
    // Some payloads flatten the user fields onto the member row.
    display_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  }>;
}

// ── Hooks ──

/** Fetch all DM conversations for the current user */
export function useConversations() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appActive = useAppActive();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // `silent` skips the loading flag so background polls don't flip the whole
  // list to a spinner every 30s (bug: "Messages tab flashes and reloads").
  const fetch = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    try {
      if (!silent) setLoading(true);
      const { data } = await messageAPI.conversations();
      const d = data.data || data;
      setConversations(d.conversations || []);
    } catch {
      // non-critical
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  // P1: poll every 30s ONLY while app is foregrounded (silent — no spinner).
  useEffect(() => {
    if (!isAuthenticated || !appActive) return;
    const interval = setInterval(() => fetch(true), 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, appActive, fetch]);

  return { conversations, loading, refetch: () => fetch(true) };
}

/** Fetch messages for a specific conversation */
export function useConversationMessages(conversationId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appActive = useAppActive();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (silent = false) => {
    if (!isAuthenticated || !conversationId) { setLoading(false); return; }
    try {
      if (!silent) setLoading(true);
      const { data } = await messageAPI.messages(conversationId);
      const d = data.data || data;
      setMessages(d.messages || []);
    } catch {
      // non-critical
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated, conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  // P1: poll every 15s ONLY while app is foregrounded (silent — no spinner flash).
  useEffect(() => {
    if (!isAuthenticated || !conversationId || !appActive) return;
    const interval = setInterval(() => fetch(true), 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, conversationId, appActive, fetch]);

  return { messages, loading, refetch: () => fetch(true), setMessages };
}

/** Fetch messaging contacts.
 *  `enabled` defers the request — the conversation list no longer renders the
 *  full directory inline, so contacts are only needed when the user opens the
 *  compose sheet. Cuts a Messages-screen cold-start request that previously
 *  fanned out into one row per contact. */
export function useContacts(enabled: boolean = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(enabled);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !enabled) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await messageAPI.contacts();
      const d = data.data || data;
      setContacts(d.contacts || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enabled]);

  useEffect(() => { fetch(); }, [fetch]);

  return { contacts, loading, refetch: fetch };
}

/** Fetch unread message count */
export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appActive = useAppActive();
  const [count, setCount] = useState(0);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await messageAPI.unreadCount();
      const d = data.data || data;
      setCount(d.unread_count || 0);
    } catch {
      // non-critical
    }
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!isAuthenticated || !appActive) return;
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, appActive, fetch]);

  return { count, refetch: fetch };
}

/** Send a DM (imperative, not a hook) */
export async function sendDirectMessage(
  targetUserId: string,
  content: string,
  extras: SendMessageExtras = {},
) {
  const { data } = await messageAPI.send(targetUserId, content, extras);
  return data.data || data;
}

/** Mark a message as read */
export async function markMessageRead(messageId: string) {
  const { data } = await messageAPI.markRead(messageId);
  return data.data || data;
}

// ── Messaging overhaul: reactions, edit, delete (DM + group variants) ──

/** Toggle an emoji reaction. Returns { added, reactions } (fresh aggregate). */
export async function toggleDmReaction(messageId: string, emoji: string) {
  const { data } = await messageAPI.toggleReaction(messageId, emoji);
  return data.data || data;
}

export async function toggleGroupReaction(groupId: string, messageId: string, emoji: string) {
  const { data } = await groupAPI.toggleReaction(groupId, messageId, emoji);
  return data.data || data;
}

export async function editDirectMessage(messageId: string, content: string) {
  const { data } = await messageAPI.editMessage(messageId, content);
  return data.data || data;
}

export async function editGroupMessage(groupId: string, messageId: string, content: string) {
  const { data } = await groupAPI.editMessage(groupId, messageId, content);
  return data.data || data;
}

export async function deleteDirectMessage(messageId: string) {
  const { data } = await messageAPI.deleteMessage(messageId);
  return data.data || data;
}

export async function deleteGroupMessage(groupId: string, messageId: string) {
  const { data } = await groupAPI.deleteMessage(groupId, messageId);
  return data.data || data;
}

/** Pin (or unpin with null) a group message. Group admins only. */
export async function pinGroupMessage(groupId: string, messageId: string | null) {
  const { data } = await groupAPI.pin(groupId, messageId);
  return data.data || data;
}

/** Toggle announcement-only mode (admins-only posting). Group admins only. */
export async function setGroupAnnouncementOnly(groupId: string, enabled: boolean) {
  const { data } = await groupAPI.updateSettings(groupId, { announcement_only: enabled });
  return data.data || data;
}

// ── Group hooks ──

/** Fetch all groups for the current user */
export function useGroups() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appActive = useAppActive();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    try {
      if (!silent) setLoading(true);
      const { data } = await groupAPI.list();
      const d = data.data || data;
      setGroups(d.groups || []);
    } catch {
      // non-critical
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!isAuthenticated || !appActive) return;
    const interval = setInterval(() => fetch(true), 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, appActive, fetch]);

  return { groups, loading, refetch: () => fetch(true) };
}

/** Fetch group details with member list */
export function useGroupDetail(groupId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !groupId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await groupAPI.get(groupId);
      const d = data.data || data;
      setGroup(d.group || d);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, groupId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { group, loading, refetch: fetch };
}

/** Fetch messages for a group */
export function useGroupMessages(groupId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appActive = useAppActive();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (silent = false) => {
    if (!isAuthenticated || !groupId) { setLoading(false); return; }
    try {
      if (!silent) setLoading(true);
      const { data } = await groupAPI.messages(groupId);
      const d = data.data || data;
      setMessages(d.messages || []);
    } catch {
      // non-critical
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated, groupId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!isAuthenticated || !groupId || !appActive) return;
    const interval = setInterval(() => fetch(true), 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, groupId, appActive, fetch]);

  return { messages, loading, refetch: () => fetch(true), setMessages };
}

/** Send a group message (imperative) */
export async function sendGroupMessage(
  groupId: string,
  content: string,
  extras: SendMessageExtras = {},
) {
  const { data } = await groupAPI.sendMessage(groupId, content, extras);
  return data.data || data;
}

/** Create a group (imperative) */
export async function createGroup(name: string, description?: string, memberIds?: string[]) {
  const { data } = await groupAPI.create({ name, description, member_ids: memberIds });
  return data.data || data;
}

/** Mark group messages as read */
export async function markGroupRead(groupId: string) {
  const { data } = await groupAPI.markRead(groupId);
  return data.data || data;
}

/** Delete a group (group admin or superadmin only) */
export async function deleteGroup(groupId: string) {
  const { data } = await groupAPI.delete(groupId);
  return data.data || data;
}

// ── Parent: read-only view of a child's message history ──

/** Fetch the children whose message history the current parent may view */
export function useChildren(enabled: boolean = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !enabled) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await messageAPI.children();
      const d = data.data || data;
      setChildren(d.children || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enabled]);

  useEffect(() => { fetch(); }, [fetch]);

  return { children, loading, refetch: fetch };
}

/** Fetch a child's conversations (read-only, parent view) */
export function useChildConversations(childId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !childId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await messageAPI.childConversations(childId);
      const d = data.data || data;
      setConversations(d.conversations || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, childId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { conversations, loading, refetch: fetch };
}

/** Fetch the messages in one of a child's conversations (read-only, parent view) */
export function useChildConversationMessages(
  childId: string | null,
  conversationId: string | null,
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !childId || !conversationId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await messageAPI.childConversationMessages(childId, conversationId);
      const d = data.data || data;
      setMessages(d.messages || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, childId, conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { messages, loading, refetch: fetch };
}
