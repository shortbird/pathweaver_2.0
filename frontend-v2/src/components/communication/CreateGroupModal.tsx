/**
 * CreateGroupModal - Modal for creating a new group chat.
 * Only visible to advisors, org_admins, and superadmins.
 * Web-only component.
 */

import React, { useState, useMemo } from 'react';
import { View, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  UIText, Heading, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { useContacts, createGroup, type Contact } from '@/src/hooks/useMessages';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (group: any) => void;
}

function getDisplayName(c: Contact) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.display_name || 'Unknown';
}

export function CreateGroupModal({ visible, onClose, onCreated }: Props) {
  const { contacts } = useContacts();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => getDisplayName(c).toLowerCase().includes(q));
  }, [contacts, search]);

  const toggle = (contact: Contact) => {
    setSelected((prev) => {
      if (prev.some((c) => c.id === contact.id)) {
        return prev.filter((c) => c.id !== contact.id);
      }
      return [...prev, contact];
    });
  };

  const handleCreate = async () => {
    setError('');
    if (!name.trim()) { setError('Group name is required'); return; }
    if (name.length > 100) { setError('Group name must be 100 characters or less'); return; }

    try {
      setCreating(true);
      const result = await createGroup(
        name.trim(),
        description.trim() || undefined,
        selected.map((c) => c.id),
      );
      onCreated(result.group || result);
      reset();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    setName('');
    setDescription('');
    setSearch('');
    setSelected([]);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={handleClose}
      >
        <Pressable
          style={{ width: 480, maxHeight: '85%' }}
          className="bg-white rounded-2xl overflow-hidden shadow-xl"
          onPress={() => {}} // prevent close on inner press
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-surface-200">
            <Heading size="md">Create Group Chat</Heading>
            <Pressable onPress={handleClose} className="p-1">
              <Ionicons name="close" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" contentContainerStyle={{ gap: 16 }}>
            {/* Error */}
            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <UIText size="sm" className="text-red-700">{error}</UIText>
              </View>
            ) : null}

            {/* Group Name */}
            <View>
              <UIText size="sm" className="font-poppins-medium text-typo-700 mb-1">
                Group Name *
              </UIText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter group name"
                placeholderTextColor="#9CA3AF"
                maxLength={100}
                className="border border-surface-200 rounded-lg px-3 py-2.5 font-poppins text-sm"
                style={{ outline: 'none' } as any}
              />
              <UIText size="xs" className="text-typo-400 mt-1">{name.length}/100</UIText>
            </View>

            {/* Description */}
            <View>
              <UIText size="sm" className="font-poppins-medium text-typo-700 mb-1">
                Description (optional)
              </UIText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What's this group about?"
                placeholderTextColor="#9CA3AF"
                maxLength={500}
                multiline
                numberOfLines={2}
                className="border border-surface-200 rounded-lg px-3 py-2.5 font-poppins text-sm"
                style={{ outline: 'none', minHeight: 60 } as any}
              />
            </View>

            {/* Selected Members */}
            {selected.length > 0 && (
              <View className="flex-row flex-wrap gap-2">
                {selected.map((c) => (
                  <View
                    key={c.id}
                    className="flex-row items-center gap-1 bg-optio-purple/10 rounded-full px-3 py-1"
                  >
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">
                      {getDisplayName(c)}
                    </UIText>
                    <Pressable onPress={() => toggle(c)}>
                      <Ionicons name="close-circle" size={16} color="#6D469B" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Member Search */}
            <View>
              <UIText size="sm" className="font-poppins-medium text-typo-700 mb-1">
                Add Members (optional)
              </UIText>
              <View className="flex-row items-center bg-surface-100 rounded-lg px-3 py-2 mb-2">
                <Ionicons name="search-outline" size={16} color="#9CA3AF" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search contacts..."
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 ml-2 font-poppins text-sm"
                  style={{ outline: 'none' } as any}
                />
              </View>

              <View className="border border-surface-200 rounded-lg overflow-hidden" style={{ maxHeight: 200 }}>
                <ScrollView>
                  {filtered.length > 0 ? (
                    filtered.map((c) => {
                      const isSelected = selected.some((s) => s.id === c.id);
                      const cName = getDisplayName(c);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => toggle(c)}
                          className={`flex-row items-center px-3 py-2.5 ${isSelected ? 'bg-optio-purple/5' : ''}`}
                        >
                          <Avatar size="sm">
                            {c.avatar_url ? (
                              <AvatarImage source={{ uri: c.avatar_url }} />
                            ) : (
                              <AvatarFallbackText>{cName.charAt(0).toUpperCase()}</AvatarFallbackText>
                            )}
                          </Avatar>
                          <UIText size="sm" className="flex-1 ml-2 text-typo-900">
                            {cName}
                          </UIText>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6D469B" />}
                        </Pressable>
                      );
                    })
                  ) : (
                    <View className="items-center py-4">
                      <UIText size="sm" className="text-typo-400">
                        {search ? 'No contacts found' : 'No contacts available'}
                      </UIText>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="flex-row justify-end gap-3 px-5 py-4 border-t border-surface-200">
            <Pressable onPress={handleClose} className="px-4 py-2.5 rounded-lg">
              <UIText size="sm" className="text-typo-600 font-poppins-medium">Cancel</UIText>
            </Pressable>
            <Button
              size="md"
              onPress={handleCreate}
              isDisabled={creating || !name.trim()}
            >
              <ButtonText>{creating ? 'Creating...' : 'Create Group'}</ButtonText>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
