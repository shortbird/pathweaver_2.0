/**
 * TaskPickerSheet - Bottom sheet for attaching a captured moment to a
 * pending quest task. Lists the student's active quests with their pending
 * tasks grouped by quest. Single-select.
 *
 * Tasks that already have a moment attached are shown with a dimmed
 * "replace" hint so the student knows picking them will swap attachments.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  BottomSheet, VStack, HStack, UIText, Heading, PillarBadge,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export interface AttachableTask {
  id: string;
  title: string;
  pillar: string;
  xp_value: number;
  attached_moment_id: string | null;
}

export interface AttachableQuest {
  id: string;
  title: string;
  tasks: AttachableTask[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPicked: (task: AttachableTask, quest: AttachableQuest) => void | Promise<void>;
  /** Add the moment as a NEW task on a quest (convert-to-task), not just attach
   *  to an existing one (bug #12 parity with the capture flow). */
  onAddAsNewTask?: (quest: AttachableQuest) => void | Promise<void>;
  /** Moment currently being attached — its existing attachment is highlighted */
  currentTaskId?: string | null;
  /** Show a "Detach" option at the top when true (editing an existing attachment) */
  allowDetach?: boolean;
  onDetach?: () => void | Promise<void>;
  /** When set, only tasks from this quest are shown (used by quest-scoped capture). */
  questIdFilter?: string;
}

export function TaskPickerSheet({
  visible,
  onClose,
  onPicked,
  onAddAsNewTask,
  currentTaskId,
  allowDetach,
  onDetach,
  questIdFilter,
}: Props) {
  const c = useThemeColors();
  const [quests, setQuests] = useState<AttachableQuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [addingQuestId, setAddingQuestId] = useState<string | null>(null);

  const handleAddNew = async (quest: AttachableQuest) => {
    if (!onAddAsNewTask) return;
    setAddingQuestId(quest.id);
    try {
      await onAddAsNewTask(quest);
    } finally {
      setAddingQuestId(null);
    }
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/learning-events/attachable-tasks');
      let list: AttachableQuest[] = data?.quests || [];
      if (questIdFilter) {
        list = list.filter((q) => q.id === questIdFilter);
      }
      setQuests(list);
      if (list.length === 1) setExpandedQuestId(list[0].id);
    } catch {
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [questIdFilter]);

  useEffect(() => {
    if (visible) fetchTasks();
  }, [visible, fetchTasks]);

  const handlePick = async (task: AttachableTask, quest: AttachableQuest) => {
    setPickingId(task.id);
    try {
      await onPicked(task, quest);
    } finally {
      setPickingId(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">Attach to a task</Heading>
          <Pressable
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
          This moment becomes draft evidence. You'll finalize completion on the web.
        </UIText>

        {allowDetach && onDetach && (
          <Pressable
            onPress={onDetach}
            className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100"
          >
            <Ionicons name="unlink-outline" size={16} color="#EF4444" />
            <UIText size="sm" className="text-red-500 font-poppins-medium">
              Detach from current task
            </UIText>
          </Pressable>
        )}

        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color="#6D469B" />
            </View>
          ) : quests.length === 0 ? (
            <View className="py-8 items-center">
              <Ionicons name="flag-outline" size={32} color={c.border} />
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2 text-center">
                {onAddAsNewTask ? 'No active quests yet.' : 'No active quests with pending tasks.'}
              </UIText>
            </View>
          ) : (
            <VStack space="sm">
              {quests.map((quest) => {
                const expanded = expandedQuestId === quest.id;
                return (
                  <View key={quest.id} className="rounded-xl border border-surface-200 dark:border-dark-surface-300 overflow-hidden">
                    <Pressable
                      onPress={() => setExpandedQuestId(expanded ? null : quest.id)}
                      className="flex-row items-center justify-between px-3 py-3 bg-surface-50 dark:bg-dark-surface-50"
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
                        {/* Add this moment as a brand-new task on the quest
                            (convert-to-task), parity with the capture flow. */}
                        {onAddAsNewTask && (
                          <Pressable
                            onPress={() => handleAddNew(quest)}
                            disabled={addingQuestId === quest.id}
                            className="flex-row items-center gap-3 px-3 py-3 rounded-lg border border-dashed border-optio-purple/40 bg-optio-purple/5"
                            style={{ opacity: addingQuestId === quest.id ? 0.5 : 1 }}
                          >
                            {addingQuestId === quest.id ? (
                              <ActivityIndicator size="small" color="#6D469B" />
                            ) : (
                              <Ionicons name="add-circle-outline" size={18} color="#6D469B" />
                            )}
                            <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                              Add as new task in this quest
                            </UIText>
                          </Pressable>
                        )}
                        {quest.tasks.map((task) => {
                          const isCurrent = currentTaskId === task.id;
                          const occupied = !!task.attached_moment_id && !isCurrent;
                          const isPicking = pickingId === task.id;
                          return (
                            <Pressable
                              key={task.id}
                              onPress={() => handlePick(task, quest)}
                              disabled={isPicking}
                              className={`flex-row items-center gap-3 px-3 py-3 rounded-lg ${
                                isCurrent ? 'bg-optio-purple/10' : 'bg-surface-50 dark:bg-dark-surface-50'
                              }`}
                              style={{ opacity: isPicking ? 0.5 : 1 }}
                            >
                              <VStack className="flex-1 min-w-0">
                                <UIText size="sm" className="font-poppins-medium" numberOfLines={2}>
                                  {task.title}
                                </UIText>
                                <HStack className="items-center gap-2 mt-1">
                                  <PillarBadge pillar={task.pillar} size="sm" />
                                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                                    {task.xp_value} XP
                                  </UIText>
                                  {occupied && (
                                    <UIText size="xs" className="text-amber-600">
                                      · replaces existing
                                    </UIText>
                                  )}
                                  {isCurrent && (
                                    <UIText size="xs" className="text-optio-purple">
                                      · currently attached
                                    </UIText>
                                  )}
                                </HStack>
                              </VStack>
                              {isPicking ? (
                                <ActivityIndicator size="small" color="#6D469B" />
                              ) : (
                                <Ionicons
                                  name={isCurrent ? 'checkmark-circle' : 'chevron-forward'}
                                  size={18}
                                  color={isCurrent ? '#6D469B' : c.iconMuted}
                                />
                              )}
                            </Pressable>
                          );
                        })}
                      </VStack>
                    )}
                  </View>
                );
              })}
            </VStack>
          )}
        </ScrollView>
      </VStack>
    </BottomSheet>
  );
}

// ── API helpers ──────────────────────────────────────────────────────────

export async function attachMomentToTask(eventId: string, taskId: string) {
  const { data } = await api.post(`/api/learning-events/${eventId}/attach-task`, { task_id: taskId });
  return data;
}

export async function detachMomentFromTask(eventId: string) {
  const { data } = await api.delete(`/api/learning-events/${eventId}/attach-task`);
  return data;
}
