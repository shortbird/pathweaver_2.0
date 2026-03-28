/**
 * Messages - Communication hub with DMs and group chats.
 * Web-only page (not shown on mobile tabs).
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Heading } from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
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

interface SelectedConversation {
  id: string;
  type: 'dm' | 'group';
  contact?: Contact;
  group?: Group;
}

export default function MessagesScreen() {
  const { user } = useAuthStore();
  const { conversations, loading: convoLoading, refetch: refetchConversations } = useConversations();
  const { contacts, loading: contactsLoading } = useContacts();
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useGroups();

  const [selected, setSelected] = useState<SelectedConversation | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Check if user can create groups (advisor, org_admin, superadmin)
  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role;
  const canCreateGroups = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole || '');

  const handleGroupCreated = (group: any) => {
    refetchGroups();
    setSelected({ id: group.id, type: 'group', group });
  };

  return (
    <View className="flex-1 flex-row bg-surface-50" style={{ height: '100vh' }}>
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
