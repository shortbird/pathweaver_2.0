/**
 * Messages - Communication hub with DMs and group chats.
 * Mobile: texting-app UX (full-screen list → full-screen chat).
 * Desktop: split-panel (list on left, chat on right).
 */

import React, { useState, useEffect } from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Heading } from '@/src/components/ui';
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

const DESKTOP_BREAKPOINT = 768;

interface SelectedConversation {
  id: string;
  type: 'dm' | 'group';
  contact?: Contact;
  group?: Group;
}

export default function MessagesScreen() {
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isMobile = !isDesktop;

  const { conversations, loading: convoLoading, refetch: refetchConversations } = useConversations();
  const { contacts, loading: contactsLoading } = useContacts();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups();

  const [selected, setSelected] = useState<SelectedConversation | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);

  // Hide tab bar when in a conversation on mobile
  useEffect(() => {
    if (!isMobile) return;
    setTabBarHidden(!!selected);
    return () => setTabBarHidden(false);
  }, [selected, isMobile, setTabBarHidden]);

  // Check if user can create groups (advisor, org_admin, superadmin)
  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role;
  const canCreateGroups = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole || '');

  const handleGroupCreated = (group: any) => {
    refetchGroups();
    setSelected({ id: group.id, type: 'group', group });
  };

  const handleBack = () => setSelected(null);

  // ── Mobile: full-screen list or full-screen chat ──
  if (isMobile) {
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
    <View className="flex-1 flex-row bg-surface-50" style={{ height: '100%' as any }}>
      {/* Left: Conversation list */}
      <ConversationList
        contacts={contacts}
        groups={groups}
        conversations={conversations}
        selected={selected}
        onSelect={setSelected}
        onCreateGroup={() => setShowCreateGroup(true)}
        loading={convoLoading || contactsLoading || groupsLoading}
        canCreateGroups={canCreateGroups}
      />

      {/* Right: Chat window */}
      <View className="flex-1">
        {selected?.type === 'dm' && selected.contact ? (
          <ChatWindow contact={selected.contact} conversationId={selected.id} />
        ) : selected?.type === 'group' && selected.group ? (
          <GroupChatWindow group={selected.group} />
        ) : (
          <View className="flex-1 items-center justify-center bg-white">
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Heading size="md" className="text-typo-500 mt-4">
              Select a conversation
            </Heading>
            <UIText size="sm" className="text-typo-400 mt-2">
              Choose a contact or group to start messaging
            </UIText>
          </View>
        )}
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
