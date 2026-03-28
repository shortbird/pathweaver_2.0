/**
 * TaskCreationWizard - Shared modal for creating tasks via manual entry or AI generation.
 *
 * Used by both the quest detail page and course detail page.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PILLARS } from '@/src/hooks/useQuestDetail';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText, Divider,
} from '@/src/components/ui';

const pillarColors: Record<string, { bg: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness' },
};

const XP_OPTIONS = [
  { value: 50, label: '50 XP', desc: 'Small task' },
  { value: 100, label: '100 XP', desc: 'Medium task' },
  { value: 150, label: '150 XP', desc: 'Large task' },
  { value: 200, label: '200 XP', desc: 'Major task' },
];

interface TaskCreationWizardProps {
  questId: string;
  questTitle: string;
  open: boolean;
  onClose: () => void;
  onGenerate: (interests?: string, pillar?: string, subject?: string) => Promise<any[]>;
  onAcceptTask: (task: any) => Promise<void>;
  /** Optional suggested/template tasks to browse. When provided, a third "Browse Suggestions" option appears. */
  suggestedTasks?: any[];
}

export function TaskCreationWizard({
  questId,
  questTitle,
  open,
  onClose,
  onGenerate,
  onAcceptTask,
  suggestedTasks,
}: TaskCreationWizardProps) {
  const [step, setStep] = useState<'choose' | 'manual' | 'ai-personalize' | 'ai-review' | 'browse'>('choose');
  const [error, setError] = useState<string | null>(null);

  // Track added suggestions within the wizard
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  // Manual task fields
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualPillar, setManualPillar] = useState('stem');
  const [manualXP, setManualXP] = useState(100);
  const [manualAdded, setManualAdded] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // AI fields
  const [interests, setInterests] = useState('');
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // AI review
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(false);

  const reset = () => {
    setStep('choose');
    setError(null);
    setAddedIds(new Set());
    setJustAddedId(null);
    setManualTitle('');
    setManualDesc('');
    setManualPillar('stem');
    setManualXP(100);
    setManualAdded(0);
    setInterests('');
    setSelectedPillar(null);
    setSuggestions([]);
    setReviewIndex(0);
    setAcceptedCount(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleManualSubmit = async () => {
    if (!manualTitle.trim()) { setError('Task title is required'); return; }
    if (manualTitle.trim().length < 3) { setError('Title must be at least 3 characters'); return; }
    if (!manualDesc.trim()) { setError('Description is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onAcceptTask({
        title: manualTitle.trim(),
        description: manualDesc.trim(),
        pillar: manualPillar,
        xp_value: manualXP,
      });
      setManualTitle('');
      setManualDesc('');
      setManualAdded((c) => c + 1);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const tasks = await onGenerate(interests || undefined, selectedPillar || undefined, undefined);
      if (!tasks || tasks.length === 0) {
        setError('No tasks generated. Try different interests.');
        return;
      }
      setSuggestions(tasks);
      setReviewIndex(0);
      setAcceptedCount(0);
      setStep('ai-review');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Failed to generate tasks';
      setError(msg.includes('429') || msg.includes('quota')
        ? 'AI is busy. Please wait 30 seconds and try again.' : msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    setReviewLoading(true);
    try {
      await onAcceptTask(suggestions[reviewIndex]);
      setAcceptedCount((c) => c + 1);
      if (reviewIndex < suggestions.length - 1) {
        setReviewIndex((i) => i + 1);
      } else {
        handleClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleSkip = () => {
    if (reviewIndex < suggestions.length - 1) {
      setReviewIndex((i) => i + 1);
    } else {
      handleClose();
    }
  };

  if (!open) return null;

  const currentTask = suggestions[reviewIndex];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={handleClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 20, width: 560, maxWidth: '92%', maxHeight: '85%' }}
        >
          <ScrollView contentContainerStyle={{ padding: 28 }} keyboardShouldPersistTaps="handled">
            <VStack space="md">
              {/* Header */}
              <HStack className="items-center justify-between">
                <UIText size="sm" className="font-poppins-semibold text-typo-400 uppercase tracking-wider">
                  {step === 'choose' ? 'Add Task' : step === 'manual' ? 'Create Task' : step === 'browse' ? 'Suggested Tasks' : step === 'ai-personalize' ? 'Personalize' : `Task ${reviewIndex + 1} of ${suggestions.length}`}
                </UIText>
                <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={16} color="#6B7280" />
                </Pressable>
              </HStack>

              {/* Progress bar */}
              {step !== 'choose' && (
                <View className="h-1 bg-surface-200 rounded-full overflow-hidden">
                  <View
                    className="h-full bg-optio-purple rounded-full"
                    style={{
                      width: step === 'manual' ? '100%'
                        : step === 'ai-personalize' ? '50%'
                        : `${((reviewIndex + 1) / suggestions.length) * 100}%`,
                    }}
                  />
                </View>
              )}

              {error && (
                <View className="bg-red-50 p-3 rounded-lg">
                  <UIText size="sm" className="text-red-600">{error}</UIText>
                </View>
              )}

              {/* Step: Choose method */}
              {step === 'choose' && (
                <VStack space="sm">
                  <HStack className="gap-4">
                    {suggestedTasks && suggestedTasks.length > 0 && (
                      <Pressable
                        onPress={() => { setError(null); setStep('browse'); }}
                        className="flex-1 p-5 border-2 border-surface-200 rounded-xl"
                        style={{ cursor: 'pointer' } as any}
                      >
                        <VStack className="items-center" space="sm">
                          <View className="w-12 h-12 rounded-xl bg-pillar-stem/10 items-center justify-center">
                            <Ionicons name="list-outline" size={24} color="#2469D1" />
                          </View>
                          <UIText size="sm" className="font-poppins-bold text-center">Browse Ideas</UIText>
                          <UIText size="xs" className="text-typo-400 text-center">{suggestedTasks.filter((t: any) => !addedIds.has(t.id)).length} suggested tasks</UIText>
                        </VStack>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => { setError(null); setStep('ai-personalize'); }}
                      className="flex-1 p-5 border-2 border-surface-200 rounded-xl"
                      style={{ cursor: 'pointer' } as any}
                    >
                      <VStack className="items-center" space="sm">
                        <View className="w-12 h-12 rounded-xl bg-optio-purple/10 items-center justify-center">
                          <Ionicons name="sparkles" size={24} color="#6D469B" />
                        </View>
                        <UIText size="sm" className="font-poppins-bold text-center">AI Generate</UIText>
                        <UIText size="xs" className="text-typo-400 text-center">Get personalized suggestions</UIText>
                      </VStack>
                    </Pressable>

                    <Pressable
                      onPress={() => { setError(null); setStep('manual'); }}
                      className="flex-1 p-5 border-2 border-surface-200 rounded-xl"
                      style={{ cursor: 'pointer' } as any}
                    >
                      <VStack className="items-center" space="sm">
                        <View className="w-12 h-12 rounded-xl bg-optio-pink/10 items-center justify-center">
                          <Ionicons name="create-outline" size={24} color="#EF597B" />
                        </View>
                        <UIText size="sm" className="font-poppins-bold text-center">Write My Own</UIText>
                        <UIText size="xs" className="text-typo-400 text-center">Create a custom task</UIText>
                      </VStack>
                    </Pressable>
                  </HStack>
                </VStack>
              )}

              {/* Step: Browse suggested tasks */}
              {step === 'browse' && suggestedTasks && (
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <UIText size="xs" className="text-typo-400">Tap a task to add it to your project.</UIText>
                    {justAddedId && (
                      <HStack className="items-center gap-1 px-2 py-1 rounded bg-green-50">
                        <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                        <UIText size="xs" className="text-green-700 font-poppins-medium">Task added</UIText>
                      </HStack>
                    )}
                  </HStack>
                  {suggestedTasks.filter((t: any) => !addedIds.has(t.id)).map((t: any) => {
                    const pc = pillarColors[t.pillar?.toLowerCase()] || pillarColors.stem;
                    const label = t.pillar === 'stem' ? 'STEM' : t.pillar?.charAt(0).toUpperCase() + t.pillar?.slice(1);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={async () => {
                          try {
                            await onAcceptTask(t);
                            setAddedIds(prev => new Set(prev).add(t.id));
                            setJustAddedId(t.id);
                            setTimeout(() => setJustAddedId(null), 1500);
                          } catch { /* error */ }
                        }}
                        className="border border-surface-200 rounded-xl p-4 bg-surface-50 active:bg-surface-100"
                        style={{ cursor: 'pointer' } as any}
                      >
                        <HStack className="items-center gap-3">
                          <VStack className="flex-1 min-w-0">
                            <UIText size="sm" className="font-poppins-medium">{t.title}</UIText>
                            {t.description && (
                              <UIText size="xs" className="text-typo-400 mt-0.5" numberOfLines={2}>{t.description}</UIText>
                            )}
                            <HStack className="items-center gap-2 mt-1">
                              <View className={`px-1.5 py-0.5 rounded ${pc.bg}`}>
                                <UIText size="xs" className={pc.text}>{label}</UIText>
                              </View>
                              <UIText size="xs" className="text-typo-400">{t.xp_value || 0} XP</UIText>
                            </HStack>
                          </VStack>
                          <Ionicons name="add-circle-outline" size={22} color="#6D469B" />
                        </HStack>
                      </Pressable>
                    );
                  })}

                  {suggestedTasks.filter((t: any) => !addedIds.has(t.id)).length === 0 && (
                    <Card variant="filled" size="sm" className="items-center py-4">
                      <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                      <UIText size="xs" className="text-green-700 font-poppins-medium mt-1">All suggestions added</UIText>
                    </Card>
                  )}

                  <Divider />

                  <Button variant="outline" size="md" onPress={() => setStep('choose')}>
                    <ButtonText>Back</ButtonText>
                  </Button>
                </VStack>
              )}

              {/* Step: Manual task creation */}
              {step === 'manual' && (
                <VStack space="md">
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Task Title *</UIText>
                    <TextInput
                      value={manualTitle}
                      onChangeText={(t) => { setError(null); setManualTitle(t); }}
                      placeholder="e.g., Interview my grandparent about their childhood"
                      placeholderTextColor="#9CA3AF"
                      className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm"
                      style={{ fontFamily: 'Poppins_400Regular' }}
                    />
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Description *</UIText>
                    <TextInput
                      value={manualDesc}
                      onChangeText={(t) => { setError(null); setManualDesc(t); }}
                      placeholder="Describe what you'll do, how you'll explore, and what you hope to discover..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={4}
                      className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm min-h-[100px]"
                      style={{ fontFamily: 'Poppins_400Regular', textAlignVertical: 'top' }}
                    />
                    <UIText size="xs" className="text-typo-300">{manualDesc.length} characters</UIText>
                  </VStack>

                  <HStack className="gap-6">
                    <VStack space="xs" className="flex-1">
                      <UIText size="sm" className="font-poppins-medium">Pillar *</UIText>
                      <HStack className="flex-wrap gap-2">
                        {PILLARS.map((p) => (
                          <Pressable key={p.key} onPress={() => setManualPillar(p.key)}>
                            <View className={`px-3 py-1.5 rounded-full ${manualPillar === p.key ? 'bg-optio-purple' : 'bg-surface-100'}`}>
                              <UIText size="xs" className={`font-poppins-medium ${manualPillar === p.key ? 'text-white' : 'text-typo-500'}`}>
                                {p.label}
                              </UIText>
                            </View>
                          </Pressable>
                        ))}
                      </HStack>
                    </VStack>

                    <VStack space="xs">
                      <UIText size="sm" className="font-poppins-medium">Task Size *</UIText>
                      <HStack className="flex-wrap gap-2">
                        {XP_OPTIONS.map((opt) => (
                          <Pressable key={opt.value} onPress={() => setManualXP(opt.value)}>
                            <View className={`px-3 py-1.5 rounded-full ${manualXP === opt.value ? 'bg-optio-purple' : 'bg-surface-100'}`}>
                              <UIText size="xs" className={`font-poppins-medium ${manualXP === opt.value ? 'text-white' : 'text-typo-500'}`}>
                                {opt.label}
                              </UIText>
                            </View>
                          </Pressable>
                        ))}
                      </HStack>
                    </VStack>
                  </HStack>

                  {manualAdded > 0 && (
                    <View className="bg-green-50 p-3 rounded-lg">
                      <UIText size="sm" className="text-green-700">
                        {manualAdded} task{manualAdded !== 1 ? 's' : ''} added. Add another or close when done.
                      </UIText>
                    </View>
                  )}

                  <Divider />

                  <HStack className="gap-3 justify-end">
                    {manualAdded > 0 ? (
                      <Button variant="outline" size="md" onPress={handleClose}>
                        <ButtonText>Done</ButtonText>
                      </Button>
                    ) : (
                      <Button variant="outline" size="md" onPress={() => setStep('choose')}>
                        <ButtonText>Back</ButtonText>
                      </Button>
                    )}
                    <Button
                      size="md"
                      onPress={handleManualSubmit}
                      loading={submitting}
                      disabled={!manualTitle.trim() || !manualDesc.trim() || submitting}
                    >
                      <ButtonText>Add Task</ButtonText>
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* Step: AI Personalize */}
              {step === 'ai-personalize' && (
                <VStack space="md">
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">What are you interested in?</UIText>
                    <TextInput
                      value={interests}
                      onChangeText={setInterests}
                      placeholder='e.g. "photography, cooking, robotics"'
                      placeholderTextColor="#9CA3AF"
                      className="bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm"
                      style={{ fontFamily: 'Poppins_400Regular' }}
                    />
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Focus on a pillar (optional)</UIText>
                    <HStack className="flex-wrap gap-2">
                      <Pressable onPress={() => setSelectedPillar(null)}>
                        <View className={`px-3 py-1.5 rounded-full ${!selectedPillar ? 'bg-optio-purple' : 'bg-surface-100'}`}>
                          <UIText size="xs" className={`font-poppins-medium ${!selectedPillar ? 'text-white' : 'text-typo-500'}`}>Any</UIText>
                        </View>
                      </Pressable>
                      {PILLARS.map((p) => (
                        <Pressable key={p.key} onPress={() => setSelectedPillar(p.key)}>
                          <View className={`px-3 py-1.5 rounded-full ${selectedPillar === p.key ? 'bg-optio-purple' : 'bg-surface-100'}`}>
                            <UIText size="xs" className={`font-poppins-medium ${selectedPillar === p.key ? 'text-white' : 'text-typo-500'}`}>
                              {p.label}
                            </UIText>
                          </View>
                        </Pressable>
                      ))}
                    </HStack>
                  </VStack>

                  <Divider />

                  <HStack className="gap-3 justify-end">
                    <Button variant="outline" size="md" onPress={() => setStep('choose')}>
                      <ButtonText>Back</ButtonText>
                    </Button>
                    <Button size="md" onPress={handleGenerate} loading={generating} disabled={generating}>
                      <ButtonText>{generating ? 'Generating...' : 'Generate Tasks'}</ButtonText>
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* Step: AI Review (one-at-a-time) */}
              {step === 'ai-review' && currentTask && (
                <VStack space="md">
                  <UIText size="sm" className="text-typo-500">
                    Accepted {acceptedCount} task{acceptedCount !== 1 ? 's' : ''} so far
                  </UIText>

                  <View className="border border-surface-200 rounded-xl p-5 bg-surface-50">
                    <VStack space="sm">
                      <HStack className="items-center justify-between">
                        <View className={`px-3 py-1 rounded-full ${(pillarColors[currentTask.pillar] || pillarColors.stem).bg}`}>
                          <UIText size="sm" className={`font-poppins-semibold ${(pillarColors[currentTask.pillar] || pillarColors.stem).text}`}>
                            {currentTask.pillar === 'stem' ? 'STEM' : currentTask.pillar?.charAt(0).toUpperCase() + currentTask.pillar?.slice(1)}
                          </UIText>
                        </View>
                        <View className="bg-green-50 px-3 py-1 rounded-full">
                          <UIText size="sm" className="font-poppins-bold text-green-700">{currentTask.xp_value || 50} XP</UIText>
                        </View>
                      </HStack>

                      <Heading size="sm">{currentTask.title}</Heading>
                      {currentTask.description && (
                        <UIText size="sm" className="text-typo-500 leading-5">{currentTask.description}</UIText>
                      )}
                    </VStack>
                  </View>

                  <HStack className="gap-3">
                    <Button variant="outline" action="negative" className="flex-1" onPress={handleSkip} disabled={reviewLoading}>
                      <ButtonText>Skip</ButtonText>
                    </Button>
                    <Button className="flex-1" onPress={handleAccept} loading={reviewLoading} disabled={reviewLoading}>
                      <ButtonText>{reviewLoading ? 'Adding...' : 'Add Task'}</ButtonText>
                    </Button>
                  </HStack>

                  {acceptedCount > 0 && (
                    <Button variant="outline" size="md" onPress={handleClose}>
                      <ButtonText>Done ({acceptedCount} task{acceptedCount !== 1 ? 's' : ''} added)</ButtonText>
                    </Button>
                  )}

                  {reviewIndex === suggestions.length - 1 && (
                    <UIText size="xs" className="text-blue-600 text-center">This is the last suggested task.</UIText>
                  )}
                </VStack>
              )}
            </VStack>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
