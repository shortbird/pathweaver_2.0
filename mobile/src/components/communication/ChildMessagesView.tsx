/**
 * ChildMessagesView - Parent (or superadmin) read-only view of a child's
 * message history. Two drill-down levels in one component:
 *   the scoped child's conversations -> a conversation's messages.
 * Which child is the family scope (stores/familyStore), switched with the
 * same ChildSwitcher row every other parent surface uses; this view had its
 * own child list until 2026-09-15, the fourth copy of that picker.
 * This is VIEW-only: there is no input bar and nothing is marked read.
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useChildConversations,
  useChildConversationMessages,
  type Conversation,
} from '@/src/hooks/useMessages';
import { useMyChildren, type Child } from '@/src/hooks/useParent';
import { useSelectedChild } from '@/src/stores/familyStore';
import { ChildSwitcher } from '@/src/components/family/ChildSwitcher';
import { MessageAttachments } from '@/src/components/communication/MessageParts';

interface Props {
  onBack: () => void;
  isMobile?: boolean;
}

function childName(c: Child) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.display_name || 'Child';
}

function formatTime(ts: string | null) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Spinner() {
  return (
    <View className="flex-1 items-center justify-center py-20">
      <View className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
    </View>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100">
      <Pressable onPress={onBack} className="mr-2 p-1" hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color={c.brand} />
      </Pressable>
      <View className="flex-1">
        <Heading size="sm">{title}</Heading>
        {subtitle ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{subtitle}</UIText>
        ) : null}
      </View>
    </View>
  );
}

export function ChildMessagesView({ onBack, isMobile }: Props) {
  // The family list every parent surface shares; the hook also reconciles
  // the family scope against it, so useSelectedChild below is never stale.
  const { children, loading } = useMyChildren();
  const child = useSelectedChild() as Child | null;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const c = useThemeColors();

  const Container: any = isMobile ? SafeAreaView : View;
  const containerProps: any = isMobile
    ? { className: 'flex-1 bg-white dark:bg-dark-surface-100', edges: ['top'] }
    : { className: 'flex-1 bg-white dark:bg-dark-surface-100' };

  // ── Level 2: a conversation's messages (read-only) ──
  if (child && conversation) {
    return (
      <Container {...containerProps}>
        <ChildConversation
          childId={child.id}
          conversation={conversation}
          onBack={() => setConversation(null)}
        />
      </Container>
    );
  }

  // ── Level 1: the scoped child's conversations, switcher on top ──
  if (child) {
    return (
      <Container {...containerProps}>
        <ChildConversationList
          child={child}
          switcher={children.length > 1 ? <ChildSwitcher onSelect={() => setConversation(null)} /> : null}
          onBack={onBack}
          onSelect={setConversation}
        />
      </Container>
    );
  }

  // ── No child in scope: loading, or nobody linked ──
  return (
    <Container {...containerProps}>
      <Header title="My children's messages" subtitle="Read-only" onBack={onBack} />
      {loading ? (
        <Spinner />
      ) : (
        <View className="items-center py-16 px-6">
          <Ionicons name="people-outline" size={40} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3 text-center">
            No linked children found.
          </UIText>
        </View>
      )}
    </Container>
  );
}

function ChildConversationList({
  child,
  switcher,
  onBack,
  onSelect,
}: {
  child: Child;
  switcher?: React.ReactNode;
  onBack: () => void;
  onSelect: (conv: Conversation) => void;
}) {
  const c = useThemeColors();
  const { conversations, loading } = useChildConversations(child.id);
  const name = childName(child);

  return (
    <>
      <Header
        title={`${name}'s messages`}
        subtitle="Read-only conversations"
        onBack={onBack}
      />
      {switcher ? <View className="px-4">{switcher}</View> : null}
      {loading ? (
        <Spinner />
      ) : !conversations.length ? (
        <View className="items-center py-16 px-6">
          <Ionicons name="chatbubbles-outline" size={40} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3 text-center">
            {name} has no conversations yet.
          </UIText>
        </View>
      ) : (
        <ScrollView className="flex-1">
          {conversations.map((conv) => {
            const other = conv.other_user;
            const otherName = other
              ? `${other.first_name || ''} ${other.last_name || ''}`.trim() || other.display_name || 'Unknown'
              : 'Unknown';
            return (
              <Pressable
                key={conv.id}
                onPress={() => onSelect(conv)}
                className="flex-row items-center px-4 py-3 border-b border-surface-100 dark:border-dark-surface-200 active:bg-surface-100 dark:active:bg-dark-surface-200"
              >
                <Avatar size="md">
                  {other?.avatar_url ? (
                    <AvatarImage source={{ uri: other.avatar_url }} />
                  ) : (
                    <AvatarFallbackText>{otherName.charAt(0).toUpperCase()}</AvatarFallbackText>
                  )}
                </Avatar>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center justify-between">
                    <UIText size="sm" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700" numberOfLines={1}>
                      {otherName}
                    </UIText>
                    {conv.last_message_at && (
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-2">
                        {formatTime(conv.last_message_at)}
                      </UIText>
                    )}
                  </View>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5" numberOfLines={1}>
                    {conv.last_message_preview || 'No messages yet'}
                  </UIText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

function ChildConversation({
  childId,
  conversation,
  onBack,
}: {
  childId: string;
  conversation: Conversation;
  onBack: () => void;
}) {
  const c = useThemeColors();
  const { messages, loading } = useChildConversationMessages(childId, conversation.id);
  const other = conversation.other_user;
  const otherName = other
    ? `${other.first_name || ''} ${other.last_name || ''}`.trim() || other.display_name || 'Unknown'
    : 'Unknown';

  return (
    <View className="flex-1">
      <Header title={otherName} subtitle="Read-only — you cannot reply" onBack={onBack} />
      {loading ? (
        <Spinner />
      ) : (
        <ScrollView
          className="flex-1 bg-surface-50 dark:bg-dark-surface-50"
          contentContainerStyle={{ padding: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View className="items-center py-20">
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3">
                No messages in this conversation.
              </UIText>
            </View>
          ) : (
            messages.map((msg) => {
              // Align the child's own messages to the right.
              const isChild = msg.sender_id === childId;
              return (
                <View key={msg.id} className={`flex-row ${isChild ? 'justify-end' : 'justify-start'}`}>
                  <View
                    style={{
                      maxWidth: '75%',
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 18,
                      ...(isChild
                        ? { backgroundColor: c.brand, borderBottomRightRadius: 4 }
                        : {
                            backgroundColor: c.card,
                            borderBottomLeftRadius: 4,
                            borderWidth: 1,
                            borderColor: c.border,
                          }),
                    }}
                  >
                    {!!msg.message_content && (
                      <UIText size="sm" style={{ color: isChild ? '#fff' : c.text, lineHeight: 20 }}>
                        {msg.message_content}
                      </UIText>
                    )}
                    {/* The pictures the child sent or received, signed by the
                        server; a photo-only message was an empty bubble here. */}
                    <MessageAttachments attachments={msg.attachments} isMine={isChild} />
                    <UIText
                      size="xs"
                      style={{ color: isChild ? 'rgba(255,255,255,0.6)' : c.textFaint, fontSize: 12, marginTop: 4, textAlign: 'right' }}
                    >
                      {formatTime(msg.created_at)}
                    </UIText>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
