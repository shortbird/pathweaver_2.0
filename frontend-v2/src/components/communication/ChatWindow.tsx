/**
 * ChatWindow - Direct message chat view.
 * Shows message thread + input for a selected DM contact.
 * Web-only component.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, TextInput } from 'react-native';
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

export function ChatWindow({ contact, conversationId }: Props) {
  const { user } = useAuthStore();
  const { messages, loading, refetch, setMessages } = useConversationMessages(conversationId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

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

  // Focus input when contact changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [contact.id]);

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

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-5 py-3 border-b border-surface-200">
        <Avatar size="md">
          {contact.avatar_url ? (
            <AvatarImage source={{ uri: contact.avatar_url }} />
          ) : (
            <AvatarFallbackText>{name.charAt(0).toUpperCase()}</AvatarFallbackText>
          )}
        </Avatar>
        <View className="ml-3">
          <Heading size="sm">{name}</Heading>
          <UIText size="xs" className="text-typo-400 capitalize">{contact.relationship || contact.role}</UIText>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-surface-50"
        contentContainerStyle={{ padding: 20, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <View className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          </View>
        ) : messages.length === 0 ? (
          <View className="items-center py-20">
            <Ionicons name="chatbubble-ellipses-outline" size={48} color="#D1D5DB" />
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
                    padding: 12,
                    borderRadius: 16,
                    ...(isMine
                      ? {
                          backgroundColor: '#6D469B',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          backgroundColor: '#fff',
                          borderBottomLeftRadius: 4,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                        }),
                    opacity: msg.isOptimistic ? 0.7 : 1,
                  }}
                >
                  <UIText
                    size="sm"
                    style={{ color: isMine ? '#fff' : '#1F2937' }}
                  >
                    {msg.message_content}
                  </UIText>
                  <View className="flex-row items-center justify-between mt-1.5 gap-3">
                    <UIText
                      size="xs"
                      style={{ color: isMine ? 'rgba(255,255,255,0.7)' : '#9CA3AF', fontSize: 10 }}
                    >
                      {formatTime(msg.created_at)}
                    </UIText>
                    {isMine && (
                      <UIText
                        size="xs"
                        style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}
                      >
                        {msg.isOptimistic ? 'Sending...' : msg.read_at ? 'Read' : 'Sent'}
                      </UIText>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View className="border-t border-surface-200 bg-white px-4 py-3">
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${name}...`}
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={2000}
              className="border border-surface-200 rounded-xl px-4 py-2.5 font-poppins text-sm"
              style={{
                outline: 'none',
                minHeight: 42,
                maxHeight: 120,
              } as any}
            />
            <View className="flex-row justify-between mt-1 px-1">
              <UIText size="xs" className="text-typo-400" style={{ fontSize: 10 }}>
                {input.length}/2000
              </UIText>
              <UIText size="xs" className="text-typo-300" style={{ fontSize: 10 }}>
                Enter to send, Shift+Enter for new line
              </UIText>
            </View>
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || sending}
            style={{
              backgroundColor: input.trim() && !sending ? '#6D469B' : '#D1D5DB',
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
            }}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
