/**
 * Parent → child profile. A read-only version of the student Profile tab, so a
 * parent can tap a kid's photo on the Family dashboard and see the same overview
 * the student sees (XP, learning activity, pillar balance, portfolio).
 *
 * Reuses the existing profile building blocks (EngagementCalendar, PillarRadar,
 * PortfolioSection) fed by the parent-scoped /api/parent/child-overview endpoint
 * via useChildOverview.
 *
 * Read-only with ONE exception: the profile picture. A parent said she could
 * not change her son's photo and that the screen "looks like I'm the student" —
 * both of which start here. The photo was the affordance she reached for, and
 * it did nothing; the only way to set it was a "Change photo" item behind the
 * ⋮ menu on the Family tab, which nobody finds. So the avatar takes the tap it
 * already looked like it would take, and the header says whose profile this is
 * and who is looking at it.
 */
import React, { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadChildAvatar } from '@/src/services/api';
import { useAddKidStore } from '@/src/stores/addKidStore';
import { showAlert } from '@/src/utils/alerts';
import {
  VStack, HStack, Heading, UIText, Card, Divider,
  Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import ClassSchedule from '@/src/components/school/ClassSchedule';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { PillarRadar } from '@/src/components/engagement/PillarRadar';
import { ProfileActivityFeed } from '@/src/components/feed/ProfileActivityFeed';
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
  const { overview, loading, refetch } = useChildOverview(studentId || null);
  const { topics: childTopics } = useChildJournal(studentId || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  /** Set the child's profile picture. POST /api/parent/child/<id>/avatar takes
   *  both a managed dependent and a linked student, so every child a parent can
   *  see here is one they can set a photo for. */
  const handleChangePhoto = async () => {
    if (!studentId || uploadingAvatar) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      await uploadChildAvatar(studentId, {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      refetch?.();
      // The Family tab reads children from its own store — refresh it too, or
      // the new photo shows here and nowhere else.
      useAddKidStore.getState().refreshChildren();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Could not update the picture.';
      showAlert('Error', typeof msg === 'string' ? msg : 'Could not update the picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

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
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      {/* Header. The name alone read as "my profile" to a parent who had just
          arrived from the Family tab, so it says whose profile this is. */}
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <VStack className="flex-1 min-w-0">
          <Heading size="md" numberOfLines={1}>{student ? nameFromStudent(student) : 'Profile'}</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            {student ? `${student.first_name || 'Your child'}'s profile — your parent view` : 'Your parent view'}
          </UIText>
        </VStack>
      </HStack>

      {loading && !overview ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={c.brand} />
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
                <Pressable
                  onPress={handleChangePhoto}
                  disabled={uploadingAvatar}
                  accessibilityRole="button"
                  accessibilityLabel={`Change ${student?.first_name || 'your child'}'s profile picture`}
                >
                  <View>
                    <Avatar size="xl">
                      {student?.avatar_url ? (
                        <AvatarImage source={{ uri: student.avatar_url }} />
                      ) : (
                        <AvatarFallbackText>{initialsFromStudent(student)}</AvatarFallbackText>
                      )}
                    </Avatar>
                    {/* The camera badge is the whole point: without it the photo
                        looks like decoration and the parent never tries. */}
                    <View
                      className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center border-2"
                      style={{ backgroundColor: c.brand, borderColor: c.card }}
                    >
                      {uploadingAvatar ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="camera" size={16} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                </Pressable>
                <UIText size="xs" className="text-optio-purple font-poppins-medium">
                  {uploadingAvatar ? 'Uploading…' : 'Tap the photo to change it'}
                </UIText>
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

            {/* Where she is, and when. Renders nothing for a family whose
                school isn't on the SIS, or a child with no classes. */}
            <ClassSchedule studentId={studentId} defaultOpen />

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
                        <Ionicons name={(t.icon as any) || 'bookmark-outline'} size={14} color={t.color || c.brand} />
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

            {/* Activity feed — replaces the old expand-a-quest portfolio so a
                parent's profile view stays responsive on quests with lots of evidence. */}
            <VStack space="sm">
              <Heading size="md">Activity</Heading>
              <ProfileActivityFeed studentId={studentId || null} viewerCanModerate />
            </VStack>
          </VStack>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
