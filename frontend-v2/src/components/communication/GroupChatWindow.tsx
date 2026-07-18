/**
 * GroupChatWindow - Group message chat view.
 * Desktop: panel with optional member sidebar.
 * Mobile: full-screen with back button, member list as bottom sheet.
 *
 * Messaging overhaul: long-press actions (react/reply/copy/edit/delete/pin),
 * reactions row, reply quoting, photo/video attachments, pinned-message banner,
 * announcement-only mode (admins-only posting), and instant delivery via
 * Supabase Realtime broadcast (polling stays as the fallback).
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Modal, Alert, Switch, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Avatar, AvatarFallbackText, AvatarImage, toast,
} from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useKeyboardPadding } from '@/src/hooks/useKeyboardPadding';
import {
  useGroupMessages,
  useGroupDetail,
  sendGroupMessage,
  markGroupRead,
  deleteGroup,
  toggleGroupReaction,
  editGroupMessage,
  deleteGroupMessage,
  pinGroupMessage,
  setGroupAnnouncementOnly,
  type Group,
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
  group: Group;
  onBack?: () => void;
  /** Called after the group is deleted so the parent can clear selection + refetch. */
  onDeleted?: () => void;
}

function formatTime(ts: string) {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function senderName(msg: Message) {
  if (!msg.sender) return 'Unknown';
  return `${msg.sender.first_name || ''} ${msg.sender.last_name || ''}`.trim() || msg.sender.display_name || 'Unknown';
}

function memberDisplayName(member: any) {
  const u = member.user || member;
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.display_name || 'Unknown';
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  owner: 'Owner',
};

function MembersList({ members, userId }: { members: any[]; userId?: string; onClose?: () => void }) {
  const c = useThemeColors();
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 4 }}>
      {members.map((member: any) => {
        const name = memberDisplayName(member);
        const u = member.user || member;
        const isCurrentUser = u.id === userId;
        const roleLabel = roleLabels[member.role] || member.role;

        return (
          <View key={member.id || u.id} className="flex-row items-center px-4 py-2.5">
            <Avatar size="sm">
              {u.avatar_url ? (
                <AvatarImage source={{ uri: u.avatar_url }} />
              ) : (
                <AvatarFallbackText>{name.charAt(0).toUpperCase()}</AvatarFallbackText>
              )}
            </Avatar>
            <View className="flex-1 ml-2.5">
              <UIText size="sm" className="font-poppins-medium text-typo-800" numberOfLines={1}>
                {name}{isCurrentUser ? ' (you)' : ''}
              </UIText>
              {member.role && member.role !== 'member' && (
                <View
                  className="self-start mt-0.5"
                  style={{
                    backgroundColor: member.role === 'admin' || member.role === 'owner' ? '#EDE9F0' : c.surfaceMuted,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 8,
                  }}
                >
                  <UIText size="xs" style={{ color: member.role === 'admin' || member.role === 'owner' ? '#6D469B' : c.textMuted, fontSize: 10 }}>
                    {roleLabel}
                  </UIText>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Admin-only group settings row: announcement-only toggle. Lives inside the
 *  member sheet/panel (the existing "settings UI" for a group). */
function AdminSettings({
  announcementOnly,
  saving,
  onToggle,
}: {
  announcementOnly: boolean;
  saving: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <View className="px-4 py-3 border-t border-surface-200 dark:border-dark-surface-300">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <UIText size="sm" className="font-poppins-medium text-typo-800">Announcement-only</UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
            Only group admins can post
          </UIText>
        </View>
        <Switch
          value={announcementOnly}
          disabled={saving}
          onValueChange={onToggle}
          trackColor={{ true: '#6D469B', false: undefined }}
          accessibilityLabel="Announcement-only"
        />
      </View>
    </View>
  );
}

export function GroupChatWindow({ group, onBack, onDeleted }: Props) {
  const c = useThemeColors();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const { messages, loading, setMessages } = useGroupMessages(group.id);
  const { group: groupDetail, loading: detailLoading } = useGroupDetail(group.id);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  // Long-press actions sheet. `actionsFor` persists through the close animation
  // (only `actionsVisible` flips) so the deferred action keeps its message.
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  // Pin + announcement-only state, seeded from the group detail fetch and kept
  // live by realtime 'pinned' / 'settings' events.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [pinnedFallback, setPinnedFallback] = useState<Message | null>(null);
  const [announcementOnly, setAnnouncementOnly] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const {
    pending, pickAttachments, removeAttachment, clearAttachments, readyAttachments, uploading,
  } = usePendingAttachments();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const keyboardPad = useKeyboardPadding();
  const insets = useSafeAreaInsets();
  const isMobile = !!onBack;

  useEffect(() => {
    if (!groupDetail) return;
    setPinnedId(groupDetail.pinned_message_id || groupDetail.pinned_message?.id || null);
    setPinnedFallback((groupDetail.pinned_message as Message) || null);
    setAnnouncementOnly(!!groupDetail.announcement_only);
  }, [groupDetail]);

  // Instant delivery: apply broadcast events straight to local state. The 15s
  // poll in useGroupMessages remains the fallback.
  useMessagingRealtime(group.id ? `group:${group.id}` : null, {
    onMessage: (m) => setMessages((prev) => appendRealtimeMessage(prev, m)),
    onReactions: (p) => setMessages((prev) => patchMessageReactions(prev, p.message_id, p.reactions)),
    onEdited: (p) => setMessages((prev) => patchMessageEdited(prev, p)),
    onDeleted: (p) => setMessages((prev) => patchMessageDeleted(prev, p.message_id, isSuperadmin)),
    onPinned: (p) => setPinnedId(p.pinned_message_id),
    onSettings: (p) => setAnnouncementOnly(!!p.announcement_only),
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Mark as read when viewing. E4: if the call fails (transient 5xx, offline)
  // we retry once on the next poll tick rather than losing the read state.
  useEffect(() => {
    if (!group.id) return;
    let cancelled = false;
    const attempt = async (retriesLeft: number) => {
      try {
        await markGroupRead(group.id);
      } catch {
        if (!cancelled && retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 15000);
        }
      }
    };
    attempt(1);
    return () => { cancelled = true; };
  }, [group.id]);

  // Focus input (desktop only)
  useEffect(() => {
    if (!isMobile) inputRef.current?.focus();
  }, [group.id, isMobile]);

  const members = groupDetail?.members || [];

  // Group admins (the creator is added as admin) and superadmins can delete.
  const myMembership = members.find((m: any) => (m.user || m).id === user?.id);
  const isGroupAdmin = myMembership?.role === 'admin' || myMembership?.role === 'owner';
  const canDelete = isGroupAdmin || user?.role === 'superadmin';
  const canPost = isGroupAdmin || !announcementOnly;

  // The pinned message for the banner: prefer the live copy from the message
  // list (tracks edits), fall back to the hydrated copy from the detail fetch.
  const pinnedMessage = pinnedId
    ? messages.find((m) => m.id === pinnedId) || (pinnedFallback?.id === pinnedId ? pinnedFallback : null)
    : null;

  const openActions = (msg: Message) => {
    setActionsFor(msg);
    setActionsVisible(true);
  };

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
      const res = await toggleGroupReaction(group.id, msg.id, emoji);
      if (res?.reactions) {
        setMessages((prev) => patchMessageReactions(prev, msg.id, res.reactions));
      }
    } catch {
      toast.error('Could not update the reaction');
    }
  };

  const handleDeleteMessage = async (msg: Message) => {
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
      await deleteGroupMessage(group.id, msg.id);
      setMessages((prev) => patchMessageDeleted(prev, msg.id, isSuperadmin));
      if (pinnedId === msg.id) setPinnedId(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete the message');
    }
  };

  const handleTogglePin = async (msg: Message) => {
    const nextId = pinnedId === msg.id ? null : msg.id;
    try {
      await pinGroupMessage(group.id, nextId);
      setPinnedId(nextId);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to update the pin');
    }
  };

  const handleUnpin = async () => {
    try {
      await pinGroupMessage(group.id, null);
      setPinnedId(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to unpin');
    }
  };

  const handleToggleAnnouncementOnly = async (value: boolean) => {
    setSavingSettings(true);
    const prev = announcementOnly;
    setAnnouncementOnly(value);
    try {
      await setGroupAnnouncementOnly(group.id, value);
    } catch (e: any) {
      setAnnouncementOnly(prev);
      toast.error(e?.response?.data?.error || 'Failed to update the setting');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSend = async () => {
    const content = input.trim();

    // Edit mode: PATCH the existing message instead of sending a new one.
    if (editing) {
      if (!content || sending) return;
      setSending(true);
      try {
        await editGroupMessage(group.id, editing.id, content);
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
      group_id: group.id,
      message_content: content,
      created_at: new Date().toISOString(),
      read_at: null,
      sender: {
        id: user?.id || '',
        display_name: user?.display_name || 'You',
        first_name: user?.first_name,
        last_name: user?.last_name,
      },
      attachments,
      reply_to: replying
        ? {
            id: replying.id,
            sender_name: replying.sender_id === user?.id ? 'You' : senderName(replying),
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
      const sent = await sendGroupMessage(group.id, content, {
        ...(replying ? { reply_to_message_id: replying.id } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      // Swap the optimistic bubble for the saved message in place (no refetch
      // flicker); the realtime broadcast may have delivered it first.
      const saved: Message | undefined = (sent as any)?.message || ((sent as any)?.id ? sent : undefined);
      setMessages((prev) => {
        if (saved?.id && prev.some((m) => m.id === saved.id)) {
          return prev.filter((m) => m.id !== optimisticMsg.id);
        }
        return prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...optimisticMsg, ...(saved || {}), id: saved?.id || optimisticMsg.id, isOptimistic: false }
            : m,
        );
      });
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(content);
      setReplyTo(replying);
      // 403: announcement-only groups reject non-admin posts.
      if (e?.response?.status === 403) {
        setAnnouncementOnly(true);
        toast.error(e?.response?.data?.error || 'Only teachers can post in this group');
      }
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

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete "${group.name}"? This removes the group for all members and cannot be undone.`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delete Group',
            `Delete "${group.name}"? This removes the group for all members and cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteGroup(group.id);
      toast.success('Group deleted');
      onDeleted?.();
      onBack?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  const header = (
    <View
      className="flex-row items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100"
      style={isMobile ? { paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8 } : undefined}
    >
      <View className="flex-row items-center flex-1">
        {isMobile && (
          <Pressable onPress={onBack} className="mr-2 p-1" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#6D469B" />
          </Pressable>
        )}
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: '#6D469B' }}
        >
          <Ionicons name="people" size={20} color="#fff" />
        </View>
        <View className="ml-3 flex-1">
          <Heading size="sm" numberOfLines={1}>{group.name}</Heading>
          <Pressable onPress={() => setShowMembers((v) => !v)}>
            <UIText size="xs" className="text-optio-purple">
              {group.member_count || 0} members
            </UIText>
          </Pressable>
        </View>
      </View>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Pressable
          onPress={() => setShowMembers((v) => !v)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: showMembers ? '#6D469B' : c.surfaceMuted,
          }}
        >
          <Ionicons
            name="people-outline"
            size={18}
            color={showMembers ? '#fff' : c.icon}
          />
        </Pressable>
        {canDelete && (
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            hitSlop={6}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.surfaceMuted,
              opacity: deleting ? 0.5 : 1,
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </Pressable>
        )}
      </View>
    </View>
  );

  // Pinned-message banner under the header (admins can unpin from it).
  const pinnedBanner = pinnedMessage ? (
    <View
      className="flex-row items-center border-b border-surface-200 dark:border-dark-surface-300"
      style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: '#EDE9F0' }}
    >
      <Ionicons name="pin" size={16} color="#6D469B" />
      <View className="flex-1">
        <UIText size="xs" className="font-poppins-semibold" style={{ color: '#6D469B' }} numberOfLines={1}>
          Pinned{pinnedMessage.sender ? ` · ${senderName(pinnedMessage)}` : ''}
        </UIText>
        <UIText size="xs" style={{ color: '#4A3564' }} numberOfLines={2}>
          {pinnedMessage.message_content || 'Attachment'}
        </UIText>
      </View>
      {isGroupAdmin && (
        <Pressable onPress={handleUnpin} hitSlop={8} accessibilityRole="button" accessibilityLabel="Unpin message">
          <Ionicons name="close" size={16} color="#6D469B" />
        </Pressable>
      )}
    </View>
  ) : null;

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
          <Ionicons name="chatbubbles-outline" size={48} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3">
            No messages yet. Start the conversation!
          </UIText>
        </View>
      ) : (
        messages.map((msg, idx) => {
          const isMine = msg.sender_id === user?.id;
          const showSender = !isMine && (idx === 0 || messages[idx - 1]?.sender_id !== msg.sender_id);
          const name = senderName(msg);

          return (
            <View key={msg.id}>
              {/* Sender name (for others) */}
              {showSender && (
                <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mb-1" style={{ marginLeft: isMine ? 0 : 44, fontSize: 11 }}>
                  {name}
                </UIText>
              )}
              <View className={`flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
                {/* Avatar for others */}
                {!isMine && showSender && (
                  <Avatar size="sm" className="mr-2">
                    {msg.sender?.avatar_url ? (
                      <AvatarImage source={{ uri: msg.sender.avatar_url }} />
                    ) : (
                      <AvatarFallbackText>{name.charAt(0).toUpperCase()}</AvatarFallbackText>
                    )}
                  </Avatar>
                )}
                {!isMine && !showSender && <View style={{ width: 40 }} />}

                <Pressable
                  onLongPress={
                    msg.is_deleted || msg.isOptimistic ? undefined : () => openActions(msg)
                  }
                  delayLongPress={300}
                  style={{
                    maxWidth: '70%',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 18,
                    ...(isMine
                      ? { backgroundColor: '#6D469B', borderBottomRightRadius: 4 }
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
                        <UIText size="sm" style={{ color: isMine ? '#fff' : c.text, lineHeight: 20 }}>
                          {msg.message_content}
                        </UIText>
                      ) : null}
                    </>
                  )}
                  <View className="flex-row items-center justify-end gap-2" style={{ marginTop: 4 }}>
                    {pinnedId === msg.id && !msg.is_deleted ? (
                      <Ionicons name="pin" size={10} color={isMine ? 'rgba(255,255,255,0.6)' : c.textFaint} />
                    ) : null}
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
                      style={{
                        color: isMine ? 'rgba(255,255,255,0.6)' : c.textFaint,
                        fontSize: 10,
                        textAlign: 'right',
                      }}
                    >
                      {msg.isOptimistic ? 'Sending...' : formatTime(msg.created_at)}
                    </UIText>
                  </View>
                </Pressable>
              </View>
              {!msg.is_deleted && (
                <View style={!isMine ? { marginLeft: 40 } : undefined}>
                  <ReactionPills
                    reactions={msg.reactions}
                    isMine={isMine}
                    onToggle={(emoji) => handleToggleReaction(msg, emoji)}
                  />
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // Announcement-only notice replaces the composer for non-admins.
  const announcementNotice = (
    <View
      className="flex-row items-center justify-center border-t border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100"
      style={{ paddingTop: 12, paddingBottom: isMobile ? Math.max(insets.bottom, 12) : 12, gap: 8, paddingHorizontal: 16 }}
    >
      <Ionicons name="megaphone-outline" size={16} color={c.iconMuted} />
      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">
        Only teachers can post in this group
      </UIText>
    </View>
  );

  const canSend = editing
    ? !!input.trim() && !sending
    : (!!input.trim() || readyAttachments.length > 0) && !sending && !uploading;

  const composer = (
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
          title={`Replying to ${replyTo.sender_id === user?.id ? 'yourself' : senderName(replyTo)}`}
          snippet={replyTo.message_content || 'Attachment'}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <View className="border-t border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100">
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
            placeholder="Type a message..."
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

  const inputBar = canPost ? composer : announcementNotice;

  const actionsSheet = (
    <MessageActionsSheet
      visible={actionsVisible}
      onClose={() => setActionsVisible(false)}
      message={actionsFor}
      isOwn={actionsFor?.sender_id === user?.id}
      canDelete={actionsFor?.sender_id === user?.id || isGroupAdmin}
      canPin={isGroupAdmin}
      isPinned={!!actionsFor && pinnedId === actionsFor.id}
      onReact={(emoji) => actionsFor && handleToggleReaction(actionsFor, emoji)}
      onReply={() => {
        if (!actionsFor) return;
        setEditing(null);
        setReplyTo(actionsFor);
        focusInput();
      }}
      onEdit={() => actionsFor && startEdit(actionsFor)}
      onDelete={() => actionsFor && handleDeleteMessage(actionsFor)}
      onPin={() => actionsFor && handleTogglePin(actionsFor)}
    />
  );

  // ── Mobile members modal ──
  const memberModal = isMobile ? (
    <Modal visible={showMembers} transparent animationType="slide" onRequestClose={() => setShowMembers(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowMembers(false)} />
        <View
          className="bg-white dark:bg-dark-surface-100 rounded-t-2xl"
          style={{ maxHeight: '60%', paddingBottom: insets.bottom || 16 }}
        >
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300">
            <UIText size="sm" className="font-poppins-semibold text-typo-800">
              Members ({members.length})
            </UIText>
            <Pressable onPress={() => setShowMembers(false)} className="p-1">
              <Ionicons name="close" size={20} color={c.icon} />
            </Pressable>
          </View>
          {/* Drag handle */}
          <View className="items-center py-1">
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>
          {detailLoading ? (
            <View className="items-center py-8">
              <View className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            </View>
          ) : (
            <MembersList members={members} userId={user?.id} />
          )}
          {isGroupAdmin && (
            <AdminSettings
              announcementOnly={announcementOnly}
              saving={savingSettings}
              onToggle={handleToggleAnnouncementOnly}
            />
          )}
          {groupDetail?.description ? (
            <View className="px-4 py-3 border-t border-surface-200 dark:border-dark-surface-300">
              <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 mb-1">About</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{groupDetail.description}</UIText>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  ) : null;

  // ── Mobile layout ──
  // iOS resizes via KeyboardAvoidingView; Android is edge-to-edge (window
  // never resizes for the IME), so pad manually off Keyboard events —
  // behavior="height" left the keyboard covering the input bar.
  if (isMobile) {
    if (Platform.OS === 'android') {
      return (
        <Animated.View
          className="flex-1 bg-white dark:bg-dark-surface-100"
          style={{ paddingBottom: keyboardPad }}
        >
          {header}
          {pinnedBanner}
          {messageList}
          {inputBar}
          {memberModal}
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
        {pinnedBanner}
        {messageList}
        {inputBar}
        {memberModal}
        {actionsSheet}
      </KeyboardAvoidingView>
    );
  }

  // ── Desktop layout ──
  return (
    <View className="flex-1 flex-row bg-white dark:bg-dark-surface-100">
      {/* Main chat area */}
      <View className="flex-1">
        {header}
        {pinnedBanner}
        {messageList}
        {inputBar}
      </View>

      {/* Desktop members panel */}
      {showMembers && (
        <View className="bg-white dark:bg-dark-surface-100 border-l border-surface-200 dark:border-dark-surface-300" style={{ width: 280 }}>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300">
            <UIText size="sm" className="font-poppins-semibold text-typo-800">
              Members ({members.length})
            </UIText>
            <Pressable onPress={() => setShowMembers(false)} className="p-1">
              <Ionicons name="close" size={18} color={c.icon} />
            </Pressable>
          </View>
          {detailLoading ? (
            <View className="items-center py-8">
              <View className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            </View>
          ) : members.length === 0 ? (
            <View className="items-center py-8 px-4">
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">No members found</UIText>
            </View>
          ) : (
            <MembersList members={members} userId={user?.id} />
          )}
          {isGroupAdmin && (
            <AdminSettings
              announcementOnly={announcementOnly}
              saving={savingSettings}
              onToggle={handleToggleAnnouncementOnly}
            />
          )}
          {groupDetail?.description ? (
            <View className="px-4 py-3 border-t border-surface-200 dark:border-dark-surface-300">
              <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 mb-1">About</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{groupDetail.description}</UIText>
            </View>
          ) : null}
        </View>
      )}

      {actionsSheet}
    </View>
  );
}
