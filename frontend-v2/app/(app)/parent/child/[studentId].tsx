/**
 * Parent → child profile. A read-only version of the student Profile tab, so a
 * parent can tap a kid's photo on the Family dashboard and see the same overview
 * the student sees (XP, learning activity, pillar balance, portfolio).
 *
 * Reuses the existing profile building blocks (EngagementCalendar, PillarRadar,
 * PortfolioSection) fed by the parent-scoped /api/parent/child-overview endpoint
 * via useChildOverview.
 */
import React from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, HStack, Heading, UIText, Card, Divider,
  Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { PillarRadar } from '@/src/components/engagement/PillarRadar';
import { PortfolioSection } from '@/src/components/portfolio/PortfolioSection';
import { SubjectCreditsGrid } from '@/src/components/portfolio/SubjectCreditsGrid';
import { useChildOverview, useChildJournal } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const PILLAR_LABELS: Record<string, string> = {
  stem: 'STEM', wellness: 'Wellness', communication: 'Communication',
  civics: 'Civics', art: 'Art',
};

/** Age in whole years from an ISO date string, or null if unknown. */
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function nameFromStudent(s: any): string {
  return `${s?.first_name || ''} ${s?.last_name || ''}`.trim() || 'Student';
}
function initialsFromStudent(s: any): string {
  const i = `${s?.first_name?.[0] || ''}${s?.last_name?.[0] || ''}`.trim();
  return (i || '?').toUpperCase();
}

export default function ChildProfileScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const c = useThemeColors();
  const { overview, loading } = useChildOverview(studentId || null);
  const { topics: childTopics } = useChildJournal(studentId || null);

  const student = overview?.student;
  const dashboard = overview?.dashboard;
  const engagement = overview?.engagement;
  // The parent endpoint returns engagement.calendar as a days[] array; other
  // surfaces use { days, first_activity_date }. Handle both.
  const calendarDays: any[] = Array.isArray(engagement?.calendar)
    ? engagement.calendar
    : engagement?.calendar?.days || [];
  const firstActivityDate = engagement?.calendar?.first_activity_date || calendarDays?.[0]?.date;

  const pillarData = Object.entries(dashboard?.xp_by_pillar || {}).map(
    ([pillar, xp]) => ({ pillar, xp: Number(xp) || 0 }),
  );
  const pillarsWithXp = pillarData.filter((p) => p.xp > 0);
  const memberSince = student?.created_at
    ? new Date(student.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  // Subject credits are a high-school (13+) concept — only show for teens.
  const age = ageFromDob(student?.date_of_birth);
  const isTeen = age !== null && age >= 13;
  const pendingSubjectXp: Record<string, number> = overview?.pending_subject_xp || {};
  const subjectXP = Object.entries(overview?.subject_xp || {})
    .map(([school_subject, xp]) => ({
      school_subject,
      xp_amount: Number(xp) || 0,
      pending_xp: Number(pendingSubjectXp[school_subject]) || 0,
    }))
    .filter((s) => s.xp_amount > 0 || s.pending_xp > 0);
  const portfolioAchievements = overview?.portfolio_achievements || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      {/* Header */}
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <Heading size="md">{student ? nameFromStudent(student) : 'Profile'}</Heading>
      </HStack>

      {loading && !overview ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      ) : !overview ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="person-circle-outline" size={48} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2 text-center">
            Couldn't load this profile.
          </UIText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <VStack space="lg">
            {/* Identity + stats */}
            <Card variant="elevated" size="lg">
              <VStack className="items-center" space="sm">
                <Avatar size="xl">
                  {student?.avatar_url ? (
                    <AvatarImage source={{ uri: student.avatar_url }} />
                  ) : (
                    <AvatarFallbackText>{initialsFromStudent(student)}</AvatarFallbackText>
                  )}
                </Avatar>
                <Heading size="xl" numberOfLines={1}>{nameFromStudent(student)}</Heading>
                {memberSince && (
                  <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">Member since {memberSince}</UIText>
                )}
              </VStack>

              <Divider className="my-4" />

              <HStack className="justify-around">
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-purple">
                    {(dashboard?.total_xp || 0).toLocaleString()}
                  </UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Total XP</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-pink">
                    {overview?.completed_quests?.length || 0}
                  </UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Quests</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-pillar-stem">
                    {(dashboard?.moments_count || 0).toLocaleString()}
                  </UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Moments</UIText>
                </VStack>
              </HStack>
            </Card>

            {/* Learning Activity */}
            {calendarDays.length > 0 && (
              <VStack space="sm">
                <Heading size="md">Learning Activity</Heading>
                <Card variant="elevated" size="md">
                  <EngagementCalendar days={calendarDays} firstActivityDate={firstActivityDate} />
                </Card>
              </VStack>
            )}

            {/* Pillar Breakdown */}
            {pillarsWithXp.length > 0 && (
              <VStack space="sm">
                <Heading size="md">Pillar Breakdown</Heading>
                <Card variant="elevated" size="md">
                  <VStack space="sm" className="items-center">
                    <PillarRadar data={pillarData} />
                    <HStack className="flex-wrap gap-3 justify-center">
                      {pillarsWithXp.map((p) => (
                        <HStack key={p.pillar} className="items-center gap-1">
                          <UIText size="xs" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500">
                            {PILLAR_LABELS[p.pillar] || p.pillar}
                          </UIText>
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{p.xp.toLocaleString()}</UIText>
                        </HStack>
                      ))}
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            )}

            {/* Journal Topics — tap through to the child's full journal */}
            {childTopics.length > 0 && (
              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <Heading size="md">Journal Topics</Heading>
                  <Pressable onPress={() => router.push(`/(app)/parent/journal/${studentId}` as any)} hitSlop={8}>
                    <UIText size="sm" className="text-optio-purple font-poppins-medium">View all</UIText>
                  </Pressable>
                </HStack>
                <Card variant="elevated" size="md">
                  <HStack className="flex-wrap gap-2">
                    {childTopics.map((t: any) => (
                      <Pressable
                        key={t.id}
                        onPress={() => router.push(`/(app)/parent/journal/${studentId}` as any)}
                        className="flex-row items-center gap-1.5 px-3 py-2 rounded-full bg-surface-100 dark:bg-dark-surface-200"
                        style={{ minHeight: 36 }}
                      >
                        <Ionicons name={(t.icon as any) || 'bookmark-outline'} size={14} color={t.color || '#6D469B'} />
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{t.name}</UIText>
                      </Pressable>
                    ))}
                  </HStack>
                </Card>
              </VStack>
            )}

            {/* Subject Credits — high-school (13+) concept only */}
            {isTeen && subjectXP.length > 0 && (
              <VStack space="sm">
                <Heading size="md">Subject Credits</Heading>
                <SubjectCreditsGrid subjectXP={subjectXP} />
              </VStack>
            )}

            {/* Portfolio */}
            {portfolioAchievements.length > 0 && (
              <VStack space="sm">
                <Heading size="md">Portfolio</Heading>
                <PortfolioSection achievements={portfolioAchievements} />
              </VStack>
            )}
          </VStack>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
