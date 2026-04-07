/**
 * GenerateTasksModal - Simplified AI-only task generation wizard for mobile journal.
 *
 * Flow: optional interests input → Generate → swipe-through accept/skip.
 * No manual entry, no pillar/XP selection — AI handles it all.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Heading, Button, ButtonText, PillarBadge, Divider } from '../ui';

interface Props {
  visible: boolean;
  questTitle: string;
  onClose: () => void;
  onGenerate: (interests?: string) => Promise<any[]>;
  onAcceptTask: (task: any) => Promise<any>;
}

export function GenerateTasksModal({ visible, questTitle, onClose, onGenerate, onAcceptTask }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [interests, setInterests] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [accepting, setAccepting] = useState(false);

  const reset = () => {
    setStep('input');
    setInterests('');
    setGenerating(false);
    setError(null);
    setSuggestions([]);
    setReviewIndex(0);
    setAcceptedCount(0);
    setAccepting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const tasks = await onGenerate(interests || undefined);
      if (!tasks || tasks.length === 0) {
        setError('No tasks generated. Try different interests.');
        return;
      }
      setSuggestions(tasks);
      setReviewIndex(0);
      setAcceptedCount(0);
      setStep('review');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to generate tasks';
      setError(msg.includes('429') || msg.includes('quota')
        ? 'AI is busy. Please wait a moment and try again.' : msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAcceptTask(suggestions[reviewIndex]);
      setAcceptedCount((c) => c + 1);
      advance();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setAccepting(false);
    }
  };

  const handleSkip = () => advance();

  const advance = () => {
    if (reviewIndex < suggestions.length - 1) {
      setReviewIndex((i) => i + 1);
    } else {
      handleClose();
    }
  };

  if (!visible) return null;

  const currentTask = suggestions[reviewIndex];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable style={{ flex: 0.15 }} onPress={handleClose} />

          <View
            className="bg-white rounded-t-2xl flex-1"
            style={{ paddingBottom: insets.bottom || 16, maxHeight: '85%' }}
          >
            {/* Handle */}
            <View className="items-center py-2">
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#CEC6D6' }} />
            </View>

            {/* Header */}
            <View className="px-5 pb-3 border-b border-surface-200">
              <HStack className="items-center justify-between">
                <VStack>
                  <Heading size="md">Generate Task Ideas</Heading>
                  <UIText size="xs" className="text-typo-400" numberOfLines={1}>{questTitle}</UIText>
                </VStack>
                <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={16} color="#6B6280" />
                </Pressable>
              </HStack>
            </View>

            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {/* Error */}
              {error && (
                <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <UIText size="sm" className="text-red-700">{error}</UIText>
                </View>
              )}

              {/* Step 1: Interests input */}
              {step === 'input' && (
                <VStack space="lg">
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium text-typo-700">
                      What are you interested in? (optional)
                    </UIText>
                    <UIText size="xs" className="text-typo-400">
                      Describe your interests and the AI will create personalized tasks for this quest.
                    </UIText>
                  </VStack>

                  <TextInput
                    value={interests}
                    onChangeText={setInterests}
                    placeholder="e.g. photography, cooking, robotics..."
                    placeholderTextColor="#9A93A8"
                    multiline
                    numberOfLines={3}
                    className="bg-surface-100 rounded-xl px-4 py-3 font-poppins text-sm"
                    style={{ outline: 'none', minHeight: 80, textAlignVertical: 'top' } as any}
                  />

                  <Button
                    size="lg"
                    onPress={handleGenerate}
                    loading={generating}
                    disabled={generating}
                    className="w-full"
                  >
                    <ButtonText>{generating ? 'Generating...' : 'Generate Tasks'}</ButtonText>
                  </Button>
                </VStack>
              )}

              {/* Step 2: Review tasks one at a time */}
              {step === 'review' && currentTask && (
                <VStack space="md">
                  {/* Progress */}
                  <HStack className="items-center justify-between">
                    <UIText size="xs" className="text-typo-400 font-poppins-medium">
                      Task {reviewIndex + 1} of {suggestions.length}
                    </UIText>
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">
                      {acceptedCount} added
                    </UIText>
                  </HStack>
                  <View className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-optio-purple rounded-full"
                      style={{ width: `${((reviewIndex + 1) / suggestions.length) * 100}%` }}
                    />
                  </View>

                  {/* Task card */}
                  <View className="bg-brand-surface-50 border border-brand-surface-200 rounded-2xl p-5">
                    <VStack space="sm">
                      <HStack className="items-center justify-between">
                        <PillarBadge pillar={currentTask.pillar || 'stem'} size="md" />
                        <UIText size="sm" className="font-poppins-bold text-optio-purple">
                          {currentTask.xp_value || 50} XP
                        </UIText>
                      </HStack>

                      <Heading size="md">{currentTask.title}</Heading>
                      <UIText size="sm" className="text-typo-500 leading-5">
                        {currentTask.description}
                      </UIText>
                    </VStack>
                  </View>

                  {/* Accept / Skip buttons */}
                  <HStack className="gap-3">
                    <Pressable
                      onPress={handleSkip}
                      disabled={accepting}
                      className="flex-1 items-center justify-center py-3.5 rounded-xl border border-surface-300 active:bg-surface-50"
                    >
                      <UIText size="sm" className="font-poppins-semibold text-typo-500">Skip</UIText>
                    </Pressable>
                    <Pressable
                      onPress={handleAccept}
                      disabled={accepting}
                      className="flex-1 items-center justify-center py-3.5 rounded-xl bg-optio-purple active:bg-optio-purple-dark"
                      style={{ opacity: accepting ? 0.6 : 1 }}
                    >
                      <UIText size="sm" className="font-poppins-semibold text-white">
                        {accepting ? 'Adding...' : 'Add Task'}
                      </UIText>
                    </Pressable>
                  </HStack>
                </VStack>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
