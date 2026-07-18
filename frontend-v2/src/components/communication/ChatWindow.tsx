/**
 * ChatWindow - Direct message chat view.
 * Desktop: panel inside split layout.
 * Mobile: full-screen with back button, keyboard-aware input.
 *
 * Messaging overhaul: long-press actions (react/reply/copy/edit/delete),
 * reactions row, reply quoting, photo/video attachments, and instant delivery
 * via Supabase Realtime broadcast (polling stays as the fallback).
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Avatar, AvatarFallbackText, AvatarImage, toast,
} from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useKeyboardPadding } from '@/src/hooks/useKeyboardPadding';
import {
  useConversationMessages,
  sendDirectMessage,
  markMessageRead,
  toggleDmReaction,
  editDirectMessage,
  deleteDirectMessage,
  type Contact,
  type Message,
} from '@/src/hooks/useMessages';
import {
  useMessagingRealtime,
  appendRealtimeMessage,
  patchMessageReactions,
  patchMessageEdited,
  patchMessageDeleted,
} from '@/src/hooks/useMessagingRealtime';
import {
  ReactionPills,
  ReplyQuote,
  MessageAttachments,
  ComposerBanner,
  PendingAttachmentChips,
  usePendingAttachments,
} from './MessageParts';
import { MessageActionsSheet } from './MessageActionsSheet';

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
  const isSuperadmin = user?.role === 'superadmin';
  const { messages, loading, setMessages } = useConversationMessages(conversationId);
  // Held in a ref so the mark-read effect doesn't re-run when the parent passes
  // a fresh onRead identity each render.
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  // Long-press actions sheet. `actionsFor` is kept through the close animation
  // (only `actionsVisible` flips) so the sheet doesn't unmount mid-dismiss and
  // its deferred action still has its message.
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const openActions = (msg: Message) => {
    setActionsFor(msg);
    setActionsVisible(true);
  };
  const {
    pending, pickAttachments, removeAttachment, clearAttachments, readyAttachments, uploading,
  } = usePendingAttachments();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const keyboardPad = useKeyboardPadding();
  const insets = useSafeAreaInsets();
  const isMobile = !!onBack;

  const name = getDisplayName(contact);

  // Instant delivery: apply broadcast events straight to local state. The 15s
  // poll in useConversationMessages remains the fallback. (For a brand-new chat
  // `conversationId` may still be the contact id — the poll covers that window
  // until the real conversation id is selected.)
  useMessagingRealtime(conversationId ? `dm:${conversationId}` : null, {
    onMessage: (m) => setMessages((prev) => appendRealtimeMessage(prev, m)),
    onReactions: (p) => setMessages((prev) => patchMessageReactions(prev, p.message_id, p.reactions)),
    onEdited: (p) => setMessages((prev) => patchMessageEdited(prev, p)),
    onDeleted: (p) => setMessages((prev) => patchMessageDeleted(prev, p.message_id, isSuperadmin)),
  });

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

  // Reply/edit are chosen from the actions sheet: on Android, focus() right
  // as its Modal releases window focus doesn't raise the IME ("keyboard didn't
  // pop up to reply") — defer a beat so the chat window has focus again.
  const focusInput = () => {
    if (Platform.OS === 'android') setTimeout(() => inputRef.current?.focus(), 120);
    else inputRef.current?.focus();
  };

  const startEdit = (msg: Message) => {
    setReplyTo(null);
    setEditing(msg);
    setInput(msg.message_content);
    focusInput();
  };

  const cancelEdit = () => {
    setEditing(null);
    setInput('');
  };

  const handleToggleReaction = async (msg: Message, emoji: string) => {
    try {
      const res = await toggleDmReaction(msg.id, emoji);
      if (res?.reactions) {
        setMessages((prev) => patchMessageReactions(prev, msg.id, res.reactions));
      }
    } catch {
      toast.error('Could not update the reaction');
    }
  };

  const handleDelete = async (msg: Message) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Delete this message?')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Message', 'Delete this message?', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    try {
      await deleteDirectMessage(msg.id);
      setMessages((prev) => patchMessageDeleted(prev, msg.id, isSuperadmin));
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete the message');
    }
  };

  const handleSend = async () => {
    const content = input.trim();

    // Edit mode: PATCH the existing message instead of sending a new one.
    if (editing) {
      if (!content || sending) return;
      setSending(true);
      try {
        await editDirectMessage(editing.id, content);
        const edited_at = new Date().toISOString();
        setMessages((prev) => patchMessageEdited(prev, { message_id: editing.id, content, edited_at }));
        setEditing(null);
        setInput('');
      } catch (e: any) {
        toast.error(e?.response?.data?.error || 'Failed to edit the message');
      } finally {
        setSending(false);
      }
      return;
    }

    const attachments = readyAttachments;
    if ((!content && attachments.length === 0) || sending || uploading) return;
    const replying = replyTo;

    // Optimistic update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_id: user?.id || '',
      recipient_id: contact.id,
      message_content: content,
      created_at: new Date().toISOString(),
      read_at: null,
      attachments,
      reply_to: replying
        ? {
            id: replying.id,
            sender_name: replying.sender_id === user?.id ? 'You' : name,
            content: (replying.message_content || '').slice(0, 140),
          }
        : null,
      isOptimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');
    setReplyTo(null);
    clearAttachments();

    try {
      setSending(true);
      const sent = await sendDirectMessage(contact.id, content, {
        ...(replying ? { reply_to_message_id: replying.id } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      // Swap the optimistic bubble for the saved message IN PLACE. We used to
      // refetch the whole list here, which briefly dropped the just-sent message
      // (the server hadn't indexed it yet) so it flickered: appear -> disappear
      // -> reappear on the next poll. Keeping it in place avoids the flicker; the
      // 15s poll reconciles read receipts.
      const saved: Message | undefined = (sent as any)?.message || ((sent as any)?.id ? sent : undefined);
      setMessages((prev) => {
        // The realtime broadcast may have delivered the saved message already —
        // in that case just drop the optimistic bubble instead of duplicating.
        if (saved?.id && prev.some((m) => m.id === saved.id)) {
          return prev.filter((m) => m.id !== optimisticMsg.id);
        }
        return prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...optimisticMsg, ...(saved || {}), id: saved?.id || optimisticMsg.id, isOptimistic: false }
            : m,
        );
      });
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(content);
      setReplyTo(replying);
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
            <View key={msg.id}>
              <View className={`flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
                <Pressable
                  onLongPress={
                    msg.is_deleted || msg.isOptimistic ? undefined : () => openActions(msg)
                  }
                  delayLongPress={300}
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
                  {msg.is_deleted && !msg.deleted_visible_to_admin ? (
                    <UIText
                      size="sm"
                      style={{
                        color: isMine ? 'rgba(255,255,255,0.7)' : c.textFaint,
                        fontStyle: 'italic',
                        lineHeight: 20,
                      }}
                    >
                      Message deleted
                    </UIText>
                  ) : (
                    <>
                      {msg.is_deleted && msg.deleted_visible_to_admin ? (
                        <UIText
                          size="xs"
                          style={{
                            color: isMine ? 'rgba(255,255,255,0.85)' : '#DC2626',
                            fontWeight: '700',
                            letterSpacing: 0.5,
                            marginBottom: 2,
                          }}
                        >
                          DELETED
                        </UIText>
                      ) : null}
                      <ReplyQuote replyTo={msg.reply_to} isMine={isMine} />
                      <MessageAttachments attachments={msg.attachments} isMine={isMine} />
                      {msg.message_content ? (
                        <UIText
                          size="sm"
                          style={{ color: isMine ? '#fff' : c.text, lineHeight: 20 }}
                        >
                          {msg.message_content}
                        </UIText>
                      ) : null}
                    </>
                  )}
                  <View className="flex-row items-center justify-end mt-1 gap-2">
                    {msg.edited_at && !msg.is_deleted ? (
                      <UIText
                        size="xs"
                        style={{ color: isMine ? 'rgba(255,255,255,0.6)' : c.textFaint, fontSize: 10 }}
                      >
                        (edited)
                      </UIText>
                    ) : null}
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
                </Pressable>
              </View>
              {!msg.is_deleted && (
                <ReactionPills
                  reactions={msg.reactions}
                  isMine={isMine}
                  onToggle={(emoji) => handleToggleReaction(msg, emoji)}
                />
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  const canSend = editing
    ? !!input.trim() && !sending
    : (!!input.trim() || readyAttachments.length > 0) && !sending && !uploading;

  const inputBar = (
    <View>
      {editing ? (
        <ComposerBanner
          icon="pencil-outline"
          title="Editing message"
          snippet={editing.message_content}
          onCancel={cancelEdit}
        />
      ) : replyTo ? (
        <ComposerBanner
          icon="arrow-undo-outline"
          title={`Replying to ${replyTo.sender_id === user?.id ? 'yourself' : name}`}
          snippet={replyTo.message_content || 'Attachment'}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <View
        className="border-t border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100"
      >
        {!editing && <PendingAttachmentChips items={pending} onRemove={removeAttachment} />}
        <View
          className="flex-row items-end gap-2 px-3"
          style={{ paddingTop: 6, paddingBottom: isMobile ? Math.max(insets.bottom, 6) : 8 }}
        >
          {!editing && (
            <Pressable
              onPress={pickAttachments}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo or video"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="attach" size={22} color="#6D469B" />
            </Pressable>
          )}
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
            disabled={!canSend}
            style={{
              backgroundColor: canSend ? '#6D469B' : c.border,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const actionsSheet = (
    <MessageActionsSheet
      visible={actionsVisible}
      onClose={() => setActionsVisible(false)}
      message={actionsFor}
      isOwn={actionsFor?.sender_id === user?.id}
      canDelete={actionsFor?.sender_id === user?.id}
      onReact={(emoji) => actionsFor && handleToggleReaction(actionsFor, emoji)}
      onReply={() => {
        if (!actionsFor) return;
        setEditing(null);
        setReplyTo(actionsFor);
        focusInput();
      }}
      onEdit={() => actionsFor && startEdit(actionsFor)}
      onDelete={() => actionsFor && handleDelete(actionsFor)}
    />
  );

  // Mobile: iOS resizes via KeyboardAvoidingView; Android is edge-to-edge
  // (window never resizes for the IME), so pad manually off Keyboard events —
  // behavior="height" left the keyboard covering the input bar.
  if (isMobile) {
    if (Platform.OS === 'android') {
      return (
        <Animated.View
          className="flex-1 bg-white dark:bg-dark-surface-100"
          style={{ paddingBottom: keyboardPad }}
        >
          {header}
          {messageList}
          {inputBar}
          {actionsSheet}
        </Animated.View>
      );
    }
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-white dark:bg-dark-surface-100"
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {header}
        {messageList}
        {inputBar}
        {actionsSheet}
      </KeyboardAvoidingView>
    );
  }

  // Desktop
  return (
    <View className="flex-1 bg-white dark:bg-dark-surface-100">
      {header}
      {messageList}
      {inputBar}
      {actionsSheet}
    </View>
  );
}
