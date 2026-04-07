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

export function ChatWindow({ contact, conversationId, onBack }: Props) {
  const { user } = useAuthStore();
  const { messages, loading, refetch, setMessages } = useConversationMessages(conversationId);
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

  // Mark unread messages as read
  useEffect(() => {
    if (!user?.id || !messages.length) return;
    messages.forEach((m) => {
      if (m.recipient_id === user.id && !m.read_at) {
        markMessageRead(m.id).catch(() => {});
      }
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
      await sendDirectMessage(contact.id, content);
      refetch();
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
      className="flex-row items-center px-4 py-3 border-b border-surface-200 bg-white"
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
        <UIText size="xs" className="text-typo-400 capitalize">{contact.relationship || contact.role}</UIText>
      </View>
    </View>
  );

  const messageList = (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-surface-50"
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
          <Ionicons name="chatbubble-ellipses-outline" size={48} color="#CEC6D6" />
          <UIText size="sm" className="text-typo-400 mt-3">
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
                        backgroundColor: '#fff',
                        borderBottomLeftRadius: 4,
                        borderWidth: 1,
                        borderColor: '#E2DCE8',
                      }),
                  opacity: msg.isOptimistic ? 0.7 : 1,
                }}
              >
                <UIText
                  size="sm"
                  style={{ color: isMine ? '#fff' : '#1F2937', lineHeight: 20 }}
                >
                  {msg.message_content}
                </UIText>
                <View className="flex-row items-center justify-end mt-1 gap-2">
                  <UIText
                    size="xs"
                    style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#9A93A8', fontSize: 10 }}
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
      className="border-t border-surface-200 bg-white px-3"
      style={{ paddingTop: 6, paddingBottom: isMobile ? Math.max(insets.bottom, 6) : 8 }}
    >
      <View className="flex-row items-end gap-2">
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onKeyPress={handleKeyPress}
          placeholder={`Message ${name}...`}
          placeholderTextColor="#9A93A8"
          multiline
          maxLength={2000}
          className="flex-1 bg-surface-100 rounded-2xl px-4 py-2 font-poppins text-sm"
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
            backgroundColor: input.trim() && !sending ? '#6D469B' : '#CEC6D6',
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
        className="flex-1 bg-white"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
    <View className="flex-1 bg-white">
      {header}
      {messageList}
      {inputBar}
    </View>
  );
}
