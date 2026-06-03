/**
 * CreateQuestSheet - Bottom sheet for a student to create their own private quest.
 *
 * POST /api/quests/create accepts a title + description from any authenticated
 * user. The quest is created private (is_public=false) and the user is
 * auto-enrolled, so they can start adding moments and tasks immediately.
 */

import React, { useState } from 'react';
import { View, TextInput, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface CreateQuestSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (questId: string) => void;
}

export function CreateQuestSheet({ visible, onClose, onCreated }: CreateQuestSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const c = useThemeColors();

  const reset = () => { setTitle(''); setDescription(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const trimmedDesc = description.trim();
      const { data } = await api.post('/api/quests/create', {
        title: title.trim(),
        // Description is optional — backend falls back to title when empty.
        ...(trimmedDesc ? { description: trimmedDesc } : {}),
      });
      const questId = data.quest_id || data.quest?.id;
      reset();
      onClose();
      if (questId) {
        onCreated?.(questId);
        router.push(`/(app)/quests/${questId}`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error
        || 'Could not create that quest. Try a different title.';
      Alert.alert('Error', typeof msg === 'string' ? msg : 'Could not create quest.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">Create your own quest</Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
          Build a quest around something you want to learn. It stays private to you — you can add tasks and moments as you go.
        </UIText>

        <VStack space="xs">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
            Title
          </UIText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Build my first drone"
            placeholderTextColor={c.textFaint}
            className="bg-surface-50 dark:bg-dark-surface-50 text-typo dark:text-dark-typo rounded-xl p-4 text-base font-poppins"
            maxLength={120}
            autoFocus
          />
        </VStack>

        <VStack space="xs">
          <HStack className="items-baseline gap-2">
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
              What's it about?
            </UIText>
            <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 normal-case">(optional)</UIText>
          </HStack>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A sentence or two about what you want to learn or do."
            placeholderTextColor={c.textFaint}
            multiline
            numberOfLines={4}
            className="bg-surface-50 dark:bg-dark-surface-50 text-typo dark:text-dark-typo rounded-xl p-4 text-base font-poppins min-h-[100px]"
            style={{ textAlignVertical: 'top' }}
            maxLength={1000}
          />
        </VStack>

        <Button
          size="lg"
          className="w-full"
          onPress={handleCreate}
          disabled={!title.trim() || saving}
          loading={saving}
        >
          <ButtonText>{saving ? 'Creating…' : 'Create Quest'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
