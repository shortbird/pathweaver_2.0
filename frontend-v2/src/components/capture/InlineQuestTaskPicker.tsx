/**
 * InlineQuestTaskPicker — quest/task selector rendered INLINE inside the
 * CaptureSheet rather than as a second drawer on top.
 *
 * Behavior:
 *  - Loads attachable quests (active enrollments with pending tasks) when
 *    `visible` flips true; keeps results across re-opens.
 *  - Each quest is collapsible. Inside, the student can either:
 *      • tap an existing pending task → onPickTask(task, quest)
 *      • tap the "Add as new task" tile → onPickNewTask(quest)
 *  - A `questIdFilter` can scope to a single quest (used when the capture
 *    sheet is launched from a quest-detail screen).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { VStack, HStack, UIText, PillarBadge } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { AttachableTask, AttachableQuest } from '../journal/TaskPickerSheet';

interface Props {
  visible: boolean;
  questIdFilter?: string;
  /** When set, fetches quests for the given student instead of the caller.
   *  Used by parent capture: the caller is the parent, but the moment (and
   *  the quest) belong to the kid. The backend verifies that the caller is
   *  the student's parent/observer. */
  studentId?: string;
  onPickTask: (task: AttachableTask, quest: AttachableQuest) => void;
  onPickNewTask: (quest: AttachableQuest) => void;
  selectedTaskId?: string | null;
  /** When set, marks "Add new task to this quest" as the active choice. */
  selectedNewTaskQuestId?: string | null;
}

export function InlineQuestTaskPicker({
  visible,
  questIdFilter,
  studentId,
  onPickTask,
  onPickNewTask,
  selectedTaskId,
  selectedNewTaskQuestId,
}: Props) {
  const [quests, setQuests] = useState<AttachableQuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = useThemeColors();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/learning-events/attachable-tasks', {
        params: studentId ? { student_id: studentId } : undefined,
      });
      let list: AttachableQuest[] = data?.quests || [];
      if (questIdFilter) list = list.filter((q) => q.id === questIdFilter);
      setQuests(list);
      // Auto-expand if there's only one quest, or pre-expand the selected one.
      if (list.length === 1) setExpandedQuestId(list[0].id);
      else if (selectedNewTaskQuestId) setExpandedQuestId(selectedNewTaskQuestId);
    } catch (err) {
      setError('Could not load your quests.');
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [questIdFilter, selectedNewTaskQuestId, studentId]);

  useEffect(() => {
    if (visible) fetchTasks();
  }, [visible, fetchTasks]);

  if (!visible) return null;

  if (loading) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator color="#6D469B" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="py-6 items-center px-4">
        <UIText size="sm" className="text-red-500 text-center">{error}</UIText>
      </View>
    );
  }

  if (quests.length === 0) {
    return (
      <View className="py-6 items-center px-4">
        <Ionicons name="rocket-outline" size={28} color={c.iconMuted} />
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2 text-center">
          You don't have any active quests yet.
        </UIText>
      </View>
    );
  }

  return (
    <VStack space="xs">
      {quests.map((quest) => {
        const expanded = expandedQuestId === quest.id;
        return (
          <View
            key={quest.id}
            className="rounded-xl border border-surface-200 dark:border-dark-surface-300 overflow-hidden"
          >
            <Pressable
              onPress={() => setExpandedQuestId(expanded ? null : quest.id)}
              className="flex-row items-center justify-between px-3 py-3 bg-surface-50 dark:bg-dark-surface-50 active:bg-surface-100"
              style={{ minHeight: 44 }}
            >
              <VStack className="flex-1 min-w-0 mr-2">
                <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                  {quest.title}
                </UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  {quest.tasks.length} pending task{quest.tasks.length === 1 ? '' : 's'}
                </UIText>
              </VStack>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#6D469B"
              />
            </Pressable>

            {expanded && (
              <VStack space="xs" className="p-2 bg-white dark:bg-dark-surface-100">
                {quest.tasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  const occupied = !!task.attached_moment_id && !isSelected;
                  return (
                    <Pressable
                      key={task.id}
                      onPress={() => onPickTask(task, quest)}
                      className={`flex-row items-center gap-3 px-3 py-2.5 rounded-lg ${
                        isSelected
                          ? 'bg-optio-purple/10 border border-optio-purple/40'
                          : 'bg-surface-50 dark:bg-dark-surface-50 active:bg-surface-100'
                      }`}
                      style={{ minHeight: 44, opacity: occupied ? 0.55 : 1 }}
                    >
                      <View className="w-5 h-5 rounded-full items-center justify-center"
                            style={{ borderWidth: 1.5, borderColor: isSelected ? '#6D469B' : c.border, backgroundColor: isSelected ? '#6D469B' : 'transparent' }}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                      </View>
                      <VStack className="flex-1 min-w-0">
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={2}>
                          {task.title}
                        </UIText>
                        <HStack className="items-center gap-2 mt-0.5">
                          <PillarBadge pillar={task.pillar} size="sm" />
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{task.xp_value} XP</UIText>
                          {occupied && (
                            <UIText size="xs" className="text-amber-600">already has a moment</UIText>
                          )}
                        </HStack>
                      </VStack>
                    </Pressable>
                  );
                })}

                {/* "Add as new task" tile — separated so it reads as a different
                    action from picking an existing task. */}
                <Pressable
                  onPress={() => onPickNewTask(quest)}
                  className={`flex-row items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed ${
                    selectedNewTaskQuestId === quest.id
                      ? 'bg-optio-purple/10 border-optio-purple'
                      : 'border-surface-300 dark:border-dark-surface-300 active:bg-surface-50'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <View
                    className="w-5 h-5 rounded-full items-center justify-center"
                    style={{
                      borderWidth: 1.5,
                      borderColor: selectedNewTaskQuestId === quest.id ? '#6D469B' : c.border,
                      backgroundColor: selectedNewTaskQuestId === quest.id ? '#6D469B' : 'transparent',
                    }}
                  >
                    {selectedNewTaskQuestId === quest.id ? (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    ) : (
                      <Ionicons name="add" size={14} color="#6D469B" />
                    )}
                  </View>
                  <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                    Add as new task in this quest
                  </UIText>
                </Pressable>
              </VStack>
            )}
          </View>
        );
      })}
    </VStack>
  );
}
