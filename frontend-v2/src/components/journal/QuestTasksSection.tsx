/**
 * QuestTasksSection - Task list for a quest within the journal view.
 *
 * Shows quest tasks (completed + pending) with pillar badges and XP.
 * Includes a "Generate Task Ideas" button to open the AI wizard.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card, Button, ButtonText, PillarBadge } from '../ui';
import type { QuestTask } from '@/src/hooks/useJournal';
import api from '@/src/services/api';

interface Props {
  tasks: QuestTask[];
  loading: boolean;
  onGenerateTasks: () => void;
  questId?: string | null;
}

function TaskItem({ task, hasAttachment }: { task: QuestTask; hasAttachment?: boolean }) {
  return (
    <Card variant="outline" size="sm">
      <HStack className="items-center gap-3">
        {/* Completion indicator */}
        <View
          className="w-6 h-6 rounded-full items-center justify-center"
          style={task.is_completed
            ? { backgroundColor: '#16A34A' }
            : { borderWidth: 2, borderColor: '#CEC6D6' }
          }
        >
          {task.is_completed && (
            <Ionicons name="checkmark" size={14} color="#fff" />
          )}
        </View>

        {/* Task info */}
        <VStack className="flex-1 min-w-0">
          <UIText
            size="sm"
            className={`font-poppins-medium ${task.is_completed ? 'text-typo-400' : 'text-typo'}`}
            numberOfLines={2}
            style={task.is_completed ? { textDecorationLine: 'line-through' } : undefined}
          >
            {task.title}
          </UIText>
          {task.description ? (
            <UIText size="xs" className="text-typo-400" numberOfLines={1}>
              {task.description}
            </UIText>
          ) : null}
        </VStack>

        {/* Pillar + XP */}
        <VStack className="items-end gap-1">
          <PillarBadge pillar={task.pillar} size="sm" />
          <UIText size="xs" className="text-typo-400 font-poppins-medium">
            {task.xp_value || task.xp_amount} XP
          </UIText>
          {hasAttachment && !task.is_completed ? (
            <HStack className="items-center gap-1">
              <Ionicons name="attach" size={10} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium">
                Evidence attached
              </UIText>
            </HStack>
          ) : null}
        </VStack>
      </HStack>
    </Card>
  );
}

export function QuestTasksSection({ tasks, loading, onGenerateTasks, questId }: Props) {
  const [attachments, setAttachments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!questId) { setAttachments({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/quests/${questId}/task-attachments`);
        if (!cancelled) setAttachments(data?.attachments || {});
      } catch {
        if (!cancelled) setAttachments({});
      }
    })();
    return () => { cancelled = true; };
  }, [questId, tasks.length]);

  if (loading) return null;

  const completed = tasks.filter((t) => t.is_completed);
  const pending = tasks.filter((t) => !t.is_completed);

  return (
    <VStack space="sm">
      {/* Section header */}
      <HStack className="items-center justify-between">
        <HStack className="items-center gap-2">
          <Ionicons name="list-outline" size={16} color="#6D469B" />
          <UIText size="sm" className="font-poppins-semibold text-typo-500 uppercase tracking-wider">
            Tasks
          </UIText>
          {tasks.length > 0 && (
            <UIText size="xs" className="text-typo-400">
              {completed.length}/{tasks.length}
            </UIText>
          )}
        </HStack>
      </HStack>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <View className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-optio-purple rounded-full"
            style={{ width: `${tasks.length > 0 ? (completed.length / tasks.length) * 100 : 0}%` }}
          />
        </View>
      )}

      {/* Task list */}
      {pending.map((task) => (
        <TaskItem key={task.id} task={task} hasAttachment={!!attachments[task.id]} />
      ))}
      {completed.map((task) => (
        <TaskItem key={task.id} task={task} hasAttachment={!!attachments[task.id]} />
      ))}

      {/* Generate tasks button */}
      <Pressable
        onPress={onGenerateTasks}
        className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-surface-300 active:bg-surface-50"
      >
        <Ionicons name="sparkles" size={16} color="#6D469B" />
        <UIText size="sm" className="text-optio-purple font-poppins-medium">
          Generate Task Ideas
        </UIText>
      </Pressable>
    </VStack>
  );
}
