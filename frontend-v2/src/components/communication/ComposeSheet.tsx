/**
 * ComposeSheet - "New message" bottom sheet for picking a contact to DM.
 *
 * The Messages screen used to render the entire contact directory inline below
 * existing conversations ("Start a conversation" section), which made the page
 * feel heavy and unlike WhatsApp/Messages. Now the directory lives behind a
 * compose button, lazily, so the default Messages view shows only active
 * threads.
 */

import React, { useMemo, useState } from 'react';
import { View, Pressable, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, Avatar, AvatarFallbackText, AvatarImage, BottomSheet } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { Contact } from '@/src/hooks/useMessages';

interface Props {
  visible: boolean;
  onClose: () => void;
  contacts: Contact[];
  loading: boolean;
  onSelect: (contact: Contact) => void;
}

function getDisplayName(contact: Contact) {
  const full = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  return full || contact.display_name || 'Unknown';
}

const relationshipColors: Record<string, string> = {
  advisor: '#3B82F6',
  student: '#6D469B',
  child: '#10B981',
  observer: '#F59E0B',
  org_admin: '#EF4444',
};

export function ComposeSheet({ visible, onClose, contacts, loading, onSelect }: Props) {
  const c = useThemeColors();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      // Optio Support always pinned
      if (a.is_support && !b.is_support) return -1;
      if (!a.is_support && b.is_support) return 1;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    });
    if (!search.trim()) return sorted;
    const q = search.toLowerCase().trim();
    return sorted.filter((c) => getDisplayName(c).toLowerCase().includes(q));
  }, [contacts, search]);

  const renderItem = ({ item }: { item: Contact }) => {
    const name = item.is_support ? 'Optio Support' : getDisplayName(item);
    const relColor = item.is_support ? '#6D469B' : (relationshipColors[item.relationship] || '#6B7280');
    return (
      <Pressable
        onPress={() => { onSelect(item); }}
        className="flex-row items-center px-4 py-3 active:bg-surface-100 dark:active:bg-dark-surface-200"
      >
        {item.is_support ? (
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: '#6D469B' }}
          >
            <Ionicons name="headset" size={22} color="#fff" />
          </View>
        ) : (
          <Avatar size="md">
            {item.avatar_url ? (
              <AvatarImage source={{ uri: item.avatar_url }} />
            ) : (
              <AvatarFallbackText>{name.charAt(0).toUpperCase() || '?'}</AvatarFallbackText>
            )}
          </Avatar>
        )}
        <View className="flex-1 ml-3">
          <View className="flex-row items-center gap-2">
            <UIText
              size="sm"
              className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700"
              numberOfLines={1}
            >
              {name}
            </UIText>
            {item.relationship && (
              <View
                style={{ backgroundColor: `${relColor}15`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}
              >
                <UIText size="xs" style={{ color: relColor, fontSize: 10, fontFamily: 'Poppins_500Medium' }}>
                  {item.relationship}
                </UIText>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <UIText size="md" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700">New message</UIText>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={c.icon} />
        </Pressable>
      </View>

      <View className="px-4 pb-3">
        <View className="flex-row items-center bg-surface-100 dark:bg-dark-surface-200 rounded-xl px-3 py-2.5">
          <Ionicons name="search-outline" size={18} color={c.iconMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts..."
            placeholderTextColor={c.textFaint}
            className="flex-1 ml-2 font-poppins text-sm text-typo dark:text-dark-typo"
            style={{ outline: 'none', padding: 0, textAlignVertical: 'center', includeFontPadding: false } as any}
            autoFocus
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={c.iconMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View className="items-center justify-center py-10">
          <View className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={{ maxHeight: 480 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View className="items-center py-10 px-4">
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                {search ? 'No contacts match your search' : 'No contacts available'}
              </UIText>
            </View>
          }
        />
      )}
    </BottomSheet>
  );
}
