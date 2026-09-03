/**
 * EvolveTopicModal - Turn a journal topic (interest track) into a private quest.
 *
 * Mirrors the web app's EvolveTopicModal: fetch the AI-suggested quest
 * structure for the topic's moments, let the student review and edit the
 * title and description, show the suggested tasks, then create the quest.
 *
 * The backend requires a title, so this is the step the mobile app was
 * missing: it used to POST an empty body and every Evolve tap failed with
 * "Request body is required".
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Heading, Button, ButtonText, PillarBadge } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  previewEvolvedQuest, evolveTrackToQuest,
  type EvolvePreview, type EvolvePreviewTask,
} from '@/src/hooks/useJournal';

interface Props {
  visible: boolean;
  trackId: string | null;
  trackName?: string;
  momentCount: number;
  onClose: () => void;
  /** Called with the new quest's id after it is created; the modal has already reset. */
  onSuccess: (questId: string) => void;
}

export function EvolveTopicModal({ visible, trackId, trackName, momentCount, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EvolvePreview | null>(null);

  // Editable fields, seeded from the AI preview.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<EvolvePreviewTask[]>([]);

  // Ignore a preview that lands after the modal was closed or reopened for
  // another topic.
  const requestSeq = useRef(0);

  const reset = () => {
    requestSeq.current += 1;
    setLoadingPreview(false);
    setSubmitting(false);
    setError(null);
    setPreview(null);
    setTitle('');
    setDescription('');
    setTasks([]);
  };

  const fetchPreview = async () => {
    if (!trackId) return;
    const seq = ++requestSeq.current;
    setLoadingPreview(true);
    setError(null);
    setPreview(null);
    try {
      const res = await previewEvolvedQuest(trackId);
      if (seq !== requestSeq.current) return;
      if (res.success && res.preview) {
        setPreview(res.preview);
        setTitle(res.preview.title || '');
        setDescription(res.preview.description || '');
        setTasks(res.preview.tasks || []);
      } else {
        setError(res.error || 'Failed to generate preview');
      }
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      setError(err.response?.data?.error || 'Failed to generate quest preview');
    } finally {
      if (seq === requestSeq.current) setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (visible && trackId) {
      void fetchPreview();
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, trackId]);

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!trackId || submitting) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Quest title is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await evolveTrackToQuest(trackId, {
        title: cleanTitle,
        description: description.trim() || null,
        tasks,
      });
      if (result.success && result.quest_id) {
        const questId = result.quest_id;
        reset();
        onSuccess(questId);
      } else {
        setError(result.error || 'Failed to evolve topic');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to evolve topic into quest');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  const totalXp = tasks.reduce((sum, t) => sum + (t.xp_value || 0), 0);
  const canSubmit = !!preview && !loadingPreview && !submitting && title.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable style={{ flex: 0.1 }} onPress={handleClose} />

          <View
            className="bg-white dark:bg-dark-surface-100 rounded-t-2xl flex-1"
            style={{ paddingBottom: insets.bottom || 16, maxHeight: '90%' }}
          >
            {/* Handle */}
            <View className="items-center py-2">
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
            </View>

            {/* Header */}
            <View className="px-5 pb-3 border-b border-surface-200 dark:border-dark-surface-300">
              <HStack className="items-center justify-between">
                <VStack className="flex-1 pr-3">
                  <Heading size="md">Evolve into Quest</Heading>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
                    {trackName ? `${trackName} · ` : ''}AI will suggest a quest from your {momentCount} moments
                  </UIText>
                </VStack>
                <Pressable
                  onPress={handleClose}
                  accessibilityLabel="Close"
                  className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
                >
                  <Ionicons name="close" size={16} color={c.icon} />
                </Pressable>
              </HStack>
            </View>

            <ScrollView
              className="flex-1 px-5"
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Loading the AI preview */}
              {loadingPreview && (
                <VStack className="items-center py-12" space="sm">
                  <ActivityIndicator size="large" color={c.brand} />
                  <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">
                    Generating quest structure...
                  </UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    AI is analyzing your learning moments
                  </UIText>
                </VStack>
              )}

              {/* Error (preview failed, or the create failed) */}
              {!loadingPreview && error && (
                <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <UIText size="sm" className="text-red-700">{error}</UIText>
                  {!preview && (
                    <Pressable onPress={fetchPreview} className="mt-2 self-start">
                      <UIText size="sm" className="font-poppins-semibold text-optio-purple">Try Again</UIText>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Preview loaded: editable form */}
              {!loadingPreview && preview && (
                <VStack space="lg">
                  <View className="bg-brand-surface-50 dark:bg-dark-brand-surface-50 border border-brand-surface-200 dark:border-dark-brand-surface-200 rounded-xl px-4 py-3">
                    <HStack className="items-start gap-2">
                      <Ionicons name="sparkles" size={16} color={c.brand} style={{ marginTop: 2 }} />
                      <VStack className="flex-1">
                        <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700">
                          AI has analyzed your moments and suggested a quest. Review and edit as needed.
                        </UIText>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1">
                          This quest will be private and only visible to you.
                        </UIText>
                      </VStack>
                    </HStack>
                  </View>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">
                      Quest title
                    </UIText>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Quest title"
                      placeholderTextColor={c.textFaint}
                      maxLength={200}
                      className="bg-surface-100 dark:bg-dark-surface-200 text-typo dark:text-dark-typo rounded-xl px-4 py-3 font-poppins text-sm"
                      style={{ outline: 'none' } as any}
                    />
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">
                      Description
                    </UIText>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="What is this quest about?"
                      placeholderTextColor={c.textFaint}
                      multiline
                      numberOfLines={3}
                      maxLength={1000}
                      className="bg-surface-100 dark:bg-dark-surface-200 text-typo dark:text-dark-typo rounded-xl px-4 py-3 font-poppins text-sm"
                      style={{ outline: 'none', minHeight: 80, textAlignVertical: 'top' } as any}
                    />
                  </VStack>

                  <VStack space="sm">
                    <HStack className="items-center justify-between">
                      <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">
                        Suggested tasks ({tasks.length})
                      </UIText>
                      <UIText size="xs" className="font-poppins-bold text-optio-purple">
                        {totalXp} XP
                      </UIText>
                    </HStack>
                    {tasks.map((task, index) => (
                      <View
                        key={`${index}-${task.title}`}
                        className="bg-surface-50 dark:bg-dark-surface-200 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3"
                      >
                        <HStack className="items-center justify-between mb-1">
                          <PillarBadge pillar={task.pillar || 'stem'} size="sm" />
                          <UIText size="xs" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500">
                            {task.xp_value || 0} XP
                          </UIText>
                        </HStack>
                        <UIText size="sm" className="font-poppins-medium">{task.title}</UIText>
                        {task.description ? (
                          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-0.5" numberOfLines={2}>
                            {task.description}
                          </UIText>
                        ) : null}
                      </View>
                    ))}
                  </VStack>

                  {preview.learning_outcomes && preview.learning_outcomes.length > 0 && (
                    <View className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                      <UIText size="xs" className="font-poppins-medium text-green-800 mb-1">Learning outcomes</UIText>
                      {preview.learning_outcomes.map((outcome, i) => (
                        <UIText key={i} size="xs" className="text-green-700">{`• ${outcome}`}</UIText>
                      ))}
                    </View>
                  )}
                </VStack>
              )}
            </ScrollView>

            {/* Footer */}
            {!loadingPreview && preview && (
              <View className="px-5 pt-3 border-t border-surface-200 dark:border-dark-surface-300">
                <HStack className="gap-3">
                  <Pressable
                    onPress={handleClose}
                    disabled={submitting}
                    className="flex-1 items-center justify-center py-3.5 rounded-xl border border-surface-300 dark:border-dark-surface-300 active:bg-surface-50 dark:active:bg-dark-surface-50"
                  >
                    <UIText size="sm" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500">Cancel</UIText>
                  </Pressable>
                  <Button
                    size="lg"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={!canSubmit}
                    className="flex-1"
                  >
                    <ButtonText>{submitting ? 'Creating...' : 'Create Quest'}</ButtonText>
                  </Button>
                </HStack>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
