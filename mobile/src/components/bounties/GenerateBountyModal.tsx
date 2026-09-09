/**
 * GenerateBountyModal - AI bounty drafting for posters (parents/observers).
 *
 * Two-step bottom sheet, same shape as journal's GenerateTasksModal:
 *   input  — "what do you want to happen?" + optional kid + reward preference
 *   review — one complete bounty idea at a time; "Use this idea" prefills the
 *            create wizard. Nothing is posted here — posting stays the
 *            poster's own click on the form, so every AI-written word is
 *            reviewed by a human before it can reach a kid.
 */

import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Heading, Button, ButtonText, PillarBadge } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api, { bountyAPI } from '@/src/services/api';

export interface BountyIdea {
  title: string;
  description: string;
  deliverables: { text: string }[];
  pillar: string;
  rewards: { type: string; value?: number; pillar?: string; text?: string }[];
}

interface Props {
  visible: boolean;
  kids: { id: string; display_name?: string }[];
  childNoun: string; // "kid" | "student"
  onClose: () => void;
  onUse: (idea: BountyIdea, childId: string | null) => void;
}

/**
 * Whether this account may use AI task generation. Mirrors the web platform's
 * AIAccessContext rule: when access is off (org toggle, dependent settings),
 * the AI surface renders nothing rather than a disabled button.
 */
export function useAiBountyAccess(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get('/api/ai-access/status')
      .then(({ data }) => {
        if (!alive) return;
        const hasAccess = data?.has_access ?? data?.hasAccess ?? false;
        const feature = data?.features?.task_generation ?? true;
        setAllowed(!!hasAccess && !!feature);
      })
      .catch(() => { /* stays hidden */ });
    return () => { alive = false; };
  }, []);
  return allowed;
}

export function GenerateBountyModal({ visible, kids, childNoun, onClose, onUse }: Props) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [prompt, setPrompt] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [rewardHint, setRewardHint] = useState<'xp' | 'custom'>('xp');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<BountyIdea[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  const reset = () => {
    setStep('input');
    setGenerating(false);
    setError(null);
    setIdeas([]);
    setReviewIndex(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleGenerate = async () => {
    if (!prompt.trim()) { setError('Tell us what you want to happen first'); return; }
    setGenerating(true);
    setError(null);
    try {
      const kid = kids.find((k) => k.id === childId);
      const { data } = await bountyAPI.aiDraft({
        prompt: prompt.trim(),
        child_id: childId,
        child_context: kid ? `The bounty is for ${kid.display_name || `my ${childNoun}`}.` : '',
        reward_hint: rewardHint,
      });
      const got: BountyIdea[] = data?.ideas || [];
      if (!got.length) { setError('No ideas came back. Try describing it differently.'); return; }
      setIdeas(got);
      setReviewIndex(0);
      setStep('review');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Could not build bounty ideas';
      setError(msg.includes('429') || msg.includes('quota')
        ? 'AI is busy. Please wait a moment and try again.' : msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = () => {
    const idea = ideas[reviewIndex];
    if (!idea) return;
    onUse(idea, childId);
    handleClose();
  };

  const handleNextIdea = () => {
    setReviewIndex((i) => (i + 1) % ideas.length);
  };

  if (!visible) return null;

  const idea = ideas[reviewIndex];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable style={{ flex: 0.12 }} onPress={handleClose} />

          <View
            className="bg-white dark:bg-dark-surface-100 rounded-t-2xl flex-1"
            style={{ paddingBottom: insets.bottom || 16, maxHeight: '88%' }}
          >
            <View className="items-center py-2">
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
            </View>

            <View className="px-5 pb-3 border-b border-surface-200 dark:border-dark-surface-300">
              <HStack className="items-center justify-between">
                <HStack className="items-center gap-2">
                  <Ionicons name="sparkles" size={18} color={c.brand} />
                  <Heading size="md">Help me write this bounty</Heading>
                </HStack>
                <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
                  <Ionicons name="close" size={16} color={c.icon} />
                </Pressable>
              </HStack>
            </View>

            <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {error && (
                <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <UIText size="sm" className="text-red-700">{error}</UIText>
                </View>
              )}

              {step === 'input' && (
                <VStack space="lg">
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">
                      What do you want to happen?
                    </UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                      Say it in your own words. You'll get a few complete bounty ideas to pick from and edit.
                    </UIText>
                  </VStack>

                  <TextInput
                    value={prompt}
                    onChangeText={setPrompt}
                    placeholder={`e.g. "Practice piano without me nagging" or "Read more this summer"`}
                    placeholderTextColor={c.textFaint}
                    multiline
                    numberOfLines={3}
                    className="bg-surface-100 dark:bg-dark-surface-200 text-typo dark:text-dark-typo rounded-xl px-4 py-3 font-poppins text-sm"
                    style={{ outline: 'none', minHeight: 80, textAlignVertical: 'top' } as any}
                  />

                  {kids.length > 0 && (
                    <VStack space="xs">
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Who is it for? (optional)</UIText>
                      <View className="flex-row flex-wrap gap-2">
                        {kids.map((k) => {
                          const selected = childId === k.id;
                          return (
                            <Pressable key={k.id} onPress={() => setChildId(selected ? null : k.id)}>
                              <View style={{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                                backgroundColor: selected ? c.brand : c.surfaceMuted,
                              }}>
                                <UIText size="sm" style={{ color: selected ? '#fff' : c.textMuted, fontFamily: 'Poppins_500Medium' }}>
                                  {k.display_name || 'Student'}
                                </UIText>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </VStack>
                  )}

                  <VStack space="xs">
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Reward style</UIText>
                    <HStack className="gap-2">
                      {([['xp', 'XP'], ['custom', 'Real-world reward']] as const).map(([key, label]) => (
                        <Pressable key={key} onPress={() => setRewardHint(key)}>
                          <View style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                            backgroundColor: rewardHint === key ? c.brand : c.surfaceMuted,
                          }}>
                            <UIText size="sm" style={{ color: rewardHint === key ? '#fff' : c.textMuted, fontFamily: 'Poppins_500Medium' }}>
                              {label}
                            </UIText>
                          </View>
                        </Pressable>
                      ))}
                    </HStack>
                  </VStack>

                  <Button size="lg" onPress={handleGenerate} loading={generating} disabled={generating} className="w-full">
                    <ButtonText>{generating ? 'Thinking…' : 'Suggest bounties'}</ButtonText>
                  </Button>
                </VStack>
              )}

              {step === 'review' && idea && (
                <VStack space="md">
                  <HStack className="items-center justify-between">
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">
                      Idea {reviewIndex + 1} of {ideas.length}
                    </UIText>
                    <Pressable onPress={() => { setStep('input'); setIdeas([]); }}>
                      <UIText size="xs" className="text-optio-purple font-poppins-medium">Start over</UIText>
                    </Pressable>
                  </HStack>

                  <View className="bg-brand-surface-50 dark:bg-dark-brand-surface-50 border border-brand-surface-200 dark:border-dark-brand-surface-200 rounded-2xl p-5">
                    <VStack space="sm">
                      <HStack className="items-center justify-between">
                        <PillarBadge pillar={idea.pillar || 'wellness'} size="md" />
                        <UIText size="sm" className="font-poppins-bold text-optio-purple" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {idea.rewards.map((r) => (r.type === 'xp' ? `+${r.value} XP` : r.text)).filter(Boolean).join(' · ')}
                        </UIText>
                      </HStack>
                      <Heading size="md">{idea.title}</Heading>
                      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 leading-5">
                        {idea.description}
                      </UIText>
                      <VStack space="xs" className="mt-1">
                        {idea.deliverables.map((d, i) => (
                          <HStack key={i} className="items-start gap-2">
                            <Ionicons name="checkbox-outline" size={15} color={c.brand} style={{ marginTop: 2 }} />
                            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 flex-1">{d.text}</UIText>
                          </HStack>
                        ))}
                      </VStack>
                    </VStack>
                  </View>

                  <HStack className="gap-3">
                    <Pressable
                      onPress={handleNextIdea}
                      className="flex-1 items-center justify-center py-3.5 rounded-xl border border-surface-300 dark:border-dark-surface-300 active:bg-surface-50 dark:active:bg-dark-surface-50"
                    >
                      <UIText size="sm" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500">Next idea</UIText>
                    </Pressable>
                    <Pressable
                      onPress={handleUse}
                      className="flex-1 items-center justify-center py-3.5 rounded-xl bg-optio-purple active:bg-optio-purple-dark"
                    >
                      <UIText size="sm" className="font-poppins-semibold text-white">Use this idea</UIText>
                    </Pressable>
                  </HStack>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">
                    You can edit everything before posting.
                  </UIText>
                </VStack>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
