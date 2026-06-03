/**
 * GroupChatWindow - Group message chat view.
 * Desktop: panel with optional member sidebar.
 * Mobile: full-screen with back button, member list as bottom sheet.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Avatar, AvatarFallbackText, AvatarImage, toast,
} from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useGroupMessages,
  useGroupDetail,
  sendGroupMessage,
  markGroupRead,
  deleteGroup,
  type Group,
  type Message,
} from '@/src/hooks/useMessages';

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

function MembersList({ members, userId, onClose }: { members: any[]; userId?: string; onClose?: () => void }) {
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

export function GroupChatWindow({ group, onBack, onDeleted }: Props) {
  const c = useThemeColors();
  const { user } = useAuthStore();
  const { messages, loading, refetch, setMessages } = useGroupMessages(group.id);
  const { group: groupDetail, loading: detailLoading } = useGroupDetail(group.id);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const isMobile = !!onBack;

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

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

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
      isOptimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');

    try {
      setSending(true);
      await sendGroupMessage(group.id, content);
      refetch();
    } catch {
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

  const members = groupDetail?.members || [];

  // Group admins (the creator is added as admin) and superadmins can delete.
  const myMembership = members.find((m: any) => (m.user || m).id === user?.id);
  const isGroupAdmin = myMembership?.role === 'admin' || myMembership?.role === 'owner';
  const canDelete = isGroupAdmin || user?.role === 'superadmin';

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

                <View
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
                  <UIText size="sm" style={{ color: isMine ? '#fff' : c.text, lineHeight: 20 }}>
                    {msg.message_content}
                  </UIText>
                  <UIText
                    size="xs"
                    style={{
                      color: isMine ? 'rgba(255,255,255,0.6)' : c.textFaint,
                      fontSize: 10,
                      marginTop: 4,
                      textAlign: 'right',
                    }}
                  >
                    {msg.isOptimistic ? 'Sending...' : formatTime(msg.created_at)}
                  </UIText>
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
  if (isMobile) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-white dark:bg-dark-surface-100"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {header}
        {messageList}
        {inputBar}
        {memberModal}
      </KeyboardAvoidingView>
    );
  }

  // ── Desktop layout ──
  return (
    <View className="flex-1 flex-row bg-white dark:bg-dark-surface-100">
      {/* Main chat area */}
      <View className="flex-1">
        {header}
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
          {groupDetail?.description ? (
            <View className="px-4 py-3 border-t border-surface-200 dark:border-dark-surface-300">
              <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 mb-1">About</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{groupDetail.description}</UIText>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
