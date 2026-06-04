/**
 * ChatWindow - Direct message chat view.
 * Desktop: panel inside split layout.
 * Mobile: full-screen with back button, keyboard-aware input.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useConversationMessages,
  sendDirectMessage,
  markMessageRead,
  type Contact,
  type Message,
} from '@/src/hooks/useMessages';

interface Props {
  contact: Contact;
  conversationId: string;
  onBack?: () => void;
  /** Fired after this view marks messages read, so the parent can refresh the
   *  conversation list and clear its unread dot immediately (instead of waiting
   *  for the next 30s poll). */
  onRead?: () => void;
}

function getDisplayName(c: Contact) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.display_name || 'Unknown';
}

function formatTime(ts: string) {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function ChatWindow({ contact, conversationId, onBack, onRead }: Props) {
  const c = useThemeColors();
  const { user } = useAuthStore();
  const { messages, loading, setMessages } = useConversationMessages(conversationId);
  // Held in a ref so the mark-read effect doesn't re-run when the parent passes
  // a fresh onRead identity each render.
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const isMobile = !!onBack;

  const name = getDisplayName(contact);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Mark unread messages as read. E4: on failure we just leave the message
  // marked-unread locally — the next poll cycle will re-attempt. No need to
  // retry here; a transient 5xx would otherwise spam Sentry on every render.
  const readAttemptsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id || !messages.length) return;
    const toMark = messages.filter(
      (m) => m.recipient_id === user.id && !m.read_at && !readAttemptsRef.current.has(m.id),
    );
    if (!toMark.length) return;
    toMark.forEach((m) => readAttemptsRef.current.add(m.id));
    Promise.allSettled(toMark.map((m) => markMessageRead(m.id))).then((results) => {
      // Roll back failures so the next poll retries them.
      results.forEach((r, i) => {
        if (r.status === 'rejected') readAttemptsRef.current.delete(toMark[i].id);
      });
      // Clear the conversation-list unread dot right away instead of waiting for
      // the next poll (bug: "unread icon stays after I've viewed the chat").
      if (results.some((r) => r.status === 'fulfilled')) onReadRef.current?.();
    });
  }, [messages, user?.id]);

  // Focus input when contact changes (desktop only)
  useEffect(() => {
    if (!isMobile) inputRef.current?.focus();
  }, [contact.id, isMobile]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    // Optimistic update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_id: user?.id || '',
      recipient_id: contact.id,
      message_content: content,
      created_at: new Date().toISOString(),
      read_at: null,
      isOptimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');

    try {
      setSending(true);
      const sent = await sendDirectMessage(contact.id, content);
      // Swap the optimistic bubble for the saved message IN PLACE. We used to
      // refetch the whole list here, which briefly dropped the just-sent message
      // (the server hadn't indexed it yet) so it flickered: appear -> disappear
      // -> reappear on the next poll. Keeping it in place avoids the flicker; the
      // 15s poll reconciles read receipts.
      setMessages((prev) => prev.map((m) =>
        m.id === optimisticMsg.id
          ? { ...optimisticMsg, ...(sent && (sent as any).id ? (sent as Message) : {}), id: (sent && (sent as any).id) ? (sent as any).id : optimisticMsg.id, isOptimistic: false }
          : m,
      ));
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
      e.preventDefault?.();
      handleSend();
    }
  };

  const header = (
    <View
      className="flex-row items-center px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100"
      style={isMobile ? { paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8 } : undefined}
    >
      {isMobile && (
        <Pressable onPress={onBack} className="mr-2 p-1" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#6D469B" />
        </Pressable>
      )}
      <Avatar size="md">
        {contact.avatar_url ? (
          <AvatarImage source={{ uri: contact.avatar_url }} />
        ) : (
          <AvatarFallbackText>{name.charAt(0).toUpperCase()}</AvatarFallbackText>
        )}
      </Avatar>
      <View className="ml-3 flex-1">
        <Heading size="sm">{name}</Heading>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 capitalize">{contact.relationship || contact.role}</UIText>
      </View>
    </View>
  );

  const messageList = (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-surface-50 dark:bg-dark-surface-50"
      contentContainerStyle={{ padding: 16, gap: 8 }}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {loading ? (
        <View className="flex-1 items-center justify-center py-20">
          <View className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
        </View>
      ) : messages.length === 0 ? (
        <View className="items-center py-20">
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3">
            No messages yet. Start the conversation!
          </UIText>
        </View>
      ) : (
        messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          return (
            <View
              key={msg.id}
              className={`flex-row ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <View
                style={{
                  maxWidth: '75%',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 18,
                  ...(isMine
                    ? {
                        backgroundColor: '#6D469B',
                        borderBottomRightRadius: 4,
                      }
                    : {
                        backgroundColor: c.card,
                        borderBottomLeftRadius: 4,
                        borderWidth: 1,
                        borderColor: c.border,
                      }),
                  opacity: msg.isOptimistic ? 0.7 : 1,
                }}
              >
                <UIText
                  size="sm"
                  style={{ color: isMine ? '#fff' : c.text, lineHeight: 20 }}
                >
                  {msg.message_content}
                </UIText>
                <View className="flex-row items-center justify-end mt-1 gap-2">
                  <UIText
                    size="xs"
                    style={{ color: isMine ? 'rgba(255,255,255,0.6)' : c.textFaint, fontSize: 10 }}
                  >
                    {msg.isOptimistic ? 'Sending...' : formatTime(msg.created_at)}
                  </UIText>
                  {isMine && !msg.isOptimistic && (
                    <Ionicons
                      name={msg.read_at ? 'checkmark-done' : 'checkmark'}
                      size={12}
                      color={msg.read_at ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)'}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  const inputBar = (
    <View
      className="border-t border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100 px-3"
      style={{ paddingTop: 6, paddingBottom: isMobile ? Math.max(insets.bottom, 6) : 8 }}
    >
      <View className="flex-row items-end gap-2">
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onKeyPress={handleKeyPress}
          placeholder={`Message ${name}...`}
          placeholderTextColor={c.textFaint}
          multiline
          maxLength={2000}
          className="flex-1 bg-surface-100 dark:bg-dark-surface-200 rounded-2xl px-4 py-2 font-poppins text-sm text-typo dark:text-dark-typo"
          style={{
            outline: 'none',
            minHeight: 36,
            maxHeight: 100,
          } as any}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sending}
          style={{
            backgroundColor: input.trim() && !sending ? '#6D469B' : c.border,
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  // Mobile: wrap in KeyboardAvoidingView
  if (isMobile) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-white dark:bg-dark-surface-100"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {header}
        {messageList}
        {inputBar}
      </KeyboardAvoidingView>
    );
  }

  // Desktop
  return (
    <View className="flex-1 bg-white dark:bg-dark-surface-100">
      {header}
      {messageList}
      {inputBar}
    </View>
  );
}
