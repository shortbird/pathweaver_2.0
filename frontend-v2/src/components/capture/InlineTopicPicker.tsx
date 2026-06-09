/**
 * InlineTopicPicker — journal-topic selector rendered INLINE inside the
 * CaptureSheet, mirroring InlineQuestTaskPicker.
 *
 * Lists the student's journal topics (interest tracks — the user-created
 * folders shown in the Journal tab). Quests are intentionally excluded here:
 * they're covered by the separate "Attach to a quest task" option.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useUnifiedTopics, type UnifiedTopic } from '@/src/hooks/useJournal';

interface Props {
  visible: boolean;
  selectedTopicId?: string | null;
  onPickTopic: (topic: UnifiedTopic) => void;
}

export function InlineTopicPicker({ visible, selectedTopicId, onPickTopic }: Props) {
  const { topics, loading } = useUnifiedTopics();
  const c = useThemeColors();

  if (!visible) return null;

  // Journal topics only — the interest tracks. (Quests/courses are surfaced
  // through the quest-task picker.)
  const journalTopics = topics.filter((t) => t.type === 'topic' || t.type === 'track');

  if (loading && journalTopics.length === 0) {
    return (
      <View className="py-6 items-center">
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">Loading topics…</UIText>
      </View>
    );
  }

  if (journalTopics.length === 0) {
    return (
      <View className="py-6 items-center px-4">
        <Ionicons name="book-outline" size={28} color={c.iconMuted} />
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2 text-center">
          You don't have any journal topics yet.
        </UIText>
      </View>
    );
  }

  return (
    <VStack space="xs" className="p-2 bg-white dark:bg-dark-surface-100 rounded-xl border border-surface-200 dark:border-dark-surface-300">
      {journalTopics.map((topic) => {
        const isSelected = selectedTopicId === topic.id;
        return (
          <Pressable
            key={topic.id}
            onPress={() => onPickTopic(topic)}
            className={`flex-row items-center gap-3 px-3 py-2.5 rounded-lg ${
              isSelected
                ? 'bg-optio-purple/10 border border-optio-purple/40'
                : 'bg-surface-50 dark:bg-dark-surface-50 active:bg-surface-100'
            }`}
            style={{ minHeight: 44 }}
          >
            <View
              className="w-5 h-5 rounded-full items-center justify-center"
              style={{ borderWidth: 1.5, borderColor: isSelected ? '#6D469B' : c.border, backgroundColor: isSelected ? '#6D469B' : 'transparent' }}
            >
              {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
            </View>
            <Ionicons name="book-outline" size={16} color={topic.color && topic.color !== 'gradient' ? topic.color : '#6D469B'} />
            <VStack className="flex-1 min-w-0">
              <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                {topic.name}
              </UIText>
              {typeof topic.moment_count === 'number' && (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  {topic.moment_count} moment{topic.moment_count === 1 ? '' : 's'}
                </UIText>
              )}
            </VStack>
          </Pressable>
        );
      })}
    </VStack>
  );
}
