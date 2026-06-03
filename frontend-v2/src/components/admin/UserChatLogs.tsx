/**
 * UserChatLogs - admin view of a user's AI tutor conversations.
 * Lists conversations (GET /api/admin/users/:id/conversations); tapping one
 * loads its messages (GET /api/admin/conversations/:id). Read-only.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, UIText, Card, Skeleton, Badge, BadgeText,
} from '@/src/components/ui';
import type { AdminUser } from '@/src/hooks/useAdmin';

interface Conversation {
  id: string;
  title?: string;
  conversation_mode?: string;
  message_count?: number;
  last_message_at?: string | null;
  created_at?: string;
  quests?: { title?: string } | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

function formatWhen(d?: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function UserChatLogs({ user }: { user: AdminUser }) {
  const c = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/admin/users/${user.id}/conversations`, { params: { limit: 100 } });
      setConversations(data.conversations || []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const openConversation = async (conv: Conversation) => {
    setSelected(conv);
    setMessages([]);
    setMessagesLoading(true);
    try {
      const { data } = await api.get(`/api/admin/conversations/${conv.id}`);
      setMessages(data.data?.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  if (loading) {
    return <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</VStack>;
  }

  // ── Conversation detail ──
  if (selected) {
    return (
      <VStack space="sm">
        <Pressable onPress={() => setSelected(null)} className="flex-row items-center gap-1 self-start py-1">
          <Ionicons name="chevron-back" size={16} color={c.icon} />
          <UIText size="sm" className="text-optio-purple font-poppins-medium">All conversations</UIText>
        </Pressable>

        <VStack space="xs">
          <UIText size="sm" className="font-poppins-semibold" numberOfLines={2}>
            {selected.title || selected.quests?.title || 'Conversation'}
          </UIText>
          <HStack className="items-center gap-2">
            {!!selected.conversation_mode && (
              <Badge action="muted"><BadgeText className="text-typo-500 capitalize dark:text-dark-typo-500">{selected.conversation_mode}</BadgeText></Badge>
            )}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{formatWhen(selected.created_at)}</UIText>
          </HStack>
        </VStack>

        {messagesLoading ? (
          <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</VStack>
        ) : messages.length === 0 ? (
          <Card variant="filled" size="lg" className="items-center py-8">
            <Ionicons name="chatbubbles-outline" size={32} color={c.iconMuted} />
            <UIText size="sm" className="text-typo-400 mt-2 dark:text-dark-typo-400">No messages in this conversation</UIText>
          </Card>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator>
            <VStack space="sm" className="py-1">
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <View key={m.id} className={isUser ? 'items-end' : 'items-start'}>
                    <View
                      className={`max-w-[85%] px-3 py-2 rounded-2xl ${
                        isUser ? 'bg-optio-purple rounded-br-sm' : 'bg-surface-100 rounded-bl-sm dark:bg-dark-surface-200'
                      }`}
                    >
                      <UIText size="xs" className={`font-poppins-medium mb-0.5 ${isUser ? 'text-white/70' : 'text-typo-400 dark:text-dark-typo-400'}`}>
                        {isUser ? (user.first_name || 'User') : 'Buddy'}
                      </UIText>
                      <UIText size="sm" className={isUser ? 'text-white' : 'text-typo-700 dark:text-dark-typo-700'}>{m.content}</UIText>
                    </View>
                    {!!m.created_at && (
                      <UIText size="xs" className="text-typo-300 mt-0.5 px-1 dark:text-dark-typo-300">
                        {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </UIText>
                    )}
                  </View>
                );
              })}
            </VStack>
          </ScrollView>
        )}
      </VStack>
    );
  }

  // ── Conversation list ──
  if (conversations.length === 0) {
    return (
      <Card variant="filled" size="lg" className="items-center py-8">
        <Ionicons name="chatbubbles-outline" size={36} color={c.iconMuted} />
        <UIText size="sm" className="font-poppins-medium text-typo-500 mt-2 dark:text-dark-typo-500">No chat logs</UIText>
        <UIText size="xs" className="text-typo-400 mt-1 dark:text-dark-typo-400">This user has no AI conversations yet.</UIText>
      </Card>
    );
  }

  return (
    <VStack space="xs">
      {conversations.map((conv) => (
        <Pressable key={conv.id} onPress={() => openConversation(conv)}>
          <Card variant="outline" size="sm">
            <HStack className="items-center gap-3">
              <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#6D469B" />
              </View>
              <VStack className="flex-1 min-w-0" space="xs">
                <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                  {conv.title || conv.quests?.title || 'Conversation'}
                </UIText>
                <HStack className="items-center gap-2">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{conv.message_count ?? 0} messages</UIText>
                  <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">·</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{formatWhen(conv.last_message_at || conv.created_at)}</UIText>
                </HStack>
              </VStack>
              <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
            </HStack>
          </Card>
        </Pressable>
      ))}
    </VStack>
  );
}
