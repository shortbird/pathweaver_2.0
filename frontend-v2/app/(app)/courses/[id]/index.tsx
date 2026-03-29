/**
 * Course Detail - Self-contained task-first design.
 *
 * Hero image, progress card, project sections with expandable task items.
 * Tasks include evidence upload and completion -- no quest page links.
 * Lessons available via collapsible drawer.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Pressable, TextInput, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCourseDetail } from '@/src/hooks/useCourses';
import { useAuthStore } from '@/src/stores/authStore';
import { LessonViewer } from '@/src/components/curriculum/LessonViewer';
import { TaskCreationWizard } from '@/src/components/tasks/TaskCreationWizard';
import { PILLARS } from '@/src/hooks/useQuestDetail';
import api from '@/src/services/api';
import type { Lesson } from '@/src/hooks/useCourses';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton,
} from '@/src/components/ui';

// ── Pillar colors (same map as quests/[id].tsx) ──

const pillarColors: Record<string, { bg: string; text: string; bar: string; border: string; hex: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem', bar: 'bg-pillar-stem', border: 'border-pillar-stem', hex: '#2469D1' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art', bar: 'bg-pillar-art', border: 'border-pillar-art', hex: '#AF56E5' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication', bar: 'bg-pillar-communication', border: 'border-pillar-communication', hex: '#3DA24A' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics', bar: 'bg-pillar-civics', border: 'border-pillar-civics', hex: '#FF9028' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness', bar: 'bg-pillar-wellness', border: 'border-pillar-wellness', hex: '#E65C5C' },
};

function getPillarLabel(key: string, short = false) {
  if (short && key?.toLowerCase() === 'communication') return 'Comm.';
  return PILLARS.find(p => p.key === key?.toLowerCase())?.label || key || '';
}

// ── Helpers (same as quest page) ──

function normalizeBlockForSave(block: any) {
  const { block_type, ...rest } = block;
  return { ...rest, type: block.type || block_type };
}

function EvidenceBlockDisplay({ block, onDelete }: { block: any; onDelete?: () => void }) {
  const blockType = block.block_type || block.type;
  const content = block.content || {};

  const deleteBtn = onDelete ? (
    <Pressable onPress={onDelete} className="p-0.5">
      <Ionicons name="close-circle" size={16} color="#9CA3AF" />
    </Pressable>
  ) : null;

  if (blockType === 'image' && content.url) {
    return (
      <HStack className="items-center gap-2 p-2 bg-surface-50 rounded-lg">
        <Image source={{ uri: content.url }} style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="cover" />
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={1}>{content.caption || content.filename || 'Photo'}</UIText>
        {deleteBtn}
      </HStack>
    );
  }
  if (blockType === 'video' && content.url) {
    return (
      <HStack className="items-center gap-2 p-2 bg-surface-50 rounded-lg">
        <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: '#6D469B20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="videocam" size={16} color="#6D469B" />
        </View>
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={1}>{content.filename || 'Video'}</UIText>
        {deleteBtn}
      </HStack>
    );
  }
  if (blockType === 'link' && (content.url || content.value)) {
    return (
      <HStack className="items-center gap-2 p-2 bg-surface-50 rounded-lg">
        <Ionicons name="link" size={14} color="#2469D1" />
        <UIText size="xs" className="text-pillar-stem flex-1" numberOfLines={1}>{content.title || content.url || content.value}</UIText>
        {deleteBtn}
      </HStack>
    );
  }
  if (blockType === 'text') {
    return (
      <HStack className="items-start gap-2 p-2 bg-surface-50 rounded-lg">
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={2}>{content.text || content.value || ''}</UIText>
        {deleteBtn}
      </HStack>
    );
  }
  if (blockType === 'document' && content.url) {
    return (
      <HStack className="items-center gap-2 p-2 bg-surface-50 rounded-lg">
        <Ionicons name="document-attach" size={14} color="#6B7280" />
        <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={1}>{content.filename || content.title || 'Document'}</UIText>
        {deleteBtn}
      </HStack>
    );
  }
  return null;
}

// ── Expandable Task Item (mirrors quest page TaskItem) ──

function CourseTaskItem({ task, onComplete, onRemove }: { task: any; onComplete: (taskId: string) => void; onRemove: (taskId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [evidenceBlocks, setEvidenceBlocks] = useState<any[]>([]);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [textEvidence, setTextEvidence] = useState('');
  const colors = pillarColors[task.pillar?.toLowerCase()] || pillarColors.stem;
  const xp = task.xp_value || task.xp_amount || 0;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Lazy-load evidence only when expanded (avoids N API calls on mount)
  useEffect(() => {
    if (expanded && !evidenceLoaded && task.id) {
      (async () => {
        try {
          const { data } = await api.get(`/api/evidence/documents/${task.id}`);
          setEvidenceBlocks(data.blocks || []);
        } catch { /* no evidence yet */ }
        finally { setEvidenceLoaded(true); }
      })();
    }
  }, [expanded, task.id]);

  const handleComplete = async () => {
    const blocks = [...evidenceBlocks];
    if (textEvidence.trim()) {
      blocks.push({ type: 'text', content: { text: textEvidence.trim() }, order_index: blocks.length });
    }
    if (blocks.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('Please attach at least one piece of evidence before completing this task.');
      }
      return;
    }
    setCompleting(true);
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: blocks.map(normalizeBlockForSave), status: 'completed',
      });
      onComplete(task.id);
      setTextEvidence('');
    } catch { /* error */ }
    finally { setCompleting(false); }
  };

  const handleFileSelect = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    (async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post(`/api/evidence/documents/${task.id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const blockType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
        const newBlock = { type: blockType, content: { url: data.url, filename: data.filename || file.name, title: file.name }, order_index: evidenceBlocks.length };
        const updatedBlocks = [...evidenceBlocks, newBlock];
        await api.post(`/api/evidence/documents/${task.id}`, { blocks: updatedBlocks.map(normalizeBlockForSave), status: 'draft' });
        setEvidenceBlocks(updatedBlocks);
      } catch { /* error */ }
      finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    })();
  };

  const handleAddText = async () => {
    if (!textEvidence.trim()) return;
    const newBlock = { type: 'text', content: { text: textEvidence.trim() }, order_index: evidenceBlocks.length };
    const updatedBlocks = [...evidenceBlocks, newBlock];
    try {
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updatedBlocks.map(normalizeBlockForSave), status: 'draft' });
      setEvidenceBlocks(updatedBlocks);
      setTextEvidence('');
    } catch { /* error */ }
  };

  return (
    <Card variant={expanded ? 'elevated' : 'outline'} size="sm" className={`border-l-4 ${colors.border}`}>
      <VStack space="sm">
        {/* Header - tap to expand */}
        <Pressable onPress={() => setExpanded(!expanded)}>
          <HStack className="items-center gap-3">
            <Ionicons
              name={task.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={task.is_completed ? '#16A34A' : '#D1D5DB'}
            />
            <VStack className="flex-1 min-w-0">
              <UIText size="sm" className={`font-poppins-medium ${task.is_completed ? 'text-typo-400 line-through' : ''}`}>
                {task.title}
              </UIText>
              <HStack className="items-center gap-2">
                <View className={`px-1.5 py-0.5 rounded ${colors.bg}`}>
                  <UIText size="xs" className={colors.text}>{getPillarLabel(task.pillar)}</UIText>
                </View>
                <UIText size="xs" className="text-typo-400">{xp} XP</UIText>
                {evidenceBlocks.length > 0 && (
                  <HStack className="items-center gap-1">
                    <Ionicons name="attach" size={12} color="#9CA3AF" />
                    <UIText size="xs" className="text-typo-400">{evidenceBlocks.length}</UIText>
                  </HStack>
                )}
              </HStack>
            </VStack>
            <Pressable onPress={(e) => { e.stopPropagation(); onRemove(task.id); }} className="p-1">
              <Ionicons name="trash-outline" size={15} color="#D1D5DB" />
            </Pressable>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
          </HStack>
        </Pressable>

        {/* Expanded - not inside the Pressable so clicks work */}
        {expanded && (
          <VStack space="sm" className="ml-9">
            {task.description && (
              <UIText size="xs" className="text-typo-500">{task.description}</UIText>
            )}

            {/* Evidence display */}
            {evidenceBlocks.length > 0 && (
              <VStack space="xs">
                {evidenceBlocks.map((block, idx) => (
                  <EvidenceBlockDisplay
                    key={block.id || idx}
                    block={block}
                    onDelete={!task.is_completed ? async () => {
                      const updated = evidenceBlocks.filter((_, i) => i !== idx);
                      try {
                        await api.post(`/api/evidence/documents/${task.id}`, {
                          blocks: updated.map(normalizeBlockForSave), status: 'draft',
                        });
                        setEvidenceBlocks(updated);
                      } catch { /* error */ }
                    } : undefined}
                  />
                ))}
              </VStack>
            )}

            {/* Capture-style evidence input (like journal) */}
            {!task.is_completed && (
              <VStack space="xs">
                <TextInput
                  className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm min-h-[48px] font-poppins"
                  placeholder="What did you do?"
                  value={textEvidence}
                  onChangeText={setTextEvidence}
                  multiline
                  textAlignVertical="top"
                  placeholderTextColor="#9CA3AF"
                />
                <HStack className="items-center justify-between">
                  <HStack className="items-center gap-2">
                    {/* Attach file */}
                    <Pressable
                      onPress={() => fileInputRef.current?.click()}
                      className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-50 border border-surface-200 active:bg-surface-100"
                    >
                      <Ionicons name="attach-outline" size={14} color="#6D469B" />
                      <UIText size="xs" className="text-optio-purple font-poppins-medium">
                        {uploading ? 'Uploading...' : 'Attach'}
                      </UIText>
                    </Pressable>
                    {/* Save text */}
                    {textEvidence.trim().length > 0 && (
                      <Pressable onPress={handleAddText}
                        className="px-2.5 py-1.5 rounded-lg bg-optio-purple active:opacity-80">
                        <UIText size="xs" className="text-white font-poppins-medium">Save Note</UIText>
                      </Pressable>
                    )}
                  </HStack>
                  {/* Mark complete */}
                  <Pressable onPress={handleComplete} disabled={completing}
                    className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 active:bg-green-100">
                    <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
                    <UIText size="xs" className="text-green-700 font-poppins-medium">
                      {completing ? 'Saving...' : 'Complete'}
                    </UIText>
                  </Pressable>
                </HStack>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef as any}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  onChange={handleFileSelect as any}
                  style={{ display: 'none' }}
                />
              </VStack>
            )}

            {/* Completed status */}
            {task.is_completed && task.completed_at && (
              <UIText size="xs" className="text-green-600">
                Completed {new Date(task.completed_at).toLocaleDateString()}
              </UIText>
            )}

          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// ── Project Section ──

function ProjectSection({
  quest,
  onTaskCompleted,
}: {
  quest: any;
  onTaskCompleted: () => void;
}) {
  const progress = quest.progress;
  const totalXp = progress?.total_xp || 0;
  const [localEarnedXp, setLocalEarnedXp] = useState(progress?.earned_xp || 0);
  const pct = totalXp > 0 ? Math.round((localEarnedXp / totalXp) * 100) : 0;
  const questId = quest.id;
  const projectImage = quest.header_image_url || quest.image_url;

  const [suggestedTasks, setSuggestedTasks] = useState<any[]>([]);
  const [userTasks, setUserTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [previewTask, setPreviewTask] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [addedSuggestionIds, setAddedSuggestionIds] = useState<Set<string>>(new Set());
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const suggestionsScrollRef = React.useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const sessionRef = React.useRef<string | null>(null);

  // Load suggested tasks from homepage data (no extra fetch)
  useEffect(() => {
    setSuggestedTasks(quest.suggested_tasks || []);
  }, [quest.suggested_tasks]);

  // Fetch user tasks only when expanded (avoids N+1 API calls)
  useEffect(() => {
    if (!expanded || userTasks.length > 0 || !questId) { if (!expanded) setTasksLoading(false); return; }
    (async () => {
      try {
        setTasksLoading(true);
        const { data } = await api.get(`/api/quests/${questId}`);
        const q = data.quest || data;
        setUserTasks(q.quest_tasks || []);
      } catch { /* non-critical */ }
      finally { setTasksLoading(false); }
    })();
  }, [expanded, questId]);

  const handleTaskComplete = (taskId: string) => {
    setUserTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t);
      const task = prev.find(t => t.id === taskId);
      if (task && !task.is_completed) {
        setLocalEarnedXp(xp => xp + (task.xp_value || task.xp_amount || 0));
      }
      return updated;
    });
  };

  // Task generation/accept
  const ensureSession = async () => {
    if (sessionRef.current) return sessionRef.current;
    const { data } = await api.post(`/api/quests/${questId}/start-personalization`, {});
    sessionRef.current = data.session_id;
    return data.session_id;
  };

  const handleGenerate = async (interests?: string, pillar?: string) => {
    const sessionId = await ensureSession();
    const { data } = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId, approach: 'hybrid',
      interests: interests ? [interests] : [],
      exclude_tasks: userTasks.map(t => t.title),
    });
    return data.tasks || data.generated_tasks || [];
  };

  const handleAcceptTask = async (task: any) => {
    const sessionId = await ensureSession();
    const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
      session_id: sessionId, task,
    });
    const newTask = data.task || {
      id: data.task_id || `temp-${Date.now()}`,
      title: task.title, description: task.description || '',
      pillar: task.pillar || 'stem', xp_value: task.xp_value || 50,
      xp_amount: task.xp_value || 50, is_completed: false, is_required: false,
    };
    setUserTasks(prev => [...prev, newTask]);
  };

  const handleAddSuggestion = async (task: any) => {
    try {
      await handleAcceptTask(task);
      setAddedSuggestionIds(prev => new Set(prev).add(task.id));
      setJustAddedId(task.id);
      setTimeout(() => setJustAddedId(null), 1500);
    } catch { /* error */ }
  };

  // Lessons come from homepage data (no extra fetch needed)
  const displayLessons = quest.lessons || [];

  useEffect(() => {
    const ids = new Set<string>();
    for (const lesson of displayLessons) {
      if (lesson.progress?.status === 'completed') ids.add(lesson.id);
    }
    if (ids.size > 0) setCompletedLessonIds(prev => {
      const merged = new Set(prev);
      ids.forEach(id => merged.add(id));
      return merged;
    });
  }, [displayLessons]);

  const handleRemoveTask = async (taskId: string) => {
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setUserTasks(prev => prev.filter(t => t.id !== taskId));
    } catch { /* error */ }
  };

  const userTaskTitles = new Set(userTasks.map((t: any) => t.title));
  const availableSuggestions = suggestedTasks.filter((t: any) => !addedSuggestionIds.has(t.id) && !userTaskTitles.has(t.title));
  const statusColor = progress?.is_completed ? '#16a34a' : localEarnedXp > 0 ? '#6D469B' : '#D1D5DB';
  const statusIcon = progress?.is_completed ? 'checkmark-circle' as const : 'ellipse' as const;

  return (
    <Card variant={expanded ? 'elevated' : 'outline'} size="md">
      {/* ── Collapsed header with image ── */}
      <Pressable onPress={() => setExpanded(!expanded)}>
        <HStack className="items-center gap-3">
          {projectImage ? (
            <Image source={{ uri: projectImage }} className="w-12 h-12 rounded-lg flex-shrink-0" resizeMode="cover" />
          ) : (
            <View className="w-12 h-12 rounded-lg bg-optio-purple/10 items-center justify-center flex-shrink-0">
              <Ionicons name="rocket-outline" size={22} color="#6D469B" />
            </View>
          )}
          <VStack className="flex-1 min-w-0">
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{quest.title}</UIText>
            <HStack className="items-center gap-2 mt-0.5">
              <View className="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                <View className="h-full bg-optio-purple rounded-full" style={{ width: `${pct}%` }} />
              </View>
              <UIText size="xs" className="font-poppins-bold text-optio-purple flex-shrink-0">
                {localEarnedXp} / {totalXp} XP
              </UIText>
            </HStack>
          </VStack>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
        </HStack>
      </Pressable>

      {/* ── Expanded content ── */}
      {expanded && (
      <VStack space="md" className="mt-4">

      {quest.description && (
        <UIText size="sm" className="text-typo-500">{quest.description}</UIText>
      )}

      {/* ── 1. Lessons ── */}
      {displayLessons.length > 0 && (
        <VStack space="sm">
          <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Lessons</UIText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 16 }}
          >
            {displayLessons.map((lesson: any, idx: number) => {
              const hasContent = lesson.content?.steps?.length > 0 || lesson.video_url;
              const isDone = completedLessonIds.has(lesson.id);
              return (
                <Pressable
                  key={lesson.id || idx}
                  onPress={() => hasContent ? setActiveLesson(lesson) : undefined}
                  disabled={!hasContent}
                  style={{ width: 180 }}
                >
                  <Card variant={isDone ? 'filled' : 'outline'} size="sm" className={`h-full ${isDone ? 'bg-green-50' : ''}`}>
                    <VStack space="xs" className="flex-1 justify-between">
                      <HStack className="items-center gap-1.5">
                        <Ionicons
                          name={isDone ? 'checkmark-circle' : 'book-outline'}
                          size={14}
                          color={isDone ? '#16a34a' : '#6D469B'}
                        />
                        <UIText size="xs" className={`font-poppins-medium flex-1 ${isDone ? 'text-green-700' : ''}`} numberOfLines={2}>
                          {lesson.title}
                        </UIText>
                      </HStack>
                      {!hasContent && (
                        <UIText size="xs" className="text-typo-300">Coming soon</UIText>
                      )}
                    </VStack>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        </VStack>
      )}

      {/* Lesson viewer */}
      {activeLesson && (
        <View className="mt-2">
          <LessonViewer
            lesson={activeLesson}
            questId={questId}
            onClose={() => setActiveLesson(null)}
            onComplete={() => setCompletedLessonIds(prev => new Set(prev).add(activeLesson.id))}
          />
        </View>
      )}

      {/* ── 2. Your Tasks ── */}
      <VStack space="sm">
        <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Your tasks</UIText>
        {tasksLoading ? (
          <VStack space="sm">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </VStack>
        ) : userTasks.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {userTasks.map((t: any) => (
              <View key={t.id} style={{ width: '49%', minWidth: 280 }}>
                <CourseTaskItem task={t} onComplete={handleTaskComplete} onRemove={handleRemoveTask} />
              </View>
            ))}
          </View>
        ) : (
          <Card variant="filled" size="sm">
            <HStack className="items-center gap-3">
              <Ionicons name="clipboard-outline" size={22} color="#9CA3AF" />
              <VStack className="flex-1">
                <UIText size="xs" className="font-poppins-medium">No tasks added yet</UIText>
                <UIText size="xs" className="text-typo-400">
                  Add tasks to earn {totalXp} XP and complete this project.
                </UIText>
              </VStack>
            </HStack>
          </Card>
        )}
      </VStack>

      {/* ── 3. Suggested Tasks Carousel ── */}
      {availableSuggestions.length > 0 && (
        <VStack space="sm">
          <HStack className="items-center justify-between">
            <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Suggested tasks</UIText>
            {justAddedId && (
              <HStack className="items-center gap-1 px-2 py-1 rounded bg-green-50">
                <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                <UIText size="xs" className="text-green-700 font-poppins-medium">Task added</UIText>
              </HStack>
            )}
          </HStack>
          <View>
            {/* Left arrow - web only */}
            {Platform.OS === 'web' && scrollOffset > 0 && (
              <Pressable
                onPress={() => {
                  const newOffset = Math.max(0, scrollOffset - 456);
                  suggestionsScrollRef.current?.scrollTo({ x: newOffset, animated: true });
                }}
                className="absolute left-0 top-0 bottom-0 z-10 w-8 items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
              >
                <Ionicons name="chevron-back" size={20} color="#6D469B" />
              </Pressable>
            )}

            <ScrollView
              ref={suggestionsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 16, paddingLeft: 4 }}
              onScroll={(e) => setScrollOffset(e.nativeEvent.contentOffset.x)}
              scrollEventThrottle={100}
            >
              <HStack style={{ gap: 8 }}>
                {Array.from({ length: Math.ceil(availableSuggestions.length / 2) }).map((_, colIdx) => {
                  const top = availableSuggestions[colIdx * 2];
                  const bottom = availableSuggestions[colIdx * 2 + 1];
                  return (
                    <VStack key={colIdx} style={{ width: 220, gap: 8 }}>
                      {[top, bottom].filter(Boolean).map((t: any) => {
                        const colors = pillarColors[t.pillar?.toLowerCase()] || pillarColors.stem;
                        return (
                          <Pressable key={t.id} onPress={() => setPreviewTask(t)} style={{ height: 88 }}>
                            <Card variant="outline" size="sm" className={`border-l-4 ${colors.border} h-full`}>
                              <VStack className="flex-1 justify-between">
                                <UIText size="xs" className="font-poppins-medium" numberOfLines={2}>{t.title}</UIText>
                                <HStack className="items-center justify-between mt-1">
                                  <HStack className="items-center gap-1.5">
                                    <View className={`px-1.5 py-0.5 rounded ${colors.bg}`}>
                                      <UIText size="xs" className={colors.text}>{getPillarLabel(t.pillar, true)}</UIText>
                                    </View>
                                    <UIText size="xs" className="text-typo-400">{t.xp_value || 0} XP</UIText>
                                  </HStack>
                                  <Pressable
                                    onPress={(e) => { e.stopPropagation(); handleAddSuggestion(t); }}
                                    className="flex-row items-center gap-1 px-2 py-1 rounded bg-optio-purple/10 active:bg-optio-purple/20"
                                  >
                                    <Ionicons name="add" size={12} color="#6D469B" />
                                    <UIText size="xs" className="text-optio-purple font-poppins-medium">Add</UIText>
                                  </Pressable>
                                </HStack>
                              </VStack>
                            </Card>
                          </Pressable>
                        );
                      })}
                    </VStack>
                  );
                })}
              </HStack>
            </ScrollView>

            {/* Right arrow - web only */}
            {Platform.OS === 'web' && availableSuggestions.length > 4 && (
              <Pressable
                onPress={() => {
                  const newOffset = scrollOffset + 456;
                  suggestionsScrollRef.current?.scrollTo({ x: newOffset, animated: true });
                }}
                className="absolute right-0 top-0 bottom-0 z-10 w-8 items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
              >
                <Ionicons name="chevron-forward" size={20} color="#6D469B" />
              </Pressable>
            )}
          </View>
        </VStack>
      )}

      {/* ── 4. Create Your Own ── */}
      <VStack space="xs">
        <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Create your own</UIText>
        <HStack className="items-center justify-between">
          <UIText size="xs" className="text-typo-400">Write a custom task or use AI to generate personalized ideas.</UIText>
          <Pressable
            onPress={() => setWizardOpen(true)}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20 flex-shrink-0 ml-3"
          >
            <Ionicons name="sparkles" size={14} color="#6D469B" />
            <UIText size="xs" className="text-optio-purple font-poppins-medium">Create Tasks</UIText>
          </Pressable>
        </HStack>
      </VStack>

      {/* Task preview modal */}
      {previewTask && (() => {
        const pc = pillarColors[previewTask.pillar?.toLowerCase()] || pillarColors.stem;
        return (
          <Modal visible={!!previewTask} transparent animationType="fade" onRequestClose={() => setPreviewTask(null)}>
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              onPress={() => setPreviewTask(null)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation?.()}
                style={{ backgroundColor: '#FFFFFF', borderRadius: 20, width: 480, maxWidth: '92%', maxHeight: '80%' }}
              >
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                  <VStack space="md">
                    <HStack className="items-center justify-between">
                      <HStack className="items-center gap-2">
                        <View className={`px-2 py-1 rounded ${pc.bg}`}>
                          <UIText size="xs" className={`${pc.text} font-poppins-medium`}>{getPillarLabel(previewTask.pillar)}</UIText>
                        </View>
                        <UIText size="xs" className="text-typo-400 font-poppins-bold">{previewTask.xp_value || 0} XP</UIText>
                      </HStack>
                      <Pressable onPress={() => setPreviewTask(null)} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                        <Ionicons name="close" size={16} color="#6B7280" />
                      </Pressable>
                    </HStack>
                    <Heading size="md">{previewTask.title}</Heading>
                    {previewTask.description && (
                      <UIText size="sm" className="text-typo-500 leading-6">{previewTask.description}</UIText>
                    )}
                    <Button size="md" onPress={() => { handleAddSuggestion(previewTask); setPreviewTask(null); }}>
                      <ButtonText>Add to My Tasks</ButtonText>
                    </Button>
                  </VStack>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

      {/* Task creation wizard (AI + manual only, no browse) */}
      <TaskCreationWizard
        questId={questId}
        questTitle={quest.title}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onGenerate={handleGenerate}
        onAcceptTask={handleAcceptTask}
      />

      </VStack>
      )}
    </Card>
  );
}

// ── Main ──

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { course, loading, error, enroll, unenroll, refetch } = useCourseDetail(id || null);
  const user = useAuthStore((s) => s.user);
  const [enrolling, setEnrolling] = useState(false);
  const [resetting, setResetting] = useState(false);

  const effectiveRole = user?.role === 'org_managed' ? user?.org_role : user?.role;
  const isSuperadmin = effectiveRole === 'superadmin';

  const handleEnroll = async () => {
    setEnrolling(true);
    try { await enroll(); } finally { setEnrolling(false); }
  };

  const handleResetProgress = () => {
    if (typeof window !== 'undefined') {
      if (!window.confirm('Reset all progress? This unenrolls and re-enrolls with a clean slate.')) return;
    }
    (async () => {
      setResetting(true);
      try { await unenroll(); await enroll(); await refetch(); } finally { setResetting(false); }
    })();
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <VStack className="px-5 md:px-8 pt-6" space="lg">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-8 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-32 rounded-xl" />
        </VStack>
      </SafeAreaView>
    );
  }

  if (error || !course) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Heading size="md" className="text-typo-500 mt-4">Course not found</Heading>
        <UIText size="sm" className="text-typo-400 mt-2 text-center">{error || 'This course may have been removed.'}</UIText>
        <Button className="mt-6" onPress={() => router.back()}><ButtonText>Go Back</ButtonText></Button>
      </SafeAreaView>
    );
  }

  const isEnrolled = !!course.enrollment;
  const quests = (course.quests || []).sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0));
  const imageUrl = course.cover_image_url;
  const progress = course.progress;
  const totalXp = progress?.total_xp || quests.reduce((s: number, q: any) => s + (q.progress?.total_xp || 0), 0);
  const earnedXp = progress?.earned_xp || quests.reduce((s: number, q: any) => s + (q.progress?.earned_xp || 0), 0);
  const completedQuests = progress?.completed_quests || quests.filter((q: any) => q.progress?.is_completed).length;
  const pct = totalXp > 0 ? Math.round((earnedXp / totalXp) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

        {/* Full-bleed hero */}
        {imageUrl ? (
          <View className="h-72 md:h-96 w-full">
            <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="white" />
            </Pressable>
          </View>
        ) : (
          <View className="h-48 w-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="school-outline" size={60} color="#6D469B" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-surface-200 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </Pressable>
          </View>
        )}

        <VStack className="max-w-4xl w-full md:mx-auto">
          <VStack className="px-5 md:px-8 pt-6 pb-12" space="lg">

            {/* Title */}
            <HStack className="items-center justify-between">
              <Heading size="2xl">{course.title}</Heading>
              {isSuperadmin && isEnrolled && (
                <Pressable onPress={handleResetProgress} disabled={resetting}>
                  <UIText size="xs" className="text-red-400">{resetting ? 'Resetting...' : 'Reset Progress'}</UIText>
                </Pressable>
              )}
            </HStack>

            {/* Description */}
            {course.description && (
              <UIText className="text-typo-500 leading-6">{course.description}</UIText>
            )}

            {/* Enrollment CTA */}
            {!isEnrolled && (
              <Card variant="elevated" size="lg" className="items-center">
                <VStack space="md" className="items-center w-full">
                  <Ionicons name="school" size={32} color="#6D469B" />
                  <Heading size="md">Ready to start?</Heading>
                  <UIText size="sm" className="text-typo-500 text-center">
                    Enroll to access projects, tasks, and lessons.
                  </UIText>
                  <Button size="lg" className="w-full" onPress={handleEnroll} disabled={enrolling}>
                    <ButtonText>{enrolling ? 'Enrolling...' : 'Enroll in Course'}</ButtonText>
                  </Button>
                </VStack>
              </Card>
            )}

            {/* Course progress */}
            {isEnrolled && (
              <Card variant="elevated" size="md">
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <UIText size="sm" className="font-poppins-medium">Course Progress</UIText>
                    <UIText size="sm" className="font-poppins-bold text-optio-purple">
                      {completedQuests}/{quests.length} projects
                    </UIText>
                  </HStack>
                  <View className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
                    <View className="h-full bg-optio-purple rounded-full" style={{ width: `${pct}%` }} />
                  </View>
                  <HStack className="items-center gap-1">
                    <Ionicons name="star" size={14} color="#FF9028" />
                    <UIText size="xs" className="text-typo-500 font-poppins-medium">
                      {earnedXp} / {totalXp} XP
                    </UIText>
                  </HStack>
                </VStack>
              </Card>
            )}


            {/* Project sections */}
            {isEnrolled && quests.length > 0 && (
              <VStack space="lg">
                {quests.map((q: any) => (
                  <ProjectSection
                    key={q.id}
                    quest={q}
                    onTaskCompleted={refetch}
                  />
                ))}
              </VStack>
            )}

          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
