/**
 * ConversationList - Shows DM contacts and group chats.
 * Desktop: fixed-width sidebar panel.
 * Mobile: full-screen list with PageHeader.
 */

import React, { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Heading, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import type { Contact, Group } from '@/src/hooks/useMessages';

interface SelectedConversation {
  id: string;
  type: 'dm' | 'group';
  contact?: Contact;
  group?: Group;
}

interface Props {
  contacts: Contact[];
  groups: Group[];
  conversations: any[];
  selected: SelectedConversation | null;
  onSelect: (conv: SelectedConversation) => void;
  onCreateGroup: () => void;
  loading: boolean;
  canCreateGroups: boolean;
  isMobile?: boolean;
}

function formatTime(timestamp: string | null) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDisplayName(contact: Contact) {
  const full = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  return full || contact.display_name || 'Unknown';
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase() || '?';
}

const relationshipColors: Record<string, string> = {
  advisor: '#3B82F6',
  student: '#6D469B',
  child: '#10B981',
  observer: '#F59E0B',
  org_admin: '#EF4444',
};

export function ConversationList({
  contacts,
  groups,
  conversations,
  selected,
  onSelect,
  onCreateGroup,
  loading,
  canCreateGroups,
  isMobile,
}: Props) {
  const [search, setSearch] = useState('');

  // Merge contacts with conversation data (for last message preview / unread)
  const contactsWithMeta = useMemo(() => {
    const convoMap = new Map<string, any>();
    (conversations || []).forEach((c: any) => {
      if (c.other_user?.id) convoMap.set(c.other_user.id, c);
    });

    return contacts.map((contact) => {
      const convo = convoMap.get(contact.id);
      return {
        ...contact,
        last_message_at: convo?.last_message_at || null,
        last_message_preview: convo?.last_message_preview || null,
        unread_count: convo?.unread_count || 0,
        conversation_id: convo?.id || contact.id,
      };
    }).sort((a, b) => {
      // Unread first, then by recent message
      if (a.unread_count && !b.unread_count) return -1;
      if (!a.unread_count && b.unread_count) return 1;
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      if (a.last_message_at) return -1;
      if (b.last_message_at) return 1;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    });
  }, [contacts, conversations]);

  // Filter by search
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contactsWithMeta;
    const q = search.toLowerCase().trim();
    return contactsWithMeta.filter((c) =>
      getDisplayName(c).toLowerCase().includes(q)
    );
  }, [contactsWithMeta, search]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase().trim();
    return groups.filter((g) => g.name?.toLowerCase().includes(q));
  }, [groups, search]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <View className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
      </View>
    );
  }

  const containerStyle = isMobile
    ? 'flex-1 bg-white'
    : 'flex-1 bg-white border-r border-surface-200';

  return (
    <View className={containerStyle} style={isMobile ? undefined : { minWidth: 320, maxWidth: 380 }}>
      {/* Header */}
      {isMobile ? (
        <PageHeader title="Messages" />
      ) : (
        <View className="p-4 border-b border-surface-200">
          <Heading size="lg">Messages</Heading>
        </View>
      )}

      {/* Search */}
      <View className="px-4 py-3 border-b border-surface-200">
        <View className="flex-row items-center bg-surface-100 rounded-xl px-3 py-2.5">
          <Ionicons name="search-outline" size={18} color="#9A93A8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations..."
            placeholderTextColor="#9A93A8"
            className="flex-1 ml-2 font-poppins text-sm"
            style={{ outline: 'none' } as any}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9A93A8" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Group Chats Section */}
        {(filteredGroups.length > 0 || canCreateGroups) && (
          <View>
            <View className="flex-row items-center justify-between px-4 py-2 bg-surface-50 border-b border-surface-200">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="people-outline" size={14} color="#6B7280" />
                <UIText size="xs" className="font-poppins-semibold text-typo-500 uppercase tracking-wider">
                  Groups
                </UIText>
              </View>
              {canCreateGroups && (
                <Pressable onPress={onCreateGroup} className="p-1">
                  <Ionicons name="add-circle-outline" size={20} color="#6D469B" />
                </Pressable>
              )}
            </View>
            {filteredGroups.map((group) => {
              const isSelected = !isMobile && selected?.type === 'group' && selected?.id === group.id;
              return (
                <Pressable
                  key={group.id}
                  onPress={() => onSelect({ id: group.id, type: 'group', group })}
                  className={`flex-row items-center px-4 py-3 active:bg-surface-100 ${isSelected ? 'bg-optio-purple/5' : ''}`}
                  style={isSelected ? { borderLeftWidth: 3, borderLeftColor: '#6D469B' } : undefined}
                >
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: '#6D469B' }}
                  >
                    <Ionicons name="people" size={22} color="#fff" />
                  </View>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center justify-between">
                      <UIText
                        size="sm"
                        className={`font-poppins-semibold ${group.unread_count ? 'text-typo-900' : 'text-typo-700'}`}
                        numberOfLines={1}
                      >
                        {group.name}
                      </UIText>
                      {group.last_message_at && (
                        <UIText size="xs" className="text-typo-400 ml-2">
                          {formatTime(group.last_message_at)}
                        </UIText>
                      )}
                    </View>
                    <UIText
                      size="xs"
                      className={`mt-0.5 ${group.unread_count ? 'text-typo-700 font-poppins-medium' : 'text-typo-400'}`}
                      numberOfLines={1}
                    >
                      {group.last_message_preview || `${group.member_count || 0} members`}
                    </UIText>
                  </View>
                  {group.unread_count > 0 && (
                    <View className="bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center ml-2 px-1">
                      <UIText size="xs" className="text-white font-poppins-bold" style={{ fontSize: 10 }}>
                        {group.unread_count > 9 ? '9+' : group.unread_count}
                      </UIText>
                    </View>
                  )}
                  {isMobile && (
                    <Ionicons name="chevron-forward" size={16} color="#CEC6D6" style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Direct Messages Section */}
        <View>
          <View className="flex-row items-center px-4 py-2 bg-surface-50 border-b border-surface-200">
            <Ionicons name="chatbubble-outline" size={14} color="#6B7280" />
            <UIText size="xs" className="font-poppins-semibold text-typo-500 uppercase tracking-wider ml-1.5">
              Direct Messages
            </UIText>
          </View>
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => {
              const name = getDisplayName(contact);
              const isSelected = !isMobile && selected?.type === 'dm' && selected?.id === contact.conversation_id;
              const relColor = relationshipColors[contact.relationship] || '#6B7280';

              return (
                <Pressable
                  key={contact.id}
                  onPress={() => onSelect({ id: contact.conversation_id, type: 'dm', contact })}
                  className={`flex-row items-center px-4 py-3 active:bg-surface-100 ${isSelected ? 'bg-optio-purple/5' : ''}`}
                  style={isSelected ? { borderLeftWidth: 3, borderLeftColor: '#6D469B' } : undefined}
                >
                  <Avatar size="md">
                    {contact.avatar_url ? (
                      <AvatarImage source={{ uri: contact.avatar_url }} />
                    ) : (
                      <AvatarFallbackText>{getInitial(name)}</AvatarFallbackText>
                    )}
                  </Avatar>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2 flex-1">
                        <UIText
                          size="sm"
                          className={`font-poppins-semibold ${contact.unread_count ? 'text-typo-900' : 'text-typo-700'}`}
                          numberOfLines={1}
                        >
                          {name}
                        </UIText>
                        {contact.relationship && (
                          <View
                            style={{ backgroundColor: `${relColor}15`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}
                          >
                            <UIText size="xs" style={{ color: relColor, fontSize: 10, fontFamily: 'Poppins_500Medium' }}>
                              {contact.relationship}
                            </UIText>
                          </View>
                        )}
                      </View>
                      {contact.last_message_at && (
                        <UIText size="xs" className="text-typo-400 ml-2">
                          {formatTime(contact.last_message_at)}
                        </UIText>
                      )}
                    </View>
                    <UIText
                      size="xs"
                      className={`mt-0.5 ${contact.unread_count ? 'text-typo-700 font-poppins-medium' : 'text-typo-400'}`}
                      numberOfLines={1}
                    >
                      {contact.last_message_preview || 'Start a conversation'}
                    </UIText>
                  </View>
                  {contact.unread_count > 0 && (
                    <View className="bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center ml-2 px-1">
                      <UIText size="xs" className="text-white font-poppins-bold" style={{ fontSize: 10 }}>
                        {contact.unread_count > 9 ? '9+' : contact.unread_count}
                      </UIText>
                    </View>
                  )}
                  {isMobile && (
                    <Ionicons name="chevron-forward" size={16} color="#CEC6D6" style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              );
            })
          ) : (
            <View className="items-center py-10 px-4">
              <Ionicons name="chatbubbles-outline" size={40} color="#CEC6D6" />
              <UIText size="sm" className="text-typo-400 mt-3 text-center">
                {search ? 'No contacts match your search' : 'No contacts available'}
              </UIText>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
