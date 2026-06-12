/**
 * TaskEditModal - Edit a quest task's pillar and diploma (transcript) subjects.
 *
 * Feature: "Allow me to edit the pillar and diploma subject on a task." Saves via
 * PUT /api/tasks/:id (which already supports pillar + diploma_subjects).
 */

import React, { useState } from 'react';
import { View, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import { PILLARS, DIPLOMA_SUBJECTS } from '@/src/hooks/useQuestDetail';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
} from '@/src/components/ui';

const pillarChip: Record<string, { active: string; text: string }> = {
  stem: { active: 'bg-pillar-stem', text: 'text-pillar-stem' },
  art: { active: 'bg-pillar-art', text: 'text-pillar-art' },
  communication: { active: 'bg-pillar-communication', text: 'text-pillar-communication' },
  civics: { active: 'bg-pillar-civics', text: 'text-pillar-civics' },
  wellness: { active: 'bg-pillar-wellness', text: 'text-pillar-wellness' },
};

interface TaskEditModalProps {
  visible: boolean;
  task: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TaskEditModal({ visible, task, onClose, onSaved }: TaskEditModalProps) {
  const c = useThemeColors();
  const [pillar, setPillar] = useState<string>(task?.pillar || 'stem');
  const [subjects, setSubjects] = useState<string[]>(
    Array.isArray(task?.diploma_subjects) ? task.diploma_subjects : (task?.school_subjects || [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state whenever a different task is opened.
  React.useEffect(() => {
    if (task) {
      setPillar(task.pillar || 'stem');
      setSubjects(Array.isArray(task.diploma_subjects) ? task.diploma_subjects : (task.school_subjects || []));
      setError(null);
    }
  }, [task?.id]);

  const toggleSubject = (s: string) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSave = async () => {
    if (!task || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/tasks/${task.id}`, {
        pillar,
        diploma_subjects: subjects,
      });
      onSaved();
    } catch (e) {
      setError(extractApiError(e, 'Could not save changes. Please try again.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable className="flex-1" onPress={onClose} />
        <View
          style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}
        >
          <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mt-3 mb-1" />
          <HStack className="items-center justify-between px-6 pt-2 pb-3">
            <Heading size="md">Edit task</Heading>
            <Pressable onPress={onClose} hitSlop={8} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
              <Ionicons name="close" size={18} color={c.icon} />
            </Pressable>
          </HStack>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            {task?.title ? (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mb-4" numberOfLines={2}>
                {task.title}
              </UIText>
            ) : null}

            {/* Pillar — single select */}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-semibold mb-2">PILLAR</UIText>
            <HStack className="flex-wrap gap-2 mb-5">
              {PILLARS.map((p) => {
                const selected = pillar === p.key;
                const chip = pillarChip[p.key] || pillarChip.stem;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPillar(p.key)}
                    className={`px-3 py-2 rounded-full border ${selected ? `${chip.active} border-transparent` : 'border-surface-200 dark:border-dark-surface-300'}`}
                  >
                    <UIText size="sm" className={selected ? 'text-white font-poppins-semibold' : chip.text}>
                      {p.label}
                    </UIText>
                  </Pressable>
                );
              })}
            </HStack>

            {/* Diploma subjects — multi select */}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-semibold mb-2">DIPLOMA SUBJECTS</UIText>
            <HStack className="flex-wrap gap-2 mb-2">
              {DIPLOMA_SUBJECTS.map((s) => {
                const selected = subjects.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleSubject(s)}
                    className={`flex-row items-center gap-1 px-3 py-2 rounded-full border ${selected ? 'bg-optio-purple border-transparent' : 'border-surface-200 dark:border-dark-surface-300'}`}
                  >
                    {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <UIText size="sm" className={selected ? 'text-white font-poppins-medium' : 'text-typo-500 dark:text-dark-typo-500'}>
                      {s}
                    </UIText>
                  </Pressable>
                );
              })}
            </HStack>

            {error ? (
              <UIText size="xs" className="text-error-600 dark:text-error-400 mt-2">{error}</UIText>
            ) : null}
          </ScrollView>

          <View className="px-6 pt-2" style={{ paddingBottom: Platform.OS === 'ios' ? 32 : 16 }}>
            <Button size="lg" className="w-full" onPress={handleSave} loading={saving}>
              <ButtonText>
                <UIText className="text-white font-poppins-semibold">Save changes</UIText>
              </ButtonText>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
