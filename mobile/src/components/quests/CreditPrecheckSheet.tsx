/**
 * What a student sees between pressing Request Credit and actually requesting
 * it: the reviewer's AI, run on their work as it stands, and a choice.
 *
 * The app's twin of web/src/components/credit/CreditPrecheckModal.jsx; keep
 * the words in step with it. The answer is a preview and says so. A person
 * reviews every request, so whatever the preview thinks, Submit is always
 * offered: a student who believes the AI missed something is exactly who
 * should be sending it on.
 *
 * `precheck` is null while the check runs.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, ButtonText, Heading, HStack, UIText, VStack } from '@/src/components/ui';
import type { CreditPrecheck } from '@/src/hooks/useTaskCredit';

const LIKELIHOOD = {
  likely: {
    title: 'Looks ready for credit',
    body: 'Based on this preview, your work looks like it meets the checklist.',
    tone: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-800 dark:text-green-400',
  },
  needs_work: {
    title: 'Might come back for more work',
    body: 'Based on this preview, a reviewer may ask you to add to this before it earns credit.',
    tone: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-400',
  },
  uncertain: {
    title: 'Hard to say from here',
    body: 'The preview could not tell how this will go. A reviewer will look at it closely.',
    tone: 'bg-surface-100 dark:bg-dark-surface-200',
    text: 'text-typo-500 dark:text-dark-typo-500',
  },
} as const;

const VERDICT: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  met: { label: 'Looks done', icon: 'checkmark-circle-outline', color: '#16A34A' },
  partial: { label: 'Partly there', icon: 'remove-circle-outline', color: '#D97706' },
  not_met: { label: 'Not shown yet', icon: 'close-circle-outline', color: '#DC2626' },
  cannot_verify: { label: 'Could not check', icon: 'help-circle-outline', color: '#6B7280' },
};

const UNAVAILABLE: Record<string, string> = {
  busy: 'The preview is busy right now.',
  no_readable_evidence:
    'The preview could not open any of your evidence. If you shared a link, check that it is set so anyone with the link can view it.',
  rate_limited: 'You have run the preview a lot in the last hour. Try again later.',
};
const UNAVAILABLE_DEFAULT = 'The preview is not available right now.';

export const PRECHECK_DISCLAIMER =
  'This is an AI preview, not an official review. A person reviews every request and makes the final call.';

interface Props {
  visible: boolean;
  precheck: CreditPrecheck | null;
  submitting: boolean;
  isResubmit: boolean;
  error?: string | null;
  onSubmit: () => void;
  onClose: () => void;
}

export function CreditPrecheckSheet({ visible, precheck, submitting, isResubmit, error, onSubmit, onClose }: Props) {
  const loading = !precheck;
  const available = !!precheck?.available;
  const outcome = available
    ? (LIKELIHOOD[precheck!.likelihood as keyof typeof LIKELIHOOD] || LIKELIHOOD.uncertain)
    : null;
  const base = isResubmit ? 'Resubmit for review' : 'Submit for review';
  const submitLabel = available && precheck!.likelihood !== 'likely' ? `${base} anyway` : base;

  return (
    <BottomSheet visible={visible} onClose={submitting ? () => {} : onClose} dismissOnBackdropPress={!submitting}>
      <VStack space="md" className="pb-2">
        <Heading size="md">Before you request credit</Heading>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{PRECHECK_DISCLAIMER}</UIText>

        <ScrollView style={{ maxHeight: 360 }}>
          {loading && (
            <VStack space="sm" className="items-center py-6" accessibilityRole="progressbar">
              <ActivityIndicator />
              <UIText size="sm" className="text-center">Checking your work against the task checklist.</UIText>
              <UIText size="xs" className="text-center text-typo-400 dark:text-dark-typo-400">
                This can take up to a minute. You can also submit without waiting.
              </UIText>
            </VStack>
          )}

          {!loading && !available && (
            <View className="p-3 rounded-lg bg-surface-100 dark:bg-dark-surface-200">
              <UIText size="sm">
                {UNAVAILABLE[precheck!.reason || ''] || UNAVAILABLE_DEFAULT} You can still submit your work for review.
              </UIText>
            </View>
          )}

          {!loading && available && outcome && (
            <VStack space="md">
              <View className={`p-3 rounded-lg ${outcome.tone}`}>
                <UIText size="sm" className={`font-poppins-semibold ${outcome.text}`}>{outcome.title}</UIText>
                <UIText size="sm" className={`mt-1 ${outcome.text}`}>{outcome.body}</UIText>
              </View>

              {!!precheck!.criteria?.length && (
                <VStack space="sm">
                  <UIText size="sm" className="font-poppins-semibold">Checklist</UIText>
                  {precheck!.criteria_source === 'task_description' && (
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                      This task has no written checklist, so the preview used the task description.
                    </UIText>
                  )}
                  {precheck!.criteria!.map((c, i) => {
                    const v = VERDICT[c.verdict] || VERDICT.cannot_verify;
                    return (
                      <HStack key={i} className="items-start gap-2">
                        <Ionicons name={v.icon} size={18} color={v.color} style={{ marginTop: 1 }} />
                        <VStack className="flex-1 min-w-0">
                          <UIText size="sm">{c.criterion}</UIText>
                          <UIText size="xs" className="font-poppins-medium" style={{ color: v.color }}>{v.label}</UIText>
                        </VStack>
                      </HStack>
                    );
                  })}
                </VStack>
              )}

              {!!precheck!.suggestion && (
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-semibold">What might help</UIText>
                  <UIText size="sm">{precheck!.suggestion}</UIText>
                </VStack>
              )}

              {!!precheck!.unread?.length && (
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-semibold">The preview could not open</UIText>
                  {precheck!.unread!.map((u, i) => (
                    <UIText key={i} size="sm">
                      {'• '}{u.label || 'An attachment'}{u.reason ? `: ${u.reason}` : ''}
                    </UIText>
                  ))}
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">A reviewer can still open these.</UIText>
                </VStack>
              )}
            </VStack>
          )}
        </ScrollView>

        {!!error && (
          <UIText size="xs" className="text-amber-700 dark:text-amber-500">{error}</UIText>
        )}

        <HStack space="sm" className="justify-end">
          <Button variant="outline" action="secondary" onPress={onClose} isDisabled={submitting}>
            <ButtonText>Keep working</ButtonText>
          </Button>
          <Button onPress={onSubmit} loading={submitting} accessibilityLabel={submitLabel}>
            <ButtonText>{submitLabel}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
