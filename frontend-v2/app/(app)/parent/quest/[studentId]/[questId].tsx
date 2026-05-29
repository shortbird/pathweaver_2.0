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
import { View, ScrollView, Pressable, ActivityIndicator, Image, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { TaskEvidenceSheet } from '@/src/components/capture/TaskEvidenceSheet';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Skeleton,
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
  const uploaderLabel = (() => {
    if (block.uploaded_by_role === 'parent') return `Added by ${block.uploaded_by_name || 'you'}`;
    if (block.uploaded_by_role === 'advisor') return `Added by ${block.uploaded_by_name || 'an advisor'}`;
    return null; // student-uploaded gets no extra label
  })();

  return (
    <View className="rounded-xl border border-surface-200 p-3 bg-white">
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
            color="#6D469B"
          />
        </View>
        <VStack className="flex-1 min-w-0" space="xs">
          {type === 'text' && (
            <UIText size="sm" className="text-typo-700" numberOfLines={4}>
              {content.text || ''}
            </UIText>
          )}
          {type === 'image' && content.url && (
            <Image
              source={{ uri: content.url }}
              style={{ width: '100%', height: 160, borderRadius: 8, backgroundColor: '#F3F4F6' }}
              resizeMode="cover"
            />
          )}
          {type === 'link' && (
            <UIText size="sm" className="text-optio-purple font-poppins-medium" numberOfLines={2}>
              {content.title || content.url || 'Link'}
            </UIText>
          )}
          {type === 'video' && (
            <UIText size="sm" className="text-typo-600" numberOfLines={1}>
              {content.filename || 'Video'}
            </UIText>
          )}
          {type === 'audio' && (
            <UIText size="sm" className="text-typo-600" numberOfLines={1}>
              {content.filename || 'Audio note'}
            </UIText>
          )}
          {type === 'document' && (
            <UIText size="sm" className="text-typo-600" numberOfLines={2}>
              {content.title || content.filename || 'Document'}
            </UIText>
          )}
          {uploaderLabel && (
            <UIText size="xs" className="text-typo-400">{uploaderLabel}</UIText>
          )}
        </VStack>
      </HStack>
    </View>
  );
}

function TaskCard({
  task,
  studentId,
  onEvidenceAdded,
}: {
  task: Task;
  studentId: string;
  onEvidenceAdded: () => void;
}) {
  const [sheetVisible, setSheetVisible] = useState(false);

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
          {task.xp_value > 0 && (
            <HStack className="items-center gap-1">
              <Ionicons name="star" size={12} color="#FF9028" />
              <UIText size="xs" className="font-poppins-bold" style={{ color: '#FF9028' }}>
                {task.xp_value} XP
              </UIText>
            </HStack>
          )}
        </HStack>

        <Heading size="sm">{task.title}</Heading>
        {task.description && (
          <UIText size="sm" className="text-typo-500" numberOfLines={4}>
            {task.description}
          </UIText>
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
          <View className="rounded-xl border border-surface-200 p-3 bg-white">
            <UIText size="sm" className="text-typo-700" numberOfLines={6}>
              {task.evidence_text}
            </UIText>
          </View>
        )}

        {/* Add-evidence button — hidden once the task is completed (parent
            can no longer add to a completed task; the student would re-open
            it themselves). */}
        {!task.is_completed && (
          <Button
            size="sm"
            variant="outline"
            onPress={() => setSheetVisible(true)}
            className="self-start mt-1"
          >
            <HStack className="items-center gap-2">
              <Ionicons name="add" size={14} color="#6D469B" />
              <ButtonText>Add evidence</ButtonText>
            </HStack>
          </Button>
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
  const [data, setData] = useState<QuestViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50" edges={['top', 'left', 'right']}>
        <View className="px-5 pt-4">
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <UIText size="sm" className="text-typo-500 mt-2 text-center">{error || 'Quest not found'}</UIText>
        </View>
      </SafeAreaView>
    );
  }

  const { quest, tasks, progress } = data;

  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />}
      >
        <VStack className="px-5 pt-4 max-w-2xl w-full md:mx-auto" space="md">
          {/* Back */}
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>

          {/* Hero */}
          {quest.image_url ? (
            <Image
              source={{ uri: quest.image_url }}
              style={{ width: '100%', height: 160, borderRadius: 16, backgroundColor: '#F3F4F6' }}
              resizeMode="cover"
            />
          ) : null}

          <VStack space="xs">
            <Heading size="xl">{quest.title}</Heading>
            {quest.description && (
              <UIText size="sm" className="text-typo-500" numberOfLines={6}>
                {quest.description}
              </UIText>
            )}
          </VStack>

          {/* Progress */}
          <Card variant="elevated" size="md">
            <VStack space="sm">
              <HStack className="items-center justify-between">
                <UIText size="sm" className="font-poppins-semibold text-typo-700">
                  Progress
                </UIText>
                <UIText size="xs" className="text-typo-500">
                  {progress.completed_tasks}/{progress.total_tasks} tasks · {progress.percentage}%
                </UIText>
              </HStack>
              <View className="h-2 bg-surface-200 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full bg-optio-purple"
                  style={{ width: `${progress.percentage}%` }}
                />
              </View>
            </VStack>
          </Card>

          {/* Helper-evidence note */}
          <Card variant="outline" size="sm" className="bg-amber-50 border-amber-200">
            <HStack className="items-start gap-2">
              <Ionicons name="information-circle-outline" size={18} color="#B45309" style={{ marginTop: 2 }} />
              <UIText size="xs" style={{ color: '#92400E', flex: 1 }}>
                Evidence you attach shows up on your kid's task as a draft block. They still need to mark the task complete themselves.
              </UIText>
            </HStack>
          </Card>

          {/* Tasks */}
          <VStack space="sm">
            <Heading size="md">Tasks</Heading>
            {tasks.length === 0 ? (
              <Card variant="filled" size="md" className="items-center py-6">
                <Ionicons name="checkmark-circle-outline" size={32} color="#9CA3AF" />
                <UIText size="sm" className="text-typo-400 mt-2">No tasks yet</UIText>
              </Card>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  studentId={studentId!}
                  onEvidenceAdded={fetchData}
                />
              ))
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
