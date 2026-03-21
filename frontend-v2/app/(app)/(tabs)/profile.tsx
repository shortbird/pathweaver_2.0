/**
 * Profile - Student overview with XP breakdown, achievements, engagement, and settings.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useProfile } from '@/src/hooks/useProfile';
import { useGlobalEngagement } from '@/src/hooks/useDashboard';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Avatar, AvatarFallbackText, AvatarImage,
  Skeleton,
} from '@/src/components/ui';

const pillarColors: Record<string, { bg: string; bar: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', bar: 'bg-pillar-stem', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', bar: 'bg-pillar-art', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', bar: 'bg-pillar-communication', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', bar: 'bg-pillar-civics', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', bar: 'bg-pillar-wellness', text: 'text-pillar-wellness' },
};

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <VStack>
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center justify-between py-2">
        <Heading size="md">{title}</Heading>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#9CA3AF" />
      </Pressable>
      {open && children}
    </VStack>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { pillarXP, achievements, subjectXP, loading } = useProfile();
  const { data: engagement } = useGlobalEngagement();

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  const maxPillarXP = Math.max(...pillarXP.map((p) => p.xp), 1);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <VStack className="px-5 pt-6" space="lg">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </VStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-3xl w-full md:mx-auto">

          {/* Hero */}
          <Card variant="elevated" size="lg">
            <VStack space="md" className="items-center">
              <Avatar size="xl">
                {user?.avatar_url ? (
                  <AvatarImage source={{ uri: user.avatar_url }} />
                ) : (
                  <AvatarFallbackText>{initials}</AvatarFallbackText>
                )}
              </Avatar>
              <VStack className="items-center" space="xs">
                <Heading size="xl">{user?.display_name || `${user?.first_name} ${user?.last_name}`}</Heading>
                {memberSince && <UIText size="sm" className="text-typo-400">Member since {memberSince}</UIText>}
              </VStack>
              <HStack className="justify-around w-full mt-2">
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-purple">{(user?.total_xp || 0).toLocaleString()}</UIText>
                  <UIText size="xs" className="text-typo-400">Total XP</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-pink">{achievements.length}</UIText>
                  <UIText size="xs" className="text-typo-400">Completed</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-pillar-stem">{pillarXP.length}</UIText>
                  <UIText size="xs" className="text-typo-400">Pillars</UIText>
                </VStack>
              </HStack>
              {engagement?.rhythm && (
                <>
                  <Divider className="w-full" />
                  <RhythmBadge rhythm={engagement.rhythm} compact />
                </>
              )}
            </VStack>
          </Card>

          {/* Engagement Calendar */}
          <CollapsibleSection title="Learning Activity">
            <Card variant="elevated" size="md">
              <EngagementCalendar days={engagement?.calendar?.days || []} firstActivityDate={engagement?.calendar?.first_activity_date} />
            </Card>
          </CollapsibleSection>

          {/* Pillar XP */}
          {pillarXP.length > 0 && (
            <CollapsibleSection title="Pillar Breakdown">
              <Card variant="elevated" size="md">
                <VStack space="md">
                  {pillarXP.map(({ pillar, xp }) => {
                    const colors = pillarColors[pillar] || pillarColors.stem;
                    const percent = Math.round((xp / maxPillarXP) * 100);
                    return (
                      <VStack key={pillar} space="xs">
                        <HStack className="items-center justify-between">
                          <UIText size="sm" className={`font-poppins-medium ${colors.text}`}>
                            {pillar === 'stem' ? 'STEM' : pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                          </UIText>
                          <UIText size="xs" className="text-typo-400">{xp.toLocaleString()} XP</UIText>
                        </HStack>
                        <View className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
                          <View className={`h-full rounded-full ${colors.bar}`} style={{ width: `${percent}%` }} />
                        </View>
                      </VStack>
                    );
                  })}
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          {/* Achievements */}
          {achievements.length > 0 && (
            <CollapsibleSection title="Achievements" defaultOpen={false}>
              <View className="flex flex-col md:flex-row md:flex-wrap gap-3">
                {achievements.map((a: any) => (
                  <View key={a.id} className="md:w-[calc(50%-6px)]">
                    <Card variant="outline" size="sm">
                      <HStack className="items-center gap-3">
                        <View className="w-10 h-10 rounded-lg bg-green-50 items-center justify-center">
                          <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                        </View>
                        <VStack className="flex-1 min-w-0">
                          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{a.title || a.quests?.title || 'Quest'}</UIText>
                          <UIText size="xs" className="text-typo-400">{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : ''}</UIText>
                        </VStack>
                      </HStack>
                    </Card>
                  </View>
                ))}
              </View>
            </CollapsibleSection>
          )}

          {/* Subject XP */}
          {subjectXP.length > 0 && (
            <CollapsibleSection title="Subject Credits" defaultOpen={false}>
              <Card variant="elevated" size="md">
                <VStack space="sm">
                  {subjectXP.map((s: any) => (
                    <HStack key={s.school_subject} className="items-center justify-between py-1">
                      <UIText size="sm" className="font-poppins-medium">{s.school_subject}</UIText>
                      <HStack className="items-center gap-2">
                        <UIText size="sm" className="text-optio-purple font-poppins-semibold">{s.xp_amount?.toLocaleString()} XP</UIText>
                        {s.pending_xp > 0 && (
                          <Badge action="warning"><BadgeText className="text-amber-700">+{s.pending_xp} pending</BadgeText></Badge>
                        )}
                      </HStack>
                    </HStack>
                  ))}
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          <Divider />
          <Button variant="outline" action="negative" onPress={logout}>
            <ButtonText>Sign Out</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
