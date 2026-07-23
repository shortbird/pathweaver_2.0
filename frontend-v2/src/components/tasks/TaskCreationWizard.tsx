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
  VStack, HStack, Heading, UIText, Button, ButtonText, Divider, Card,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { getSubject } from '@/src/components/class/SUBJECTS';

const pillarColors: Record<string, { bg: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness' },
};

const XP_OPTIONS = [
  { value: 25, label: '25 XP', desc: 'Quick task' },
  { value: 50, label: '50 XP', desc: 'Small task' },
  { value: 75, label: '75 XP', desc: 'Light task' },
  { value: 100, label: '100 XP', desc: 'Medium task' },
  { value: 150, label: '150 XP', desc: 'Large task' },
  { value: 200, label: '200 XP', desc: 'Major task' },
];

// Challenge levels for AI generation. Values match the backend's
// VALID_CHALLENGE_LEVELS; the student's last choice is remembered server-side.
const CHALLENGE_LEVELS = [
  { id: 'easier', label: 'Easier', desc: 'Smaller steps, quicker wins' },
  { id: 'standard', label: 'Standard', desc: 'A good stretch' },
  { id: 'challenge', label: 'Challenge', desc: 'Bigger projects, more XP' },
];

// Max taps in one direction on the per-task complexity dial.
const MAX_ADJUST_STEPS = 2;

interface TaskCreationWizardProps {
  questId: string;
  questTitle: string;
  open: boolean;
  onClose: () => void;
  onGenerate: (interests?: string, pillar?: string, subject?: string, challengeLevel?: string) => Promise<any[]>;
  onAcceptTask: (task: any) => Promise<void>;
  /** Complexity dial: rewrite a suggested task one step easier/harder. When
   *  omitted, the dial buttons are hidden on the review step. */
  onAdjustTask?: (task: any, direction: 'easier' | 'harder') => Promise<any | null>;
  /** Pre-selects the challenge level (the user's remembered preference). */
  defaultChallengeLevel?: string | null;
  /** Optional suggested/template tasks to browse. When provided, a third "Browse Suggestions" option appears. */
  suggestedTasks?: any[];
  /** When true, the AI step shows an interest-chip multi-select (matching v1 web)
   *  instead of free-text + pillar focus. The class subject is auto-applied
   *  server-side, so we skip the pillar selector entirely. */
  isClassQuest?: boolean;
  /** The class's transcript_subject key (e.g. "fine_arts"). Required for the
   *  AI-review step to render the subject badge in place of the pillar badge. */
  classSubject?: string | null;
}

// Mirrors INTEREST_OPTIONS in frontend/src/components/quests/QuestPersonalizationWizard.jsx
const INTEREST_CHIPS = [
  { id: 'sports', label: 'Sports & Athletics', icon: '⚽' },
  { id: 'music', label: 'Music & Performance', icon: '🎵' },
  { id: 'art', label: 'Visual Arts', icon: '🎨' },
  { id: 'gaming', label: 'Gaming & Esports', icon: '🎮' },
  { id: 'business', label: 'Business & Entrepreneurship', icon: '💼' },
  { id: 'technology', label: 'Technology & Coding', icon: '💻' },
  { id: 'nature', label: 'Nature & Environment', icon: '🌿' },
  { id: 'cooking', label: 'Cooking & Food', icon: '🍳' },
  { id: 'writing', label: 'Creative Writing', icon: '✍️' },
  { id: 'social', label: 'Social Impact', icon: '🤝' },
];

export function TaskCreationWizard({
  questId,
  questTitle,
  open,
  onClose,
  onGenerate,
  onAcceptTask,
  onAdjustTask,
  defaultChallengeLevel = null,
  suggestedTasks,
  isClassQuest = false,
  classSubject = null,
}: TaskCreationWizardProps) {
  const c = useThemeColors();
  const classSubjectMeta = isClassQuest ? getSubject(classSubject) : null;
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
  // Class-quest mode: chip multi-select of interest categories (v1-style)
  const [selectedInterestChips, setSelectedInterestChips] = useState<Set<string>>(new Set());
  const [extraIdeas, setExtraIdeas] = useState('');
  const [generating, setGenerating] = useState(false);
  const [challengeLevel, setChallengeLevel] = useState(
    CHALLENGE_LEVELS.some((l) => l.id === defaultChallengeLevel) ? (defaultChallengeLevel as string) : 'standard'
  );

  // AI review
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(false);
  // Complexity dial: net steps per suggestion index (-2..+2) and in-flight state.
  const [adjustSteps, setAdjustSteps] = useState<Record<number, number>>({});
  const [adjusting, setAdjusting] = useState(false);

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
    setSelectedInterestChips(new Set());
    setExtraIdeas('');
    setSuggestions([]);
    setReviewIndex(0);
    setAcceptedCount(0);
    setAdjustSteps({});
    setAdjusting(false);
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
      let interestsArg: string | undefined;
      let pillarArg: string | undefined;
      if (isClassQuest) {
        // Class mode: combine chip labels + freeform extras into one comma-separated
        // string the bridge can split. Pillar is suppressed; the class's
        // transcript_subject is applied server-side.
        const chipLabels = Array.from(selectedInterestChips)
          .map((id) => INTEREST_CHIPS.find((c) => c.id === id)?.label)
          .filter(Boolean) as string[];
        const combined = [...chipLabels, extraIdeas.trim()].filter(Boolean).join(', ');
        if (!combined) {
          setError('Pick at least one interest to get started.');
          return;
        }
        interestsArg = combined;
      } else {
        // Regular mode now uses the same tappable interest chips + freeform
        // extras as class mode, combined into one comma-separated string.
        // Pillar focus stays regular-only.
        const chipLabels = Array.from(selectedInterestChips)
          .map((id) => INTEREST_CHIPS.find((c) => c.id === id)?.label)
          .filter(Boolean) as string[];
        const combined = [...chipLabels, extraIdeas.trim()].filter(Boolean).join(', ');
        interestsArg = combined || undefined;
        pillarArg = selectedPillar || undefined;
      }
      const tasks = await onGenerate(interestsArg, pillarArg, undefined, challengeLevel);
      if (!tasks || tasks.length === 0) {
        setError('No tasks generated. Try different interests.');
        return;
      }
      setSuggestions(tasks);
      setReviewIndex(0);
      setAcceptedCount(0);
      setAdjustSteps({});
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

  // Complexity dial: rewrite the current suggestion one step easier/harder
  // and swap it in place. Capped at +/-2 net steps per suggestion.
  const handleAdjust = async (direction: 'easier' | 'harder') => {
    if (!onAdjustTask || adjusting || reviewLoading) return;
    const steps = adjustSteps[reviewIndex] || 0;
    if ((direction === 'harder' && steps >= MAX_ADJUST_STEPS) ||
        (direction === 'easier' && steps <= -MAX_ADJUST_STEPS)) return;

    setAdjusting(true);
    setError(null);
    try {
      const adjusted = await onAdjustTask(suggestions[reviewIndex], direction);
      if (adjusted) {
        setSuggestions((prev) => prev.map((t, i) => (i === reviewIndex ? adjusted : t)));
        setAdjustSteps((prev) => ({
          ...prev,
          [reviewIndex]: steps + (direction === 'harder' ? 1 : -1),
        }));
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to adjust task';
      setError(msg.includes('429') || msg.includes('rate limit')
        ? 'AI is busy. Please wait 30 seconds and try again.' : msg);
    } finally {
      setAdjusting(false);
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
          style={{ backgroundColor: c.card, borderRadius: 20, width: 560, maxWidth: '92%', maxHeight: '85%' }}
        >
          <ScrollView contentContainerStyle={{ padding: 28 }} keyboardShouldPersistTaps="handled">
            <VStack space="md">
              {/* Header */}
              <HStack className="items-center justify-between">
                <UIText size="sm" className="font-poppins-semibold text-typo-400 dark:text-dark-typo-400 uppercase tracking-wider">
                  {step === 'choose' ? 'Add Task' : step === 'manual' ? 'Create Task' : step === 'browse' ? 'Suggested Tasks' : step === 'ai-personalize' ? 'Personalize' : `Task ${reviewIndex + 1} of ${suggestions.length}`}
                </UIText>
                <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
                  <Ionicons name="close" size={16} color={c.icon} />
                </Pressable>
              </HStack>

              {/* Progress bar */}
              {step !== 'choose' && (
                <View className="h-1 bg-surface-200 dark:bg-dark-surface-300 rounded-full overflow-hidden">
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
                        className="flex-1 p-5 border-2 border-surface-200 dark:border-dark-surface-300 rounded-xl"
                        style={{ cursor: 'pointer' } as any}
                      >
                        <VStack className="items-center" space="sm">
                          <View className="w-12 h-12 rounded-xl bg-pillar-stem/10 items-center justify-center">
                            <Ionicons name="list-outline" size={24} color="#2469D1" />
                          </View>
                          <UIText size="sm" className="font-poppins-bold text-center">Browse Ideas</UIText>
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">{suggestedTasks.filter((t: any) => !addedIds.has(t.id)).length} suggested tasks</UIText>
                        </VStack>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => { setError(null); setStep('ai-personalize'); }}
                      className="flex-1 p-5 border-2 border-surface-200 dark:border-dark-surface-300 rounded-xl"
                      style={{ cursor: 'pointer' } as any}
                    >
                      <VStack className="items-center" space="sm">
                        <View className="w-12 h-12 rounded-xl bg-optio-purple/10 items-center justify-center">
                          <Ionicons name="sparkles" size={24} color="#6D469B" />
                        </View>
                        <UIText size="sm" className="font-poppins-bold text-center">AI Generate</UIText>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">Get personalized suggestions</UIText>
                      </VStack>
                    </Pressable>

                    <Pressable
                      onPress={() => { setError(null); setStep('manual'); }}
                      className="flex-1 p-5 border-2 border-surface-200 dark:border-dark-surface-300 rounded-xl"
                      style={{ cursor: 'pointer' } as any}
                    >
                      <VStack className="items-center" space="sm">
                        <View className="w-12 h-12 rounded-xl bg-optio-pink/10 items-center justify-center">
                          <Ionicons name="create-outline" size={24} color="#EF597B" />
                        </View>
                        <UIText size="sm" className="font-poppins-bold text-center">Write My Own</UIText>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">Create a custom task</UIText>
                      </VStack>
                    </Pressable>
                  </HStack>
                </VStack>
              )}

              {/* Step: Browse suggested tasks */}
              {step === 'browse' && suggestedTasks && (
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Tap a task to add it to your project.</UIText>
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
                        className="border border-surface-200 dark:border-dark-surface-300 rounded-xl p-4 bg-surface-50 dark:bg-dark-surface-50 active:bg-surface-100 dark:active:bg-dark-surface-200"
                        style={{ cursor: 'pointer' } as any}
                      >
                        <HStack className="items-center gap-3">
                          <VStack className="flex-1 min-w-0">
                            <UIText size="sm" className="font-poppins-medium">{t.title}</UIText>
                            {t.description && (
                              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5" numberOfLines={2}>{t.description}</UIText>
                            )}
                            <HStack className="items-center gap-2 mt-1">
                              <View className={`px-1.5 py-0.5 rounded ${pc.bg}`}>
                                <UIText size="xs" className={pc.text}>{label}</UIText>
                              </View>
                              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{t.xp_value || 0} XP</UIText>
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
                      placeholderTextColor={c.textFaint}
                      className="bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm"
                      style={{ fontFamily: 'Poppins_400Regular' }}
                    />
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Description *</UIText>
                    <TextInput
                      value={manualDesc}
                      onChangeText={(t) => { setError(null); setManualDesc(t); }}
                      placeholder="Describe what you'll do, how you'll explore, and what you hope to discover..."
                      placeholderTextColor={c.textFaint}
                      multiline
                      numberOfLines={4}
                      className="bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm min-h-[100px]"
                      style={{ fontFamily: 'Poppins_400Regular', textAlignVertical: 'top' }}
                    />
                    <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{manualDesc.length} characters</UIText>
                  </VStack>

                  <HStack className="gap-6">
                    <VStack space="xs" className="flex-1">
                      <UIText size="sm" className="font-poppins-medium">Pillar *</UIText>
                      <HStack className="flex-wrap gap-2">
                        {PILLARS.map((p) => (
                          <Pressable key={p.key} onPress={() => setManualPillar(p.key)}>
                            <View className={`px-3 py-1.5 rounded-full ${manualPillar === p.key ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                              <UIText size="xs" className={`font-poppins-medium ${manualPillar === p.key ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
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
                            <View className={`px-3 py-1.5 rounded-full ${manualXP === opt.value ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                              <UIText size="xs" className={`font-poppins-medium ${manualXP === opt.value ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
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
                  {isClassQuest ? (
                    <>
                      <VStack space="xs">
                        <UIText size="sm" className="font-poppins-medium">
                          What are you interested in?
                        </UIText>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                          Pick a few — we'll generate tasks that connect your interests to this class.
                        </UIText>
                        <HStack className="flex-wrap gap-2 pt-1">
                          {INTEREST_CHIPS.map((chip) => {
                            const selected = selectedInterestChips.has(chip.id);
                            return (
                              <Pressable
                                key={chip.id}
                                onPress={() => {
                                  setSelectedInterestChips((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(chip.id)) next.delete(chip.id);
                                    else next.add(chip.id);
                                    return next;
                                  });
                                }}
                              >
                                <View className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${selected ? 'bg-optio-purple border-optio-purple' : 'bg-white dark:bg-dark-surface-100 border-surface-300 dark:border-dark-surface-300'}`}>
                                  <UIText size="sm">{chip.icon}</UIText>
                                  <UIText size="xs" className={`font-poppins-medium ${selected ? 'text-white' : 'text-typo-600 dark:text-dark-typo-600'}`}>
                                    {chip.label}
                                  </UIText>
                                </View>
                              </Pressable>
                            );
                          })}
                        </HStack>
                      </VStack>

                      <VStack space="xs">
                        <UIText size="sm" className="font-poppins-medium">Any specific ideas? (optional)</UIText>
                        <TextInput
                          value={extraIdeas}
                          onChangeText={setExtraIdeas}
                          placeholder='e.g. "I play varsity basketball and want to track stats"'
                          placeholderTextColor={c.textFaint}
                          className="bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm"
                          style={{ fontFamily: 'Poppins_400Regular' }}
                          multiline
                        />
                      </VStack>
                    </>
                  ) : (
                    <>
                      <VStack space="xs">
                        <UIText size="sm" className="font-poppins-medium">
                          What are you interested in?
                        </UIText>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                          Pick a few — we'll generate tasks that connect your interests to this quest.
                        </UIText>
                        <HStack className="flex-wrap gap-2 pt-1">
                          {INTEREST_CHIPS.map((chip) => {
                            const selected = selectedInterestChips.has(chip.id);
                            return (
                              <Pressable
                                key={chip.id}
                                onPress={() => {
                                  setSelectedInterestChips((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(chip.id)) next.delete(chip.id);
                                    else next.add(chip.id);
                                    return next;
                                  });
                                }}
                              >
                                <View className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${selected ? 'bg-optio-purple border-optio-purple' : 'bg-white dark:bg-dark-surface-100 border-surface-300 dark:border-dark-surface-300'}`}>
                                  <UIText size="sm">{chip.icon}</UIText>
                                  <UIText size="xs" className={`font-poppins-medium ${selected ? 'text-white' : 'text-typo-600 dark:text-dark-typo-600'}`}>
                                    {chip.label}
                                  </UIText>
                                </View>
                              </Pressable>
                            );
                          })}
                        </HStack>
                      </VStack>

                      <VStack space="xs">
                        <UIText size="sm" className="font-poppins-medium">Any specific ideas? (optional)</UIText>
                        <TextInput
                          value={extraIdeas}
                          onChangeText={setExtraIdeas}
                          placeholder='e.g. "I play varsity basketball and want to track stats"'
                          placeholderTextColor={c.textFaint}
                          className="bg-surface-50 dark:bg-dark-surface-50 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-3 text-sm"
                          style={{ fontFamily: 'Poppins_400Regular' }}
                          multiline
                        />
                      </VStack>

                      <VStack space="xs">
                        <UIText size="sm" className="font-poppins-medium">Focus on a pillar (optional)</UIText>
                        <HStack className="flex-wrap gap-2">
                          <Pressable onPress={() => setSelectedPillar(null)}>
                            <View className={`px-3 py-1.5 rounded-full ${!selectedPillar ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                              <UIText size="xs" className={`font-poppins-medium ${!selectedPillar ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>Any</UIText>
                            </View>
                          </Pressable>
                          {PILLARS.map((p) => (
                            <Pressable key={p.key} onPress={() => setSelectedPillar(p.key)}>
                              <View className={`px-3 py-1.5 rounded-full ${selectedPillar === p.key ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                                <UIText size="xs" className={`font-poppins-medium ${selectedPillar === p.key ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                                  {p.label}
                                </UIText>
                              </View>
                            </Pressable>
                          ))}
                        </HStack>
                      </VStack>
                    </>
                  )}

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Challenge level</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                      How ambitious should your tasks be? We'll remember your choice.
                    </UIText>
                    <HStack className="flex-wrap gap-2 pt-1">
                      {CHALLENGE_LEVELS.map((level) => {
                        const selected = challengeLevel === level.id;
                        return (
                          <Pressable key={level.id} onPress={() => setChallengeLevel(level.id)}>
                            <View className={`px-3 py-2 rounded-xl border ${selected ? 'bg-optio-purple border-optio-purple' : 'bg-white dark:bg-dark-surface-100 border-surface-300 dark:border-dark-surface-300'}`}>
                              <UIText size="xs" className={`font-poppins-semibold ${selected ? 'text-white' : 'text-typo-600 dark:text-dark-typo-600'}`}>
                                {level.label}
                              </UIText>
                              <UIText size="xs" className={selected ? 'text-white/80' : 'text-typo-400 dark:text-dark-typo-400'}>
                                {level.desc}
                              </UIText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </HStack>
                  </VStack>

                  <Divider />

                  <HStack className="gap-3 justify-end">
                    <Button variant="outline" size="md" onPress={() => setStep('choose')}>
                      <ButtonText>Back</ButtonText>
                    </Button>
                    <Button
                      size="md"
                      onPress={handleGenerate}
                      loading={generating}
                      disabled={generating || (isClassQuest && selectedInterestChips.size === 0 && !extraIdeas.trim())}
                    >
                      <ButtonText>{generating ? 'Generating...' : 'Generate Tasks'}</ButtonText>
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* Step: AI Review (one-at-a-time) */}
              {step === 'ai-review' && currentTask && (
                <VStack space="md">
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                    Accepted {acceptedCount} task{acceptedCount !== 1 ? 's' : ''} so far
                  </UIText>

                  <View className="border border-surface-200 dark:border-dark-surface-300 rounded-xl p-5 bg-surface-50 dark:bg-dark-surface-50">
                    <VStack space="sm">
                      <HStack className="items-center justify-between">
                        {classSubjectMeta ? (
                          <View
                            style={{ backgroundColor: `${classSubjectMeta.accent}1A` }}
                            className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
                          >
                            <Ionicons name={classSubjectMeta.icon} size={13} color={classSubjectMeta.accent} />
                            <UIText size="sm" style={{ color: classSubjectMeta.accent }} className="font-poppins-semibold">
                              {classSubjectMeta.name}
                            </UIText>
                          </View>
                        ) : (
                          <View className={`px-3 py-1 rounded-full ${(pillarColors[currentTask.pillar] || pillarColors.stem).bg}`}>
                            <UIText size="sm" className={`font-poppins-semibold ${(pillarColors[currentTask.pillar] || pillarColors.stem).text}`}>
                              {currentTask.pillar === 'stem' ? 'STEM' : currentTask.pillar?.charAt(0).toUpperCase() + currentTask.pillar?.slice(1)}
                            </UIText>
                          </View>
                        )}
                        <View className="bg-green-50 px-3 py-1 rounded-full">
                          <UIText size="sm" className="font-poppins-bold text-green-700">{currentTask.xp_value || 50} XP</UIText>
                        </View>
                      </HStack>

                      <Heading size="sm">{currentTask.title}</Heading>
                      {currentTask.description && (
                        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 leading-5">{currentTask.description}</UIText>
                      )}

                      {/* Complexity dial - rewrite this task easier or harder */}
                      {onAdjustTask && (
                        <HStack className="items-center gap-2 pt-1">
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                            {adjusting ? 'Adjusting...' : 'Adjust difficulty:'}
                          </UIText>
                          <Pressable
                            onPress={() => handleAdjust('easier')}
                            disabled={adjusting || reviewLoading || (adjustSteps[reviewIndex] || 0) <= -MAX_ADJUST_STEPS}
                            accessibilityLabel="Make this task easier"
                          >
                            <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border border-surface-300 dark:border-dark-surface-300 ${(adjusting || (adjustSteps[reviewIndex] || 0) <= -MAX_ADJUST_STEPS) ? 'opacity-40' : ''}`}>
                              <Ionicons name="arrow-down" size={12} color={c.icon} />
                              <UIText size="xs" className="font-poppins-medium">Easier</UIText>
                            </View>
                          </Pressable>
                          <Pressable
                            onPress={() => handleAdjust('harder')}
                            disabled={adjusting || reviewLoading || (adjustSteps[reviewIndex] || 0) >= MAX_ADJUST_STEPS}
                            accessibilityLabel="Make this task harder"
                          >
                            <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border border-surface-300 dark:border-dark-surface-300 ${(adjusting || (adjustSteps[reviewIndex] || 0) >= MAX_ADJUST_STEPS) ? 'opacity-40' : ''}`}>
                              <Ionicons name="arrow-up" size={12} color={c.icon} />
                              <UIText size="xs" className="font-poppins-medium">Harder</UIText>
                            </View>
                          </Pressable>
                        </HStack>
                      )}
                    </VStack>
                  </View>

                  <HStack className="gap-3">
                    <Button variant="outline" action="negative" className="flex-1" onPress={handleSkip} disabled={reviewLoading || adjusting}>
                      <ButtonText>Skip</ButtonText>
                    </Button>
                    <Button className="flex-1" onPress={handleAccept} loading={reviewLoading} disabled={reviewLoading || adjusting}>
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
