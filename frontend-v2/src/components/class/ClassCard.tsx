/**
 * ClassCard - Compact dashboard card for a transcript class.
 *
 * Single-row layout: subject icon -> title + subject label -> small progress
 * ring on the right. Review status (when present) drops below as a slim pill.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import api from '@/src/services/api';
import {
  Card, HStack, VStack, UIText, Skeleton,
} from '../ui';
import { getSubject } from './SUBJECTS';

interface ClassCardProps {
  quest: any;
}

interface ClassProgress {
  approved_xp: number;
  pending_xp: number;
  target_xp: number;
  credits_earned: number;
  review_status: string | null;
  can_submit_for_review: boolean;
  transcript_subject_display: string;
}

function MiniRing({
  approvedXp,
  targetXp,
  size = 44,
  strokeWidth = 5,
  color = '#6D469B',
}: {
  approvedXp: number;
  targetXp: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const credits = Math.floor(approvedXp / targetXp);
  const xpToNext = approvedXp - credits * targetXp;
  const ringValue = credits > 0 && xpToNext === 0 ? targetXp : xpToNext;
  const percent = Math.min(1, ringValue / targetXp);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export function ClassCard({ quest }: ClassCardProps) {
  const q = quest.quests || quest;
  const subject = getSubject(q?.transcript_subject);
  const [progress, setProgress] = useState<ClassProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!q?.id) return;
    try {
      const { data } = await api.get(`/api/quests/${q.id}/class-progress`);
      setProgress(data.data || data);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [q?.id]);

  // Initial fetch + re-fetch every time the dashboard regains focus (e.g. after
  // the student returns from the class detail page where they may have added
  // or completed tasks).
  useEffect(() => { fetchProgress(); }, [fetchProgress]);
  useFocusEffect(useCallback(() => { fetchProgress(); }, [fetchProgress]));

  const xpToNext = progress
    ? progress.approved_xp - progress.credits_earned * progress.target_xp
    : 0;

  const reviewBanner = (() => {
    if (!progress) return null;
    if (progress.review_status === 'submitted_for_review') {
      return { label: 'Awaiting Optio review', color: 'bg-amber-100 text-amber-800', icon: 'time-outline' as const };
    }
    if (progress.review_status === 'credit_awarded') {
      return { label: 'Credit awarded', color: 'bg-green-100 text-green-800', icon: 'checkmark-circle-outline' as const };
    }
    if (progress.review_status === 'rejected') {
      return { label: 'Revisions requested', color: 'bg-red-100 text-red-800', icon: 'alert-circle-outline' as const };
    }
    if (progress.can_submit_for_review) {
      return { label: 'Ready to submit', color: 'bg-purple-100 text-purple-800', icon: 'send-outline' as const };
    }
    return null;
  })();

  return (
    <Pressable testID={`class-card-${q?.id}`} onPress={() => router.push(`/(app)/quests/${q?.id}`)}>
      <Card variant="elevated" size="sm" className="overflow-hidden border-l-4 border-optio-pink">
        <HStack className="items-center gap-3">
          {subject && (
            <View
              style={{ backgroundColor: `${subject.accent}1A` }}
              className="w-9 h-9 rounded-full items-center justify-center flex-shrink-0"
            >
              <Ionicons name={subject.icon} size={16} color={subject.accent} />
            </View>
          )}
          <VStack className="flex-1 min-w-0">
            <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
              Class · {progress?.transcript_subject_display || subject?.name || ''}
            </UIText>
            <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>
              {q?.title || 'Class'}
            </UIText>
            {progress && (
              <UIText size="xs" className="text-typo-400 mt-0.5">
                {progress.credits_earned > 0 ? (
                  <>
                    {progress.credits_earned} credit{progress.credits_earned > 1 ? 's' : ''} · {xpToNext}/{progress.target_xp} XP toward next
                  </>
                ) : (
                  <>{progress.approved_xp}/{progress.target_xp} XP</>
                )}
                {progress.pending_xp ? ` · +${progress.pending_xp} pending` : ''}
              </UIText>
            )}
          </VStack>
          {loading ? (
            <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : (
            <MiniRing
              approvedXp={progress?.approved_xp ?? 0}
              targetXp={progress?.target_xp ?? 1000}
              color={subject?.accent || '#6D469B'}
            />
          )}
        </HStack>

        {reviewBanner && (
          <View className={`mt-2 flex-row items-center gap-1.5 px-2.5 py-1 rounded-full self-start ${reviewBanner.color}`}>
            <Ionicons name={reviewBanner.icon} size={12} />
            <UIText size="xs" className="font-poppins-medium">{reviewBanner.label}</UIText>
          </View>
        )}
      </Card>
    </Pressable>
  );
}
