/**
 * HomeBountyCard - Compact card for a claimed bounty in Home's
 * "What you're working on" list.
 *
 * Visual signature distinct from QuestCard / ClassCard / CourseCard:
 *   - Solid emerald left-edge stripe (class = pink, course = purple,
 *     quest = neutral; bounty = teal/emerald to fit "claimed work").
 *   - Gift / target icon up front to signal "reward attached."
 *   - Deliverables progress bar + "X of Y uploaded" caption.
 *   - Inline deliverable list with checkmarks (or "X of Y done" when count > 4).
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, VStack, UIText } from '../ui';

interface HomeBountyCardProps {
  claim: any;
}

function rewardLabel(bounty: any): { icon: string; text: string; color: string } {
  if (bounty?.xp_reward > 0) {
    return { icon: 'star', text: `${bounty.xp_reward} XP`, color: '#FF9028' };
  }
  const custom = (bounty?.rewards || []).find((r: any) => r.type === 'custom');
  if (custom?.text || custom?.value) {
    return { icon: 'gift-outline', text: custom.text || custom.value, color: '#B45309' };
  }
  return { icon: 'star', text: '0 XP', color: '#FF9028' };
}

export function HomeBountyCard({ claim }: HomeBountyCardProps) {
  const bounty = claim?.bounty || {};
  const completedIds = new Set(claim?.evidence?.completed_deliverables || []);
  const deliverables = bounty.deliverables || [];
  const completed = completedIds.size;
  const total = deliverables.length;
  // Use inline dots only when the count is small enough that they read clearly.
  // Above ~4 they get cramped, so fall back to a "X of Y done" text line.
  const useInlineDots = total > 0 && total <= 4;
  const reward = rewardLabel(bounty);

  return (
    <Pressable
      testID={`bounty-card-${claim?.id}`}
      onPress={() => router.push(`/bounties/${claim?.bounty_id}`)}
    >
      <Card variant="elevated" size="sm" className="overflow-hidden border-l-4 border-emerald-500">
        <HStack className="items-center gap-3">
          <View className="w-9 h-9 rounded-lg bg-emerald-100 items-center justify-center flex-shrink-0">
            <Ionicons name="trophy-outline" size={18} color="#0F766E" />
          </View>
          <VStack className="flex-1 min-w-0">
            <HStack className="items-center gap-1">
              <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
                Bounty
              </UIText>
              <View className="w-1 h-1 rounded-full bg-typo-300" />
              <Ionicons name={reward.icon as any} size={11} color={reward.color} />
              <UIText size="xs" style={{ color: reward.color }} className="font-poppins-medium">
                {reward.text}
              </UIText>
            </HStack>
            <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>
              {bounty?.title || 'Bounty'}
            </UIText>
          </VStack>
        </HStack>

        {total > 0 && (
          useInlineDots ? (
            <VStack space="xs" className="mt-3">
              {deliverables.map((d: any, idx: number) => {
                const done = completedIds.has(d.id);
                return (
                  <HStack key={d.id || idx} className="items-center gap-2">
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={done ? '#10B981' : '#D1D5DB'}
                    />
                    <UIText
                      size="xs"
                      className={`flex-1 ${done ? 'text-typo-400 line-through' : 'text-typo-600'}`}
                      numberOfLines={1}
                    >
                      {d.text}
                    </UIText>
                  </HStack>
                );
              })}
            </VStack>
          ) : (
            <UIText size="xs" className="text-typo-400 mt-3">
              {completed} of {total} deliverables done
            </UIText>
          )
        )}
      </Card>
    </Pressable>
  );
}
