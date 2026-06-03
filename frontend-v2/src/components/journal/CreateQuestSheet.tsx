/**
 * CreateQuestSheet - Bottom sheet for creating a private quest.
 *
 * Default (student): POST /api/quests/create — the quest is private and the
 * student is auto-enrolled, so they can add moments and tasks immediately.
 *
 * Parent-for-child (`forChild` set): the same sheet/UI creates the quest via
 * the family endpoint and enrolls the child, then lands the parent on the
 * parent quest view so they can add tasks/evidence on the kid's behalf.
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
  /** When set, create the quest FOR this child (parent on-behalf-of flow):
   *  routes through the family endpoint, enrolls the child, and opens the
   *  parent quest view instead of the student quest page. */
  forChild?: { id: string; name?: string };
}

export function CreateQuestSheet({ visible, onClose, onCreated, forChild }: CreateQuestSheetProps) {
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
      const body = {
        title: title.trim(),
        // Description is optional — backend falls back to title when empty.
        ...(trimmedDesc ? { description: trimmedDesc } : {}),
      };

      // Parent-for-child: create via family endpoint, then enroll the child.
      if (forChild) {
        const { data } = await api.post('/api/family/quests/create', body);
        const questId = data.quest_id || data.quest?.id;
        if (questId) {
          await api.post(`/api/family/quests/${questId}/enroll-children`, { child_ids: [forChild.id] });
        }
        reset();
        onClose();
        if (questId) {
          onCreated?.(questId);
          router.push(`/parent/quest/${forChild.id}/${questId}` as any);
        }
        return;
      }

      // Student: create their own quest and open the student quest page.
      const { data } = await api.post('/api/quests/create', body);
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
          <Heading size="lg">{forChild ? `Create a quest for ${forChild.name || 'your child'}` : 'Create your own quest'}</Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
          {forChild
            ? `Build a quest around something ${forChild.name || 'your child'} wants to learn. It stays private to your family — you can add tasks and evidence as you go.`
            : 'Build a quest around something you want to learn. It stays private to you — you can add tasks and moments as you go.'}
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
