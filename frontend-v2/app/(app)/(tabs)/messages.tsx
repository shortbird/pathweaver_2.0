/**
 * Messages - Communication hub with DMs and group chats.
 * Mobile: texting-app UX (full-screen list → full-screen chat).
 * Desktop: split-panel (list on left, chat on right).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Heading } from '@/src/components/ui';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useAuthStore } from '@/src/stores/authStore';
import { useUIStore } from '@/src/stores/uiStore';
import {
  useConversations,
  useContacts,
  useGroups,
  useChildren,
  type Contact,
  type Group,
} from '@/src/hooks/useMessages';
import { ConversationList } from '@/src/components/communication/ConversationList';
import { ChatWindow } from '@/src/components/communication/ChatWindow';
import { GroupChatWindow } from '@/src/components/communication/GroupChatWindow';
import { CreateGroupModal } from '@/src/components/communication/CreateGroupModal';
import { ChildMessagesView } from '@/src/components/communication/ChildMessagesView';
import { ComposeSheet } from '@/src/components/communication/ComposeSheet';
import { requestNotificationsRefresh } from '@/src/hooks/useNotifications';

interface SelectedConversation {
  id: string;
  type: 'dm' | 'group';
  contact?: Contact;
  group?: Group;
}

export default function MessagesScreen() {
  const { user } = useAuthStore();
  const { isDesktop } = useBreakpoint();
  const isMobile = !isDesktop;
  const c = useThemeColors();

  // Parents get the read-only "view my child's messages" entry point. Superadmins
  // who are also linked as a parent (e.g. to their own kids) see it too.
  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role;
  const isParent = effectiveRole === 'parent';
  const isSuperadmin = effectiveRole === 'superadmin';

  const { conversations, loading: convoLoading, refetch: refetchConversations } = useConversations();
  const { contacts, loading: contactsLoading } = useContacts();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups();
  const { children: parentChildren } = useChildren(isParent || isSuperadmin);

  const [selected, setSelected] = useState<SelectedConversation | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showChildMessages, setShowChildMessages] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);

  // Always show the entry for parents; for superadmins only when they actually
  // have linked children (so a non-parent superadmin doesn't get an empty entry).
  const canViewChildMessages = isParent || (isSuperadmin && parentChildren.length > 0);

  // With exactly one linked child, label the entry point with their name.
  const onlyChild = canViewChildMessages && parentChildren.length === 1 ? parentChildren[0] : null;
  const childMessagesLabel = onlyChild
    ? `${`${onlyChild.first_name || ''} ${onlyChild.last_name || ''}`.trim() || onlyChild.display_name || 'Your child'}'s messages`
    : undefined;

  // Hide tab bar when in a conversation or the child-messages view on mobile
  useEffect(() => {
    if (!isMobile) return;
    setTabBarHidden(!!selected || showChildMessages);
    return () => setTabBarHidden(false);
  }, [selected, showChildMessages, isMobile, setTabBarHidden]);

  // Check if user can create groups (advisor, org_admin, superadmin)
  const canCreateGroups = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole || '');

  const handleGroupCreated = (group: any) => {
    refetchGroups();
    setSelected({ id: group.id, type: 'group', group });
  };

  const handleBack = () => setSelected(null);

  // When a thread is read, refresh the conversation-list unread dots AND ask the
  // notification bell to refetch — reading a thread clears its 'message_received'
  // notifications server-side, but the bell only re-pulls on focus otherwise, so
  // the count looked stale ("viewed the message but it still showed in notifications").
  const handleThreadRead = useCallback(() => {
    refetchConversations();
    requestNotificationsRefresh();
  }, [refetchConversations]);

  // Android hardware back: a conversation/child-view is rendered in-place (local
  // state, not a route), so without this the back press bubbles to the Tabs
  // navigator, which jumps to the initial tab (Family for parents) and leaves
  // the tab bar hidden. Instead, back should return to the conversation list and
  // restore the bar — exactly what clearing `selected`/`showChildMessages` does
  // (the tabBarHidden effect above re-runs and unhides it).
  useFocusEffect(
    useCallback(() => {
      if (!isMobile) return;
      const onBackPress = () => {
        if (showChildMessages) { setShowChildMessages(false); return true; }
        if (selected) { setSelected(null); return true; }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [isMobile, selected, showChildMessages])
  );

  // ── Mobile: full-screen list or full-screen chat ──
  if (isMobile) {
    // Child message history view (parents, read-only)
    if (showChildMessages) {
      return <ChildMessagesView onBack={() => setShowChildMessages(false)} isMobile />;
    }

    // Chat view
    if (selected) {
      if (selected.type === 'dm' && selected.contact) {
        return <ChatWindow contact={selected.contact} conversationId={selected.id} onBack={handleBack} onRead={handleThreadRead} />;
      }
      if (selected.type === 'group' && selected.group) {
        return (
          <GroupChatWindow
            group={selected.group}
            onBack={handleBack}
            onDeleted={() => { setSelected(null); refetchGroups(); }}
          />
        );
      }
    }

    // List view
    return (
      <>
        <ConversationList
          contacts={contacts}
          groups={groups}
          conversations={conversations}
          selected={null}
          onSelect={setSelected}
          onCreateGroup={() => setShowCreateGroup(true)}
          loading={convoLoading || groupsLoading}
          canCreateGroups={canCreateGroups}
          onCompose={() => setShowCompose(true)}
          onViewChildMessages={canViewChildMessages ? () => setShowChildMessages(true) : undefined}
          childMessagesLabel={childMessagesLabel}
          isMobile
        />
        <CreateGroupModal
          visible={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
        <ComposeSheet
          visible={showCompose}
          onClose={() => setShowCompose(false)}
          contacts={contacts}
          loading={contactsLoading}
          onSelect={(contact) => {
            setShowCompose(false);
            // Match an existing conversation if present so the chat opens with
            // its real id; otherwise fall back to the contact id (the chat
            // window will create one on first send).
            const convo = conversations.find((c: any) => c.other_user?.id === contact.id);
            setSelected({ id: convo?.id || contact.id, type: 'dm', contact });
          }}
        />
      </>
    );
  }

  // ── Desktop: split-panel ──
  return (
    <View className="flex-1 flex-row bg-surface-50 dark:bg-dark-surface-50" style={{ height: '100%' as any }}>
      {/* Left: Conversation list */}
      <ConversationList
        contacts={contacts}
        groups={groups}
        conversations={conversations}
        selected={selected}
        onSelect={(conv) => { setShowChildMessages(false); setSelected(conv); }}
        onCreateGroup={() => setShowCreateGroup(true)}
        loading={convoLoading || groupsLoading}
        canCreateGroups={canCreateGroups}
        onCompose={() => setShowCompose(true)}
        onViewChildMessages={canViewChildMessages ? () => { setSelected(null); setShowChildMessages(true); } : undefined}
        childMessagesLabel={childMessagesLabel}
      />

      {/* Right: Chat window — capped so it stays readable on ultra-wide screens */}
      <View className="flex-1 items-center bg-white dark:bg-dark-surface-100">
        <View className="flex-1 w-full max-w-4xl">
        {showChildMessages ? (
          <ChildMessagesView onBack={() => setShowChildMessages(false)} />
        ) : selected?.type === 'dm' && selected.contact ? (
          <ChatWindow contact={selected.contact} conversationId={selected.id} onRead={handleThreadRead} />
        ) : selected?.type === 'group' && selected.group ? (
          <GroupChatWindow
            group={selected.group}
            onDeleted={() => { setSelected(null); refetchGroups(); }}
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-white dark:bg-dark-surface-100">
            <Ionicons name="chatbubbles-outline" size={64} color={c.border} />
            <Heading size="md" className="text-typo-500 mt-4 dark:text-dark-typo-500">
              Select a conversation
            </Heading>
            <UIText size="sm" className="text-typo-400 mt-2 dark:text-dark-typo-400">
              Choose a contact or group to start messaging
            </UIText>
          </View>
        )}
        </View>
      </View>

      {/* Create Group Modal */}
      <CreateGroupModal
        visible={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onCreated={handleGroupCreated}
      />

      {/* Compose new DM (contact picker) */}
      <ComposeSheet
        visible={showCompose}
        onClose={() => setShowCompose(false)}
        contacts={contacts}
        loading={contactsLoading}
        onSelect={(contact) => {
          setShowCompose(false);
          const convo = conversations.find((c: any) => c.other_user?.id === contact.id);
          setShowChildMessages(false);
          setSelected({ id: convo?.id || contact.id, type: 'dm', contact });
        }}
      />
    </View>
  );
}
