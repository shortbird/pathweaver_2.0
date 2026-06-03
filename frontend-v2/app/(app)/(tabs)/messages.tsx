/**
 * Messages - Communication hub with DMs and group chats.
 * Mobile: texting-app UX (full-screen list → full-screen chat).
 * Desktop: split-panel (list on left, chat on right).
 */

import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
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
  type Contact,
  type Group,
} from '@/src/hooks/useMessages';
import { ConversationList } from '@/src/components/communication/ConversationList';
import { ChatWindow } from '@/src/components/communication/ChatWindow';
import { GroupChatWindow } from '@/src/components/communication/GroupChatWindow';
import { CreateGroupModal } from '@/src/components/communication/CreateGroupModal';
import { ChildMessagesView } from '@/src/components/communication/ChildMessagesView';

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

  const { conversations, loading: convoLoading, refetch: refetchConversations } = useConversations();
  const { contacts, loading: contactsLoading } = useContacts();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups();

  const [selected, setSelected] = useState<SelectedConversation | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showChildMessages, setShowChildMessages] = useState(false);
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);

  // Hide tab bar when in a conversation or the child-messages view on mobile
  useEffect(() => {
    if (!isMobile) return;
    setTabBarHidden(!!selected || showChildMessages);
    return () => setTabBarHidden(false);
  }, [selected, showChildMessages, isMobile, setTabBarHidden]);

  // Check if user can create groups (advisor, org_admin, superadmin)
  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role;
  const canCreateGroups = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole || '');
  // Parents get the read-only "view my child's messages" entry point.
  const isParent = effectiveRole === 'parent';

  const handleGroupCreated = (group: any) => {
    refetchGroups();
    setSelected({ id: group.id, type: 'group', group });
  };

  const handleBack = () => setSelected(null);

  // ── Mobile: full-screen list or full-screen chat ──
  if (isMobile) {
    // Child message history view (parents, read-only)
    if (showChildMessages) {
      return <ChildMessagesView onBack={() => setShowChildMessages(false)} isMobile />;
    }

    // Chat view
    if (selected) {
      if (selected.type === 'dm' && selected.contact) {
        return <ChatWindow contact={selected.contact} conversationId={selected.id} onBack={handleBack} />;
      }
      if (selected.type === 'group' && selected.group) {
        return <GroupChatWindow group={selected.group} onBack={handleBack} />;
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
          loading={convoLoading || contactsLoading || groupsLoading}
          canCreateGroups={canCreateGroups}
          onViewChildMessages={isParent ? () => setShowChildMessages(true) : undefined}
          isMobile
        />
        <CreateGroupModal
          visible={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
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
        loading={convoLoading || contactsLoading || groupsLoading}
        canCreateGroups={canCreateGroups}
        onViewChildMessages={isParent ? () => { setSelected(null); setShowChildMessages(true); } : undefined}
      />

      {/* Right: Chat window — capped so it stays readable on ultra-wide screens */}
      <View className="flex-1 items-center bg-white dark:bg-dark-surface-100">
        <View className="flex-1 w-full max-w-4xl">
        {showChildMessages ? (
          <ChildMessagesView onBack={() => setShowChildMessages(false)} />
        ) : selected?.type === 'dm' && selected.contact ? (
          <ChatWindow contact={selected.contact} conversationId={selected.id} />
        ) : selected?.type === 'group' && selected.group ? (
          <GroupChatWindow group={selected.group} />
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
    </View>
  );
}
