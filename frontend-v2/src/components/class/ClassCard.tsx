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
import { useThemeColors } from '@/src/hooks/useThemeColors';
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
  const c = useThemeColors();
  const credits = Math.floor(approvedXp / targetXp);
  const xpToNext = approvedXp - credits * targetXp;
  const ringValue = credits > 0 && xpToNext === 0 ? targetXp : xpToNext;
  const percent = Math.min(1, ringValue / targetXp);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent);

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={c.border} strokeWidth={strokeWidth} fill="none" />
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
  const c = useThemeColors();
  const q = quest.quests || quest;
  const subject = getSubject(q?.transcript_subject);
  const [progress, setProgress] = useState<ClassProgress | null>(null);
  const [outstanding, setOutstanding] = useState<any[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!q?.id) return;
    try {
      // Progress drives the ring/XP line; the quest detail gives us the task
      // list so we can surface what's still outstanding.
      const [progRes, questRes] = await Promise.allSettled([
        api.get(`/api/quests/${q.id}/class-progress`),
        api.get(`/api/quests/${q.id}`),
      ]);
      if (progRes.status === 'fulfilled') {
        const d = progRes.value.data;
        setProgress(d.data || d);
      }
      if (questRes.status === 'fulfilled') {
        const d = questRes.value.data;
        const allTasks = (d.quest || d).quest_tasks || [];
        setTaskCount(allTasks.length);
        setOutstanding(allTasks.filter((t: any) => !t.is_completed));
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [q?.id]);

  // Initial fetch + re-fetch every time the dashboard regains focus (e.g. after
  // the student returns from the class detail page where they may have added
  // or completed tasks).
  useEffect(() => { fetchData(); }, [fetchData]);
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

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
    <Pressable testID={`class-card-${q?.id}`} onPress={() => router.push(`/(app)/quests/${q?.id}`)} className="md:h-full">
      <Card variant="elevated" size="md" className="overflow-hidden border-l-4 border-optio-pink md:h-full">
        <HStack className="items-center gap-4">
          {subject && (
            <View
              style={{ backgroundColor: `${subject.accent}1A` }}
              className="w-9 h-9 rounded-full items-center justify-center flex-shrink-0"
            >
              <Ionicons name={subject.icon} size={16} color={subject.accent} />
            </View>
          )}
          <VStack space="xs" className="flex-1 min-w-0">
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
              {(progress?.transcript_subject_display || subject?.name || '')} class
            </UIText>
            <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>
              {q?.title || 'Class'}
            </UIText>
            {progress && (
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
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

        {/* Outstanding tasks — what's still left to do in this class */}
        {!loading && (
          outstanding.length > 0 ? (
            <VStack space="xs" className="mt-3">
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
                To do
              </UIText>
              {outstanding.slice(0, 4).map((t: any, idx: number) => (
                <HStack key={t.id || idx} className="items-center gap-2.5">
                  <Ionicons name="ellipse-outline" size={15} color={c.border} />
                  <UIText size="xs" className="flex-1 text-typo-700 dark:text-dark-typo-700" numberOfLines={1}>
                    {t.title}
                  </UIText>
                </HStack>
              ))}
              {outstanding.length > 4 && (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-[23px]">
                  +{outstanding.length - 4} more
                </UIText>
              )}
            </VStack>
          ) : taskCount === 0 ? (
            <HStack className="items-center gap-1.5 mt-3">
              <Ionicons name="add-circle-outline" size={15} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium">Add tasks to continue the class</UIText>
            </HStack>
          ) : progress ? (
            <HStack className="items-center gap-1.5 mt-3">
              <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">All tasks complete</UIText>
            </HStack>
          ) : null
        )}

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
