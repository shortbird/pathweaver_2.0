/**
 * Messaging hooks - conversations, messages, contacts, groups.
 * Follows the same useState/useEffect pattern as useBounties.ts.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { messageAPI, groupAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';

// ── Types ──

export interface Contact {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: string;
  relationship: string;
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
  isOptimistic?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  member_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  members?: Array<{
    id: string;
    user_id: string;
    display_name: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    role_in_group: string;
  }>;
}

// ── Hooks ──

/** Fetch all DM conversations for the current user */
export function useConversations() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await messageAPI.conversations();
      const d = data.data || data;
      setConversations(d.conversations || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  // Poll every 30s
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetch]);

  return { conversations, loading, refetch: fetch };
}

/** Fetch messages for a specific conversation */
export function useConversationMessages(conversationId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !conversationId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await messageAPI.messages(conversationId);
      const d = data.data || data;
      setMessages(d.messages || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Poll every 15s
  useEffect(() => {
    if (!isAuthenticated || !conversationId) return;
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, conversationId, fetch]);

  return { messages, loading, refetch: fetch, setMessages };
}

/** Fetch messaging contacts */
export function useContacts() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  return { contacts, loading, refetch: fetch };
}

/** Fetch unread message count */
export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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
    if (!isAuthenticated) return;
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetch]);

  return { count, refetch: fetch };
}

/** Send a DM (imperative, not a hook) */
export async function sendDirectMessage(targetUserId: string, content: string) {
  const { data } = await messageAPI.send(targetUserId, content);
  return data.data || data;
}

/** Mark a message as read */
export async function markMessageRead(messageId: string) {
  const { data } = await messageAPI.markRead(messageId);
  return data.data || data;
}

// ── Group hooks ──

/** Fetch all groups for the current user */
export function useGroups() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const { data } = await groupAPI.list();
      const d = data.data || data;
      setGroups(d.groups || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetch]);

  return { groups, loading, refetch: fetch };
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!isAuthenticated || !groupId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await groupAPI.messages(groupId);
      const d = data.data || data;
      setMessages(d.messages || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, groupId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!isAuthenticated || !groupId) return;
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, groupId, fetch]);

  return { messages, loading, refetch: fetch, setMessages };
}

/** Send a group message (imperative) */
export async function sendGroupMessage(groupId: string, content: string) {
  const { data } = await groupAPI.sendMessage(groupId, content);
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
