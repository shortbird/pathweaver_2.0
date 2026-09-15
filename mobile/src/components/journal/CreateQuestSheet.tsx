/**
 * CreateQuestSheet - Bottom sheet for creating a private quest.
 *
 * Default (student): POST /api/quests/create — the quest is private and the
 * student is auto-enrolled, so they can add moments and tasks immediately.
 *
 * Parent-for-child (`forChild` set): the same sheet/UI creates the quest via
 * the family endpoint and enrolls the child, then lands the parent on the
 * parent quest view so they can add tasks/evidence on the kid's behalf.
 *
 * Family quest (`familyChildren` set): the same sheet with a picker of the
 * children, all ticked to start; the quest is created on the parent's
 * account and the ticked children enrolled, each working through their own
 * copy. The sheet stays on the Family tab afterwards -- there is no one
 * child's copy to land on.
 */

import React, { useEffect, useState } from 'react';
import { TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { showAlert } from '@/src/utils/alerts';
import { createFamilyQuest } from '@/src/hooks/useFamilyQuests';
import type { Child } from '@/src/types/family';

interface CreateQuestSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (questId: string) => void;
  /** When set, create the quest FOR this child (parent on-behalf-of flow):
   *  routes through the family endpoint, enrolls the child, and opens the
   *  parent quest view instead of the student quest page. */
  forChild?: { id: string; name?: string };
  /** When set, a family quest: pick which children to enroll. */
  familyChildren?: Child[];
}

export function CreateQuestSheet({ visible, onClose, onCreated, forChild, familyChildren }: CreateQuestSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const c = useThemeColors();
  const family = familyChildren && familyChildren.length > 0 ? familyChildren : null;

  // Every child ticked when the sheet opens; the parent unticks.
  useEffect(() => {
    if (visible && family) setPicked(new Set(family.map((k) => k.id)));
  }, [visible, family]);

  const reset = () => { setTitle(''); setDescription(''); };
  const handleClose = () => { reset(); onClose(); };
  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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

      // Family quest: on the parent's account, the ticked children enrolled.
      if (family) {
        const { questId, failed } = await createFamilyQuest(body, Array.from(picked));
        reset();
        onClose();
        if (failed.length) showAlert('Not everyone was added', failed[0]?.error || 'One child could not be enrolled.');
        if (questId) onCreated?.(questId);
        return;
      }

      // Parent-for-child: create via family endpoint, then enroll the child.
      if (forChild) {
        const { questId } = await createFamilyQuest(body, [forChild.id]);
        reset();
        onClose();
        if (questId) {
          onCreated?.(questId);
          // `new=1` tells the quest screen this quest was just authored, so it
          // opens the task wizard on its AI step. A brand-new quest has no
          // tasks and no template to copy from; landing on an empty list read
          // as "the AI didn't generate anything".
          router.push(`/parent/quest/${forChild.id}/${questId}?new=1` as any);
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
        router.push(`/(app)/quests/${questId}?new=1` as any);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.error
        || 'Could not create that quest. Try a different title.';
      showAlert('Error', typeof msg === 'string' ? msg : 'Could not create quest.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">
            {family ? 'New family quest' : forChild ? `Create a quest for ${forChild.name || 'your child'}` : 'Create your own quest'}
          </Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
          {family
            ? 'A quest for your children to work through together, each at their own pace. It stays private to your family.'
            : forChild
              ? `Build a quest around something ${forChild.name || 'your child'} wants to learn. It stays private to your family — you can add tasks and evidence as you go.`
              : 'Build a quest around something you want to learn. It stays private to you — you can add tasks and moments as you go.'}
        </UIText>

        {family && (
          <VStack space="xs">
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
              Who is on it
            </UIText>
            <HStack className="flex-wrap gap-2">
              {family.map((kid) => {
                const on = picked.has(kid.id);
                const name = kid.first_name || kid.display_name?.split(' ')[0] || 'Child';
                return (
                  <Pressable
                    key={kid.id}
                    onPress={() => toggle(kid.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={name}
                    className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${on ? 'border-optio-purple bg-optio-purple/10' : 'border-surface-200 dark:border-dark-surface-300'}`}
                  >
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={on ? c.brand : c.iconMuted} />
                    <UIText size="sm" className={on ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500 dark:text-dark-typo-500'}>
                      {name}
                    </UIText>
                  </Pressable>
                );
              })}
            </HStack>
          </VStack>
        )}

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
          disabled={!title.trim() || saving || (family !== null && picked.size === 0)}
          loading={saving}
        >
          <ButtonText>{saving ? 'Creating…' : family ? 'Create family quest' : 'Create Quest'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
