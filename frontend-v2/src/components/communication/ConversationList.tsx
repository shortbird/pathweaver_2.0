/**
 * ConversationList - Shows DM contacts and group chats.
 * Desktop: fixed-width sidebar panel.
 * Mobile: full-screen list with PageHeader.
 */

import React, { useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Heading, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { useThemeColors } from '@/src/hooks/useThemeColors';
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
  /** Compose button opens the contact picker for a new DM. */
  onCompose?: () => void;
  /** When provided, shows a "My children's messages" entry point (parents). */
  onViewChildMessages?: () => void;
  /** Title for the child-messages entry point; defaults to the generic label. */
  childMessagesLabel?: string;
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
  onCompose,
  onViewChildMessages,
  childMessagesLabel,
}: Props) {
  const c = useThemeColors();
  const [search, setSearch] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  // Tap the active Messages tab to scroll the conversation list back to top.
  useScrollToTop(scrollRef);

  // Active DMs: derived from `conversations` (always loaded first) and enriched
  // with contact metadata (relationship chip, is_support flag) when contacts is
  // available. Optio Support pinned at the top even without a thread.
  //
  // The full contact directory is reached via the compose button -> ComposeSheet
  // — rendering every contact inline made the Messages screen feel heavy and
  // unlike WhatsApp/Messages.
  const activeContacts = useMemo(() => {
    const contactMap = new Map<string, Contact>();
    contacts.forEach((c) => { contactMap.set(c.id, c); });

    const items = (conversations || [])
      .filter((c: any) => c.other_user?.id)
      .map((c: any): any => {
        const contact = contactMap.get(c.other_user.id);
        return {
          id: c.other_user.id,
          display_name: c.other_user.display_name,
          first_name: c.other_user.first_name,
          last_name: c.other_user.last_name,
          avatar_url: c.other_user.avatar_url,
          role: c.other_user.role,
          relationship: contact?.relationship || '',
          is_support: contact?.is_support || false,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          unread_count: c.unread_count || 0,
          conversation_id: c.id,
        };
      });

    items.sort((a, b) => {
      if (a.unread_count && !b.unread_count) return -1;
      if (!a.unread_count && b.unread_count) return 1;
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      return 0;
    });

    // Pin Optio Support to the top even without a thread, so support is always
    // one tap away. Only possible once contacts has loaded.
    const support = contacts.find((c) => c.is_support);
    const hasSupportThread = items.some((i) => i.is_support);
    if (support && !hasSupportThread) {
      items.unshift({
        id: support.id,
        display_name: support.display_name,
        first_name: support.first_name,
        last_name: support.last_name,
        avatar_url: support.avatar_url,
        role: support.role,
        relationship: support.relationship,
        is_support: true,
        last_message_at: null,
        last_message_preview: null,
        unread_count: 0,
        conversation_id: support.id,
      });
    }

    return items;
  }, [contacts, conversations]);

  // Filter by search
  const filteredContacts = useMemo(() => {
    if (!search.trim()) return activeContacts;
    const q = search.toLowerCase().trim();
    return activeContacts.filter((c) =>
      getDisplayName(c).toLowerCase().includes(q)
    );
  }, [activeContacts, search]);

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

  const renderContact = (contact: any) => {
    const name = contact.is_support ? 'Optio Support' : getDisplayName(contact);
    const isSelected = !isMobile && selected?.type === 'dm' && selected?.id === contact.conversation_id;
    const relColor = contact.is_support ? '#6D469B' : (relationshipColors[contact.relationship] || '#6B7280');

    return (
      <Pressable
        key={contact.id}
        onPress={() => onSelect({ id: contact.conversation_id, type: 'dm', contact })}
        className={`flex-row items-center px-4 py-3 active:bg-surface-100 dark:active:bg-dark-surface-200 ${isSelected ? 'bg-optio-purple/5' : ''}`}
        style={isSelected ? { borderLeftWidth: 3, borderLeftColor: '#6D469B' } : undefined}
      >
        {contact.is_support ? (
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#6D469B' }}
          >
            <Ionicons name="headset" size={22} color="#fff" />
          </View>
        ) : (
          <Avatar size="md">
            {contact.avatar_url ? (
              <AvatarImage source={{ uri: contact.avatar_url }} />
            ) : (
              <AvatarFallbackText>{getInitial(name)}</AvatarFallbackText>
            )}
          </Avatar>
        )}
        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1">
              <UIText
                size="sm"
                className={`font-poppins-semibold ${contact.unread_count ? 'text-typo-900' : 'text-typo-700 dark:text-dark-typo-700'}`}
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
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-2">
                {formatTime(contact.last_message_at)}
              </UIText>
            )}
          </View>
          <UIText
            size="xs"
            className={`mt-0.5 ${contact.unread_count ? 'text-typo-700 dark:text-dark-typo-700 font-poppins-medium' : 'text-typo-400 dark:text-dark-typo-400'}`}
            numberOfLines={1}
          >
            {contact.last_message_preview ||
              (contact.is_support ? 'Questions? Message the Optio team' : 'Start a conversation')}
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
          <Ionicons name="chevron-forward" size={16} color={c.iconMuted} style={{ marginLeft: 4 }} />
        )}
      </Pressable>
    );
  };

  const Container: any = isMobile ? SafeAreaView : View;
  const containerProps: any = isMobile
    ? { className: 'flex-1 bg-white dark:bg-dark-surface-100', edges: ['top'] }
    : { className: 'flex-1 bg-white dark:bg-dark-surface-100 border-r border-surface-200 dark:border-dark-surface-300', style: { minWidth: 320, maxWidth: 380 } };

  return (
    <Container {...containerProps}>
      {/* Header */}
      {isMobile ? (
        <PageHeader title="Messages" />
      ) : (
        <View className="p-4 border-b border-surface-200 dark:border-dark-surface-300 flex-row items-center justify-between">
          <Heading size="lg">Messages</Heading>
          {onCompose && (
            <Pressable onPress={onCompose} accessibilityLabel="New message" hitSlop={8} className="p-1">
              <Ionicons name="create-outline" size={22} color="#6D469B" />
            </Pressable>
          )}
        </View>
      )}

      {/* Search + compose */}
      <View className="px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center bg-surface-100 dark:bg-dark-surface-200 rounded-xl px-3 py-2.5">
          <Ionicons name="search-outline" size={18} color={c.iconMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations..."
            placeholderTextColor={c.textFaint}
            className="flex-1 ml-2 font-poppins text-sm text-typo dark:text-dark-typo"
            style={{ outline: 'none', padding: 0, textAlignVertical: 'center', includeFontPadding: false } as any}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={c.iconMuted} />
            </Pressable>
          )}
        </View>
        {isMobile && onCompose && (
          <Pressable
            onPress={onCompose}
            accessibilityLabel="New message"
            hitSlop={8}
            className="w-10 h-10 rounded-full items-center justify-center bg-optio-purple/10 active:bg-optio-purple/20"
          >
            <Ionicons name="create-outline" size={20} color="#6D469B" />
          </Pressable>
        )}
      </View>

      <ScrollView ref={scrollRef} className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Group Chats Section */}
        {(filteredGroups.length > 0 || canCreateGroups) && (
          <View>
            <View className="flex-row items-center justify-between px-4 py-2 bg-surface-50 dark:bg-dark-surface-50 border-b border-surface-200 dark:border-dark-surface-300">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="people-outline" size={14} color={c.icon} />
                <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 uppercase tracking-wider">
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
                  className={`flex-row items-center px-4 py-3 active:bg-surface-100 dark:active:bg-dark-surface-200 ${isSelected ? 'bg-optio-purple/5' : ''}`}
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
                        className={`font-poppins-semibold ${group.unread_count ? 'text-typo-900' : 'text-typo-700 dark:text-dark-typo-700'}`}
                        numberOfLines={1}
                      >
                        {group.name}
                      </UIText>
                      {group.last_message_at && (
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-2">
                          {formatTime(group.last_message_at)}
                        </UIText>
                      )}
                    </View>
                    <UIText
                      size="xs"
                      className={`mt-0.5 ${group.unread_count ? 'text-typo-700 dark:text-dark-typo-700 font-poppins-medium' : 'text-typo-400 dark:text-dark-typo-400'}`}
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
                    <Ionicons name="chevron-forward" size={16} color={c.iconMuted} style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Parent entry point: view a child's message history (read-only) */}
        {onViewChildMessages && (
          <Pressable
            onPress={onViewChildMessages}
            className="flex-row items-center px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 active:bg-surface-100 dark:active:bg-dark-surface-200"
          >
            <View className="w-10 h-10 rounded-full items-center justify-center bg-optio-purple/10">
              <Ionicons name="people-circle-outline" size={22} color="#6D469B" />
            </View>
            <View className="flex-1 ml-3">
              <UIText size="sm" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700">
                {childMessagesLabel || "My children's messages"}
              </UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
                View your child's conversations (read-only)
              </UIText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
          </Pressable>
        )}

        {/* Direct Messages Section — existing conversations (+ Optio Support pinned).
            The full contact directory is reached via the compose button (top-right). */}
        {filteredContacts.length > 0 && (
          <View>
            <View className="flex-row items-center px-4 py-2 bg-surface-50 dark:bg-dark-surface-50 border-b border-surface-200 dark:border-dark-surface-300">
              <Ionicons name="chatbubble-outline" size={14} color={c.icon} />
              <UIText size="xs" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500 uppercase tracking-wider ml-1.5">
                Direct Messages
              </UIText>
            </View>
            {filteredContacts.map(renderContact)}
          </View>
        )}

        {/* Empty state */}
        {filteredContacts.length === 0 && filteredGroups.length === 0 && (
          <View className="items-center py-10 px-4">
            <Ionicons name="chatbubbles-outline" size={40} color={c.iconMuted} />
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-3 text-center">
              {search ? 'No conversations match your search' : 'No conversations yet. Tap the compose button to start one.'}
            </UIText>
          </View>
        )}
      </ScrollView>
    </Container>
  );
}
