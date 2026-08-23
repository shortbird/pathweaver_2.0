/**
 * Parent Quest View — read-mostly view of a kid's active quest with the
 * ability to attach evidence to individual tasks on the kid's behalf.
 *
 * Data: GET /api/parent/quest/<studentId>/<questId>
 *   → { quest, tasks, progress, is_dependent, user_quest_id }
 * Each task includes:
 *   { id, title, description, pillar, xp_value, is_required, is_completed,
 *     completed_at, evidence_blocks: [{ id, block_type, content,
 *     uploaded_by_user_id, uploaded_by_role, uploaded_by_name, created_at }] }
 *
 * Add-evidence flow (mirrors v1 web):
 *   1. Open the shared TaskEvidenceSheet pointed at the helper endpoints.
 *   2. Media uploads via signed URLs: POST /api/evidence/helper/upload-init
 *      with { student_id, task_id }, PUT to the signed URL, POST
 *      /upload-finalize with the storage path.
 *   3. Each block is then POSTed to /api/evidence/helper/upload-for-student
 *      with { student_id, task_id, block_type, content }.
 *
 * Important: helper evidence is a *draft* block. The student still has to
 * mark the task complete themselves — this view explicitly says so.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { TaskEvidenceSheet } from '@/src/components/capture/TaskEvidenceSheet';
import { TaskCreationWizard } from '@/src/components/tasks/TaskCreationWizard';
import { QuestEngagement } from '@/src/components/engagement/QuestEngagement';
import { useChildEngagement } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { showAlert, confirmAlert } from '@/src/utils/alerts';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  PillarBadge,
} from '@/src/components/ui';

interface EvidenceBlock {
  id: string;
  block_type: string;
  content: any;
  uploaded_by_user_id?: string | null;
  uploaded_by_role?: 'student' | 'parent' | 'advisor' | null;
  uploaded_by_name?: string | null;
  created_at?: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  success_criteria?: string[] | null;
  pillar: string;
  xp_value: number;
  order_index: number;
  is_required: boolean;
  is_completed: boolean;
  completed_at: string | null;
  evidence_type: string;
  evidence_text: string | null;
  evidence_url: string | null;
  evidence_blocks: EvidenceBlock[];
  is_confidential: boolean;
}

interface QuestViewData {
  quest: {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    quest_type: string | null;
    status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
    started_at: string | null;
    completed_at: string | null;
  };
  tasks: Task[];
  progress: {
    completed_tasks: number;
    total_tasks: number;
    percentage: number;
  };
  is_dependent: boolean;
  user_quest_id: string | null;
}

function EvidenceBlockRow({ block }: { block: EvidenceBlock }) {
  const type = block.block_type;
  const content = block.content || {};
  const c = useThemeColors();
  const uploaderLabel = (() => {
    if (block.uploaded_by_role === 'parent') return `Added by ${block.uploaded_by_name || 'you'}`;
    if (block.uploaded_by_role === 'advisor') return `Added by ${block.uploaded_by_name || 'a teacher'}`;
    return null; // student-uploaded gets no extra label
  })();

  return (
    <View className="rounded-xl border border-surface-200 dark:border-dark-surface-300 p-3 bg-white dark:bg-dark-surface-100">
      <HStack className="items-start gap-3">
        <View className="w-8 h-8 rounded-full bg-optio-purple/10 items-center justify-center mt-0.5">
          <Ionicons
            name={
              type === 'image' ? 'image-outline' :
              type === 'video' ? 'videocam-outline' :
              type === 'audio' ? 'mic-outline' :
              type === 'link' ? 'link-outline' :
              type === 'document' ? 'document-outline' :
              'text-outline'
            }
            size={16}
            color={c.brand}
          />
        </View>
        <VStack className="flex-1 min-w-0" space="xs">
          {type === 'text' && (
            <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700" numberOfLines={4}>
              {content.text || ''}
            </UIText>
          )}
          {type === 'image' && content.url && (
            <Image
              source={{ uri: content.url }}
              style={{ width: '100%', height: 160, borderRadius: 8, backgroundColor: c.surfaceMuted }}
              resizeMode="cover"
            />
          )}
          {type === 'link' && (
            <UIText size="sm" className="text-optio-purple font-poppins-medium" numberOfLines={2}>
              {content.title || content.url || 'Link'}
            </UIText>
          )}
          {type === 'video' && (
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
              {content.filename || 'Video'}
            </UIText>
          )}
          {type === 'audio' && (
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
              {content.filename || 'Audio note'}
            </UIText>
          )}
          {type === 'document' && (
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>
              {content.title || content.filename || 'Document'}
            </UIText>
          )}
          {uploaderLabel && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{uploaderLabel}</UIText>
          )}
        </VStack>
      </HStack>
    </View>
  );
}

function TaskCard({
  task,
  studentId,
  canComplete,
  onEvidenceAdded,
  onDelete,
}: {
  task: Task;
  studentId: string;
  /** True for managed dependents — the complete endpoint only accepts
   *  acting_as_dependent_id for under-13 dependents. */
  canComplete: boolean;
  onEvidenceAdded: () => void;
  /** When provided (managed dependents only), shows a delete control. Completed
   *  tasks can't be deleted, so the control hides once the task is done. */
  onDelete?: () => void;
}) {
  const c = useThemeColors();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  const handleMarkComplete = async () => {
    const msg = `Mark "${task.title}" complete? They'll earn ${task.xp_value} XP.`;
    const ok = await confirmAlert({ title: 'Mark complete?', message: msg, confirmText: 'Mark complete' });
    if (!ok) return;
    setCompleting(true);
    try {
      // The complete endpoint requires an evidence payload; the parent's
      // confirmation is recorded as a text block. Awards XP to the child.
      const form = new FormData();
      form.append('acting_as_dependent_id', studentId);
      form.append('evidence_type', 'text');
      form.append('text_content', 'Marked complete by parent');
      form.append('is_confidential', 'false');
      await api.post(`/api/tasks/${task.id}/complete`, form);
      onEvidenceAdded();
    } catch (e: any) {
      showAlert('Could not complete', e?.response?.data?.error?.message || e?.response?.data?.error || 'Failed to mark this task complete.');
    } finally {
      setCompleting(false);
    }
  };

  const handleSaveBlocks = useCallback(
    async (newBlocks: any[]) => {
      // Batch endpoint: one verification + one learning event for the whole
      // save instead of N round-trips. Falls back to the per-block endpoint
      // for older backends that don't yet expose /batch.
      const payloadBlocks = newBlocks.map((b) => ({
        block_type: b.type,
        content: b.content,
      }));
      try {
        await api.post('/api/evidence/helper/upload-for-student/batch', {
          student_id: studentId,
          task_id: task.id,
          blocks: payloadBlocks,
        });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          for (const block of payloadBlocks) {
            await api.post('/api/evidence/helper/upload-for-student', {
              student_id: studentId,
              task_id: task.id,
              block_type: block.block_type,
              content: block.content,
            });
          }
        } else {
          throw err;
        }
      }
    },
    [studentId, task.id],
  );

  return (
    <Card variant="outline" size="md">
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-2 flex-1 min-w-0">
            <PillarBadge pillar={task.pillar} size="md" />
            {task.is_completed && (
              <View className="bg-emerald-50 px-2 py-0.5 rounded-full">
                <UIText size="xs" className="text-emerald-700 font-poppins-semibold">
                  Done
                </UIText>
              </View>
            )}
          </HStack>
          <HStack className="items-center gap-2">
            {task.xp_value > 0 && (
              <HStack className="items-center gap-1">
                <Ionicons name="star" size={12} color="#FF9028" />
                <UIText size="xs" className="font-poppins-bold" style={{ color: '#FF9028' }}>
                  {task.xp_value} XP
                </UIText>
              </HStack>
            )}
            {onDelete && !task.is_completed && (
              <Pressable onPress={onDelete} hitSlop={8} className="p-1" accessibilityLabel="Remove task">
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            )}
          </HStack>
        </HStack>

        <Heading size="sm">{task.title}</Heading>
        {task.description && (
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={4}>
            {task.description}
          </UIText>
        )}

        {/* Success criteria - what "done" means for this task */}
        {Array.isArray(task.success_criteria) && task.success_criteria.length > 0 && (
          <VStack space="xs" className="p-2.5 rounded-lg bg-surface-100 dark:bg-dark-surface-200">
            <UIText size="xs" className="font-poppins-semibold text-typo-400 dark:text-dark-typo-400 uppercase">
              Definition of Done
            </UIText>
            {task.success_criteria.map((criterion, i) => (
              <HStack key={i} className="items-start gap-1.5">
                <Ionicons name="checkmark-circle-outline" size={13} color="#22c55e" style={{ marginTop: 1 }} />
                <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 flex-1">{criterion}</UIText>
              </HStack>
            ))}
          </VStack>
        )}

        {/* Evidence blocks */}
        {task.evidence_blocks.length > 0 && (
          <VStack space="xs" className="mt-1">
            {task.evidence_blocks.map((b) => (
              <EvidenceBlockRow key={b.id} block={b} />
            ))}
          </VStack>
        )}

        {/* Legacy single-text/url evidence falls back to a single block-style row */}
        {task.evidence_blocks.length === 0 && task.evidence_text && (
          <View className="rounded-xl border border-surface-200 dark:border-dark-surface-300 p-3 bg-white dark:bg-dark-surface-100">
            <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700" numberOfLines={6}>
              {task.evidence_text}
            </UIText>
          </View>
        )}

        {/* Add-evidence / mark-complete — hidden once the task is completed. */}
        {!task.is_completed && (
          <HStack className="gap-2 mt-1 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onPress={() => setSheetVisible(true)}
              className="self-start"
            >
              <HStack className="items-center gap-2">
                <Ionicons name="add" size={14} color={c.brand} />
                <ButtonText>Add evidence</ButtonText>
              </HStack>
            </Button>
            {canComplete && (
              <Button
                size="sm"
                onPress={handleMarkComplete}
                loading={completing}
                disabled={completing}
                className="self-start"
              >
                <HStack className="items-center gap-2">
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  <ButtonText>Mark complete</ButtonText>
                </HStack>
              </Button>
            )}
          </HStack>
        )}
      </VStack>

      <TaskEvidenceSheet
        visible={sheetVisible}
        taskTitle={task.title}
        existingBlocks={task.evidence_blocks}
        onClose={() => setSheetVisible(false)}
        onSaved={() => {
          setSheetVisible(false);
          onEvidenceAdded();
        }}
        uploadInitPath="/api/evidence/helper/upload-init"
        uploadFinalizePath="/api/evidence/helper/upload-finalize"
        extraInitBody={{ student_id: studentId, task_id: task.id }}
        extraFinalizeBody={{ student_id: studentId, task_id: task.id }}
        onSave={handleSaveBlocks}
      />
    </Card>
  );
}

export default function ParentQuestViewPage() {
  const { studentId, questId } = useLocalSearchParams<{ studentId: string; questId: string }>();
  const c = useThemeColors();
  const [data, setData] = useState<QuestViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const { data: engagement } = useChildEngagement(studentId || null);

  const fetchData = useCallback(async () => {
    if (!studentId || !questId) return;
    try {
      const { data: result } = await api.get(`/api/parent/quest/${studentId}/${questId}`);
      setData(result);
      setError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to load quest';
      setError(typeof msg === 'string' ? msg : 'Failed to load quest');
    } finally {
      setLoading(false);
    }
  }, [studentId, questId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={c.brand} />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <View className="px-5 pt-4">
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color={c.brand} />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={48} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 text-center">{error || 'Quest not found'}</UIText>
        </View>
      </SafeAreaView>
    );
  }

  const { quest, tasks } = data;

  // Persist a new task to the CHILD's quest enrollment (parent on-behalf-of).
  // Same TaskCreationWizard UI as the student; only the write target differs.
  const handleAddTaskForChild = async (task: any) => {
    await api.post(`/api/family/quests/${questId}/tasks`, {
      child_id: studentId,
      title: task.title,
      description: task.description,
      pillar: task.pillar,
      xp_value: task.xp_value,
      // Forward the AI task's Definition of Done + subjects so the parent path
      // stores the same data as the student self-accept path.
      success_criteria: task.success_criteria,
      diploma_subjects: task.diploma_subjects,
    });
    await fetchData();
  };

  // Delete a task from the CHILD's quest enrollment (parent on-behalf-of).
  // Completed tasks can't be deleted (backend rejects). Confirms first.
  const handleDeleteTask = async (task: Task) => {
    const msg = `Remove "${task.title}"? This can't be undone.`;
    const ok = await confirmAlert({ title: 'Remove task?', message: msg, confirmText: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/api/family/quests/${questId}/tasks/${task.id}`, {
        params: { child_id: studentId },
      });
      await fetchData();
    } catch (e: any) {
      showAlert('Could not remove', e?.response?.data?.error || 'Failed to remove this task.');
    }
  };

  // Mirrors useQuestDetail.generateTasks so the AI step is identical for parents.
  const generateTasksForChild = async (interests?: string, pillar?: string, subject?: string, challengeLevel?: string) => {
    const { data: sess } = await api.post(`/api/quests/${questId}/start-personalization`, {});
    const sessionId = sess.session_id;
    const interestList = interests ? interests.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const { data: gen } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId,
      approach: 'hybrid',
      interests: interestList,
      cross_curricular_subjects: subject ? [subject] : [],
      exclude_tasks: tasks.map((t) => t.title),
      ...(challengeLevel ? { challenge_level: challengeLevel } : {}),
      // AI generation runs several model calls; override the 15s global timeout.
    }, { timeout: 90000 });
    return gen.tasks || gen.generated_tasks || [];
  };

  // Complexity dial: rewrite a suggested task one step easier/harder.
  const adjustTaskForChild = async (task: any, direction: 'easier' | 'harder') => {
    const { data } = await api.post(`/api/quests/${questId}/adjust-task-difficulty`, {
      task, direction,
    });
    return data.task || null;
  };

  // Remove (un-enroll) the quest from the child. The enrollment-delete route
  // accepts ?student_id= for parent/advisor delegation and reverses the XP.
  const handleRemoveQuest = async () => {
    const msg = 'Remove this quest from your kid? Their progress and XP for it will be removed. This cannot be undone.';
    const ok = await confirmAlert({ title: 'Remove quest?', message: msg, confirmText: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/api/quests/${questId}/enrollment`, { params: { student_id: studentId } });
      router.back();
    } catch (e: any) {
      showAlert('Could not remove', e?.response?.data?.error || 'Failed to remove this quest. Try again.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        <VStack className="px-5 pt-4 max-w-2xl w-full md:mx-auto" space="md">
          {/* Back */}
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color={c.brand} />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>

          {/* Hero */}
          {quest.image_url ? (
            <Image
              source={{ uri: quest.image_url }}
              style={{ width: '100%', height: 160, borderRadius: 16, backgroundColor: c.surfaceMuted }}
              resizeMode="cover"
            />
          ) : null}

          <VStack space="xs">
            <Heading size="xl">{quest.title}</Heading>
            {quest.description && (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={6}>
                {quest.description}
              </UIText>
            )}
          </VStack>

          {/* Engagement mini-calendar — replaces task-completion progress. */}
          <QuestEngagement engagement={engagement} />

          {/* Tasks */}
          <VStack space="sm">
            <Heading size="md">Tasks</Heading>
            {tasks.length === 0 ? (
              <Card variant="filled" size="md" className="items-center py-6">
                <Ionicons name="checkmark-circle-outline" size={32} color={c.iconMuted} />
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2">No tasks yet</UIText>
              </Card>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  studentId={studentId!}
                  canComplete={data.is_dependent}
                  onEvidenceAdded={fetchData}
                  onDelete={data.is_dependent ? () => handleDeleteTask(task) : undefined}
                />
              ))
            )}

            {/* Add a task — only for managed dependents (the family task
                endpoint requires managed_by_parent_id). Reuses the student's
                TaskCreationWizard, writing to the child's enrollment. */}
            {data.is_dependent && (
              <Button
                variant="outline"
                onPress={() => setAddTaskOpen(true)}
                className="self-start mt-1"
              >
                <HStack className="items-center gap-2">
                  <Ionicons name="add" size={16} color={c.brand} />
                  <ButtonText>Add a task</ButtonText>
                </HStack>
              </Button>
            )}
          </VStack>

          {/* Remove quest from this kid */}
          <Pressable onPress={handleRemoveQuest} className="py-3 items-center mt-2" style={{ minHeight: 44, justifyContent: 'center' }}>
            <UIText size="sm" className="text-red-400">Remove quest</UIText>
          </Pressable>
        </VStack>
      </ScrollView>

      {/* Same task-creation wizard the student uses, pointed at the child. */}
      <TaskCreationWizard
        questId={questId!}
        questTitle={quest.title}
        open={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        onGenerate={generateTasksForChild}
        onAcceptTask={handleAddTaskForChild}
        onAdjustTask={adjustTaskForChild}
      />
    </SafeAreaView>
  );
}
