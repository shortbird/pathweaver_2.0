/**
 * ClassDetailHeader - Class-specific banner shown above the regular quest
 * detail content. Surfaces the subject, transcript-credit progress, review
 * status, and the "Submit for final review" CTA at >=1000 approved XP.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  Card, HStack, VStack, UIText, Heading, Button, ButtonText, Skeleton,
} from '../ui';
import { getSubject } from './SUBJECTS';

interface ClassDetailHeaderProps {
  questId: string;
  transcriptSubject: string | null;
  /** Bump this whenever class-quest tasks change so the header refetches
   *  progress (e.g. on task completion or task add). */
  refreshKey?: number | string;
}

interface ClassProgress {
  approved_xp: number;
  pending_xp: number;
  target_xp: number;
  credits_earned: number;
  review_status: 'submitted_for_review' | 'credit_awarded' | 'rejected' | null;
  review_notes: string | null;
  can_submit_for_review: boolean;
  transcript_subject_display: string;
}

export function ClassDetailHeader({ questId, transcriptSubject, refreshKey }: ClassDetailHeaderProps) {
  const [progress, setProgress] = useState<ClassProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const subject = getSubject(transcriptSubject);

  const fetchProgress = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/quests/${questId}/class-progress`);
      setProgress(data.data || data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [questId]);

  useEffect(() => { fetchProgress(); }, [fetchProgress, refreshKey]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/quests/${questId}/submit-class-for-review`, {});
      Alert.alert(
        'Submitted for review',
        'Optio will review your class and award credit if everything looks good. You can keep working in the meantime.',
      );
      await fetchProgress();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Could not submit class.';
      Alert.alert('Submit failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }

  const reviewBanner = (() => {
    if (!progress?.review_status) return null;
    if (progress.review_status === 'submitted_for_review') {
      return {
        label: 'Awaiting Optio final review',
        body: 'We are looking at your class now. You can keep adding tasks while you wait.',
        color: 'bg-amber-50 border-amber-200',
        text: 'text-amber-900',
        icon: 'time-outline' as const,
      };
    }
    if (progress.review_status === 'credit_awarded') {
      return {
        label: 'Credit awarded',
        body: 'Optio has approved this class. Your transcript line is ready to claim.',
        color: 'bg-green-50 border-green-200',
        text: 'text-green-900',
        icon: 'checkmark-circle' as const,
      };
    }
    if (progress.review_status === 'rejected') {
      return {
        label: 'Revisions requested',
        body: progress.review_notes || 'Optio asked for revisions before awarding credit.',
        color: 'bg-red-50 border-red-200',
        text: 'text-red-900',
        icon: 'alert-circle-outline' as const,
      };
    }
    return null;
  })();

  return (
    <Card variant="elevated" size="lg" className="border-l-4 border-optio-pink">
      <VStack space="md">
        <HStack className="items-center gap-3">
          {subject && (
            <View
              style={{ backgroundColor: `${subject.accent}1A` }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Ionicons name={subject.icon} size={18} color={subject.accent} />
            </View>
          )}
          <VStack className="flex-1">
            <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
              Transcript Class
            </UIText>
            <Heading size="sm">{progress?.transcript_subject_display || subject?.name || 'Class'}</Heading>
          </VStack>
          {progress?.credits_earned ? (
            <View className="px-2.5 py-1 rounded-full bg-green-100">
              <UIText size="xs" className="text-green-800 font-poppins-semibold">
                {progress.credits_earned} credit{progress.credits_earned > 1 ? 's' : ''}
              </UIText>
            </View>
          ) : null}
        </HStack>

        {/* Slim progress bar — compact, readable, scales with the card */}
        <VStack space="xs">
          <HStack className="items-baseline justify-between">
            <HStack className="items-baseline gap-1">
              <UIText size="lg" className="font-poppins-bold text-optio-purple">
                {((progress?.approved_xp ?? 0) - (progress?.credits_earned ?? 0) * (progress?.target_xp ?? 1000))}
              </UIText>
              <UIText size="sm" className="text-typo-400">
                / {progress?.target_xp ?? 1000} XP toward {progress?.credits_earned ? 'next credit' : 'class credit'}
              </UIText>
            </HStack>
          </HStack>
          <View className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
            <View
              className="h-full bg-optio-purple rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  ((((progress?.approved_xp ?? 0) - (progress?.credits_earned ?? 0) * (progress?.target_xp ?? 1000)) /
                    (progress?.target_xp ?? 1000)) *
                    100),
                )}%`,
              }}
            />
          </View>
          {progress?.pending_xp ? (
            <UIText size="xs" className="text-typo-400">
              +{progress.pending_xp} XP pending task review
            </UIText>
          ) : null}
        </VStack>

        {reviewBanner && (
          <View className={`rounded-xl border p-3 ${reviewBanner.color}`}>
            <HStack className="items-start gap-2">
              <Ionicons name={reviewBanner.icon} size={18} color={reviewBanner.text.includes('green') ? '#16A34A' : reviewBanner.text.includes('red') ? '#DC2626' : '#D97706'} />
              <VStack className="flex-1">
                <UIText size="sm" className={`font-poppins-semibold ${reviewBanner.text}`}>
                  {reviewBanner.label}
                </UIText>
                <UIText size="xs" className={reviewBanner.text}>
                  {reviewBanner.body}
                </UIText>
              </VStack>
            </HStack>
          </View>
        )}

        {progress?.can_submit_for_review && progress?.review_status !== 'submitted_for_review' && (
          <Button
            size="lg"
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
            testID="submit-class-for-review-btn"
          >
            <ButtonText>
              {progress.review_status === 'rejected' ? 'Resubmit for review' : 'Submit for final review'}
            </ButtonText>
          </Button>
        )}
      </VStack>
    </Card>
  );
}
