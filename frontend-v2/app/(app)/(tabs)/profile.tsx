/**
 * Profile - Student overview with XP breakdown, achievements, engagement, and settings.
 */

import React, { useState, useRef, useMemo } from 'react';
import { View, ScrollView, Pressable, Platform, Modal, TextInput, KeyboardAvoidingView, Image, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import * as Updates from 'expo-updates';
import { UpdateDiagnosticsModal } from '@/src/components/debug/UpdateDiagnosticsModal';
import * as Application from 'expo-application';
import { useAuthStore } from '@/src/stores/authStore';
import { useProfile, Viewer } from '@/src/hooks/useProfile';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import { showAlert, confirmAlert } from '@/src/utils/alerts';
import { requestAccountDeletion, cancelAccountDeletion } from '@/src/utils/accountDeletion';
import { useGlobalEngagement, useDashboard } from '@/src/hooks/useDashboard';
import { useIsParent } from '@/src/hooks/useStartSomething';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { PillarRadar } from '@/src/components/engagement/PillarRadar';
import { pillars as pillarConfig } from '@/src/config/pillars';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider, Avatar, AvatarFallbackText, AvatarImage,
  Skeleton,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { ProfileActivityFeed } from '@/src/components/feed/ProfileActivityFeed';
import { SubjectCreditsGrid } from '@/src/components/portfolio/SubjectCreditsGrid';
import { DiplomaCreditTracker } from '@/src/components/diploma/DiplomaCreditTracker';

// Native-only system date picker (iOS spinner / Android dialog), used by the
// date-of-birth field in the edit sheet. Guarded so the web bundle -- which
// uses <input type="date"> -- never imports the native module. Same pattern as
// the register screen.
const DateTimePicker = Platform.OS === 'web'
  ? null
  : require('@react-native-community/datetimepicker').default;

const pillarColors: Record<string, { bg: string; bar: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', bar: 'bg-pillar-stem', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', bar: 'bg-pillar-art', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', bar: 'bg-pillar-communication', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', bar: 'bg-pillar-civics', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', bar: 'bg-pillar-wellness', text: 'text-pillar-wellness' },
};

// Subject credit donut geometry — hoisted so we don't recompute trig per render per subject.
const SUBJECT_XP_PER_CREDIT = 2000;
const SUBJECT_CREDIT_REQUIREMENTS: Record<string, { displayName: string; credits: number }> = {
  language_arts: { displayName: 'Language Arts', credits: 4 },
  math: { displayName: 'Mathematics', credits: 3 },
  science: { displayName: 'Science', credits: 3 },
  social_studies: { displayName: 'Social Studies', credits: 4 },
  financial_literacy: { displayName: 'Financial Literacy', credits: 0.5 },
  health: { displayName: 'Health', credits: 0.5 },
  pe: { displayName: 'Physical Education', credits: 2 },
  fine_arts: { displayName: 'Fine Arts', credits: 1.5 },
  cte: { displayName: 'Career & Tech', credits: 1 },
  digital_literacy: { displayName: 'Digital Literacy', credits: 0.5 },
  electives: { displayName: 'Electives', credits: 4 },
};
const DONUT_SIZE = 80;
const DONUT_STROKE = 7;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const c = useThemeColors();
  return (
    <VStack>
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center justify-between py-2">
        <Heading size="md">{title}</Heading>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.iconMuted} />
      </Pressable>
      {open && children}
    </VStack>
  );
}

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = useThemeColors();
  const { pillarXP, momentsCount, achievements, subjectXP, viewers, deletionStatus, portfolioPublic: hookPortfolioPublic, setPortfolioPublic: setHookPortfolioPublic, portfolioSlug, loading, refetch } = useProfile();
  const { data: engagement } = useGlobalEngagement();
  // Active quests with task-completion counts, surfaced on the profile
  // (bug #5: "I want to see active quests here that also show completed tasks").
  const { data: dashboardData } = useDashboard();
  const activeQuests = dashboardData?.active_quests || [];
  // Family Dashboard is parent-only. useIsParent respects the superadmin role
  // selector (previewRole), so previewing as Student/Observer correctly hides it.
  const isParent = useIsParent();

  const [editVisible, setEditVisible] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editDisplay, setEditDisplay] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editDob, setEditDob] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteObserverVisible, setInviteObserverVisible] = useState(false);
  const [otaDebugVisible, setOtaDebugVisible] = useState(false);
  const [invitingObserver, setInvitingObserver] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  // Set when the server says a minor must ask a parent instead; it names who.
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [deletionRequesting, setDeletionRequesting] = useState(false);
  const [portfolioCopied, setPortfolioCopied] = useState(false);
  const [makingPublic, setMakingPublic] = useState(false);
  const [showFerpaConsent, setShowFerpaConsent] = useState(false);
  const [ferpaChecked, setFerpaChecked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const portfolioPublic = hookPortfolioPublic;
  const setPortfolioPublic = setHookPortfolioPublic;

  const isStudent = user?.role === 'student' || user?.org_role === 'student';

  // Observer invites are a shareable LINK, not an email. The email endpoint
  // this screen used to POST to (/api/observers/invite) does not exist —
  // student invites became link-based, and the button had been failing with a
  // 404 for everyone who pressed it. /api/observers/generate-link is the
  // supported path and returns a URL to hand out.
  const handleGenerateInviteLink = async () => {
    setInvitingObserver(true);
    setInviteNotice(null);
    try {
      const { data } = await api.post('/api/observers/generate-link', {});
      if (!data?.shareable_link) throw new Error('No link returned');
      setInviteLink(data.shareable_link);
    } catch (err: any) {
      const body = err?.response?.data;
      // A minor cannot hand out access to their own record — the server
      // answers with who to ask instead, so show that rather than an error.
      if (body?.error === 'parent_required' && body?.message) {
        setInviteNotice(body.message);
      } else {
        showAlert('Error', body?.error || 'Could not create an invite link');
      }
    } finally {
      setInvitingObserver(false);
    }
  };

  const closeInviteObserver = () => {
    setInviteObserverVisible(false);
    setInviteLink(null);
    setInviteNotice(null);
  };

  const handleRemoveObserver = async (linkId: string, name: string) => {
    const confirmed = await confirmAlert({
      title: 'Remove Observer',
      message: `Remove ${name} from your observers?`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/api/observers/${linkId}/remove`);
      showAlert('Removed', `${name} has been removed as an observer.`);
      refetch();
    } catch {
      showAlert('Error', 'Failed to remove observer');
    }
  };

  const handleRequestDeletion = () =>
    requestAccountDeletion({
      onRequestingChange: setDeletionRequesting,
      onScheduled: refetch,
    });

  const handleCancelDeletion = () => cancelAccountDeletion(refetch);

  // A date of birth is not freely editable once it has been attested through an
  // age gate, and never by a parent-managed account. The backend is the gate
  // (routes/users/profile.py); this only decides whether to offer the field, so
  // a locked user reads an explanation instead of hitting a validation error.
  const savedDob = (user?.date_of_birth || '').slice(0, 10);
  const dobLocked = Boolean(user?.date_of_birth_locked_at) || Boolean(user?.is_dependent);

  const openEdit = () => {
    setEditFirst(user?.first_name || '');
    setEditLast(user?.last_name || '');
    setEditDisplay(user?.display_name || '');
    setEditBio((user as any)?.bio || '');
    setEditDob(savedDob);
    setShowDobPicker(false);
    setEditVisible(true);
  };

  // Date-picker helpers, mirroring the register screen: maxDob caps at today,
  // initialDob opens near a plausible birth year instead of scrolling decades.
  const maxDob = useMemo(() => new Date(), []);
  const initialDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return d;
  }, []);
  const todayIso = new Date().toISOString().split('T')[0];
  const formatDob = (iso: string) => {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const onDobChange = (event: any, selected?: Date) => {
    // Android shows a one-shot dialog; close it on any result. iOS keeps the
    // inline spinner open until the user taps Done.
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (event?.type === 'dismissed' || !selected) return;
    const y = selected.getFullYear();
    const m = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    setEditDob(`${y}-${m}-${dd}`);
  };

  // COPPA: an under-13 account has to be parent-managed, so the backend refuses
  // a self-service date that young. Say so before the round trip rather than
  // after it.
  const dobIsUnder13 = useMemo(() => {
    if (!editDob) return false;
    const birth = new Date(`${editDob}T12:00:00`);
    if (Number.isNaN(birth.getTime())) return false;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 13);
    return birth > cutoff;
  }, [editDob]);

  const handleSaveProfile = async () => {
    if (!dobLocked && dobIsUnder13) {
      showAlert(
        'Parent Account Required',
        'Accounts for children under 13 must be managed by a parent or guardian. Ask them to correct this date from their account.'
      );
      return;
    }
    setSaving(true);
    try {
      // display_name is intentionally not sent — the backend derives it from
      // first + last name so there's a single source of truth.
      const payload: Record<string, string> = {
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        bio: editBio.trim(),
      };
      // Only sent when it actually changed: the backend treats date_of_birth as
      // a gated field, so resending an unchanged value on every bio edit would
      // put a locked account through that check for nothing.
      if (!dobLocked && editDob !== savedDob) {
        payload.date_of_birth = editDob;
      }
      await api.put('/api/users/profile', payload);
      setEditVisible(false);
      refetch();
      // Update authStore user
      useAuthStore.getState().loadUser();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  const maxPillarXP = Math.max(...pillarXP.map((p) => p.xp), 1);

  // Build + OTA indicator (see footer). "base build" = running the binary's
  // bundled JS (no OTA applied yet); "update <id>" = an OTA is live; "dev" = Metro.
  const appVersion = Application.nativeApplicationVersion || '?';
  const buildNumber = Application.nativeBuildVersion || '?';
  const otaLabel = !Updates.isEnabled
    ? 'dev'
    : Updates.isEmbeddedLaunch
      ? 'base build'
      : `update ${(Updates.updateId || '').slice(0, 8)}`;
  const otaMeta = (Updates.isEnabled && !Updates.isEmbeddedLaunch)
    ? [Updates.channel, Updates.createdAt ? Updates.createdAt.toLocaleString() : null].filter(Boolean).join(' · ')
    : '';

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top', 'left', 'right']}>
        <VStack className="px-5 pt-6" space="lg">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </VStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-5 md:px-8 pb-4"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
      >
        <PageHeader title="Profile" />
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
                {memberSince && <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">Member since {memberSince}</UIText>}
                <Pressable onPress={openEdit} className="flex-row items-center gap-1 mt-1">
                  <Ionicons name="pencil-outline" size={14} color={c.brand} />
                  <UIText size="xs" className="text-optio-purple font-poppins-medium">Edit Profile</UIText>
                </Pressable>
                {(user as any)?.bio ? (
                  <UIText size="sm" className="text-typo-500 text-center mt-1 px-4 dark:text-dark-typo-500" numberOfLines={3}>
                    {(user as any).bio}
                  </UIText>
                ) : null}
              </VStack>
              <HStack className="justify-around w-full mt-2">
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-purple">{(user?.total_xp || 0).toLocaleString()}</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Total XP</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-pink">{achievements.filter((a: any) => a.status === 'completed').length}</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Quests</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-pillar-stem">{(momentsCount || 0).toLocaleString()}</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Moments</UIText>
                </VStack>
              </HStack>
            </VStack>
          </Card>

          {/* Engagement Calendar */}
          <CollapsibleSection title="Learning Activity">
            <Card variant="elevated" size="md">
              <EngagementCalendar days={engagement?.calendar?.days || []} firstActivityDate={engagement?.calendar?.first_activity_date} />
            </Card>
          </CollapsibleSection>

          {/* Active Quests — each with its task-completion count (bug #5) */}
          {activeQuests.length > 0 && (
            <CollapsibleSection title="Active Quests">
              <Card variant="elevated" size="md">
                <VStack space="sm">
                  {activeQuests.map((uq: any) => {
                    const q = uq.quests || uq;
                    const total = q.task_count ?? (q.quest_tasks?.length || 0);
                    const done = uq.completed_tasks ?? 0;
                    return (
                      <Pressable
                        key={uq.id}
                        onPress={() => router.push(`/(app)/quests/${q.id}`)}
                        className="flex-row items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-dark-surface-100"
                      >
                        <VStack className="flex-1 pr-3">
                          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{q.title || 'Quest'}</UIText>
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                            {total > 0 ? `${done} of ${total} tasks complete` : 'No tasks yet'}
                          </UIText>
                        </VStack>
                        <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
                      </Pressable>
                    );
                  })}
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          {/* Pillar XP — radar chart with pillar ICONS at each vertex (bug #22),
              with an icon legend below mapping each icon to its XP. */}
          {pillarXP.length > 0 && (
            <CollapsibleSection title="Pillar Breakdown">
              <Card variant="elevated" size="md">
                <VStack space="md" className="items-center">
                  <PillarRadar data={pillarXP} />
                  <HStack className="flex-wrap gap-x-4 gap-y-2 justify-center">
                    {pillarXP.map(({ pillar, xp }, idx) => {
                      const pc = pillarConfig[pillar];
                      return (
                        <HStack key={`${pillar}-${idx}`} className="items-center gap-1.5">
                          <Ionicons name={pc?.iconFilled || 'ellipse'} size={14} color={pc?.color || c.brand} />
                          <UIText size="xs" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500">{pc?.label || pillar}</UIText>
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{xp.toLocaleString()}</UIText>
                        </HStack>
                      );
                    })}
                  </HStack>
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          {/* Portfolio */}
          <CollapsibleSection title="Portfolio" defaultOpen={false}>
            <VStack space="sm" className="mb-2">
              <HStack className="items-center justify-between">
                <HStack className="items-center gap-2">
                  <Ionicons
                    name={portfolioPublic ? 'globe-outline' : 'lock-closed-outline'}
                    size={14}
                    color={portfolioPublic ? '#16A34A' : c.iconMuted}
                  />
                  <UIText size="xs" className={portfolioPublic ? 'text-green-600' : 'text-typo-400 dark:text-dark-typo-400'}>
                    {portfolioPublic ? 'Public' : 'Private'}
                  </UIText>
                </HStack>
                <HStack className="items-center gap-2">
                  {!portfolioPublic && (
                    <Pressable
                      onPress={() => {
                        if (makingPublic) return;
                        setFerpaChecked(false);
                        setShowFerpaConsent(true);
                      }}
                      className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50"
                    >
                      <Ionicons name="globe-outline" size={14} color="#16A34A" />
                      <UIText size="xs" className="text-green-700 font-poppins-medium">
                        {makingPublic ? 'Publishing...' : 'Make Public'}
                      </UIText>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={async () => {
                      if (!portfolioPublic) {
                        showAlert('Private Portfolio', 'Make your portfolio public first to share it.');
                        return;
                      }
                      const slug = portfolioSlug || (user as any)?.portfolio_slug || user?.id;
                      const url = `https://www.optioeducation.com/portfolio/${slug}`;
                      if (Platform.OS === 'web') {
                        try {
                          await navigator.clipboard.writeText(url);
                          setPortfolioCopied(true);
                          setTimeout(() => setPortfolioCopied(false), 2500);
                        } catch {
                          window.prompt('Copy your portfolio link:', url);
                        }
                      } else {
                        const { Share } = require('react-native');
                        // iOS shares `message` and `url` separately, so embedding
                        // the link in both makes it appear twice. iOS: link in
                        // `url` only; Android ignores `url`, so embed it inline.
                        const intro = 'Check out my learning portfolio:';
                        Share.share(
                          Platform.OS === 'ios'
                            ? { message: intro, url }
                            : { message: `${intro} ${url}` }
                        );
                      }
                    }}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      portfolioCopied ? 'bg-green-100' : portfolioPublic ? 'bg-optio-purple/10' : 'bg-surface-100 dark:bg-dark-surface-200'
                    }`}
                  >
                    <Ionicons
                      name={portfolioCopied ? 'checkmark-circle' : 'share-outline'}
                      size={16}
                      color={portfolioCopied ? '#16A34A' : portfolioPublic ? c.brand : c.iconMuted}
                    />
                    <UIText size="xs" className={`font-poppins-medium ${
                      portfolioCopied ? 'text-green-700' : portfolioPublic ? 'text-optio-purple' : 'text-typo-400 dark:text-dark-typo-400'
                    }`}>
                      {portfolioCopied ? 'Link copied!' : 'Share Portfolio'}
                    </UIText>
                  </Pressable>
                </HStack>
              </HStack>
            </VStack>
            <ProfileActivityFeed studentId={user?.id} showStudent={false} />
          </CollapsibleSection>

          {/* Subject Credits */}
          {subjectXP.length > 0 && (
            <CollapsibleSection title="Subject Credits" defaultOpen={false}>
              <SubjectCreditsGrid subjectXP={subjectXP} />
            </CollapsibleSection>
          )}

          {/* Diploma Credit Tracker (students) */}
          {isStudent && (
            <CollapsibleSection title="Diploma Credits" defaultOpen={false}>
              <DiplomaCreditTracker />
            </CollapsibleSection>
          )}

          {/* Observer management (students) */}
          {isStudent && (
            <CollapsibleSection title="Who Can See My Activity">
              <Card variant="elevated" size="md">
                <VStack space="md">
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                    These people can view your learning activity and leave comments.
                  </UIText>
                  {viewers.length > 0 ? (
                    <VStack space="xs">
                      {viewers.map((viewer: Viewer, idx: number) => (
                        <HStack key={`viewer-${idx}`} className="items-center justify-between py-2">
                          <HStack className="items-center gap-3 flex-1">
                            {viewer.type === 'platform' ? (
                              // Optio (the platform) shows as the logo, not a shield + the word "Optio".
                              <Image source={require('@/assets/images/icon.png')} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff' }} />
                            ) : (
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: viewer.type === 'parent' ? '#3B82F615' : viewer.type === 'advisor' ? '#10B98115' : '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons
                                  name={viewer.type === 'parent' ? 'people' : viewer.type === 'advisor' ? 'school' : 'eye'}
                                  size={18}
                                  color={viewer.type === 'parent' ? '#3B82F6' : viewer.type === 'advisor' ? '#10B981' : '#F59E0B'}
                                />
                              </View>
                            )}
                            <VStack>
                              <UIText size="sm" className="font-poppins-medium">{viewer.name}</UIText>
                              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{viewer.detail}</UIText>
                            </VStack>
                          </HStack>
                          {viewer.removable && viewer.link_id && (
                            <Pressable onPress={() => handleRemoveObserver(viewer.link_id!, viewer.name)} className="p-2">
                              <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
                            </Pressable>
                          )}
                        </HStack>
                      ))}
                    </VStack>
                  ) : (
                    <UIText size="sm" className="text-typo-400 text-center py-2 dark:text-dark-typo-400">No observers yet</UIText>
                  )}
                  <Divider />
                  <Button size="md" variant="outline" onPress={() => setInviteObserverVisible(true)}>
                    <ButtonText>Invite an Observer</ButtonText>
                  </Button>
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          {/* Family link (mobile only, parents — gated via useIsParent so the
              superadmin role selector previewing Student/Observer hides it) */}
          {Platform.OS !== 'web' && isParent && (
            <Pressable onPress={() => router.push('/(app)/(tabs)/family' as any)}>
              <Card variant="elevated" size="md">
                <HStack className="items-center gap-3">
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${c.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={22} color={c.brand} />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="sm" className="font-poppins-semibold">Family Dashboard</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">View your children's learning</UIText>
                  </VStack>
                  <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
                </HStack>
              </Card>
            </Pressable>
          )}

          {/* Notifications, Account Settings (dark mode + account deletion) and
              Report a Bug now live in the kebab → Settings screen, so they're
              intentionally not duplicated here. */}

          {/* Build + OTA indicator — lets us confirm which JS a device is
              actually running: "base build" = the binary's bundled JS (no OTA
              applied yet), "update <id>" = an OTA is live, "dev" = Metro. */}
          <Pressable className="items-center pt-2 pb-4" onPress={() => setOtaDebugVisible(true)} accessibilityLabel="Open OTA diagnostics">
            <UIText size="xs" className="text-typo-300 dark:text-dark-typo-400">
              Optio v{appVersion} ({buildNumber}) · {otaLabel}
            </UIText>
            {otaMeta ? (
              <UIText size="xs" className="text-typo-300 dark:text-dark-typo-400">{otaMeta}</UIText>
            ) : null}
          </Pressable>
        </VStack>
      </ScrollView>

      {otaDebugVisible && (
        <UpdateDiagnosticsModal visible onClose={() => setOtaDebugVisible(false)} />
      )}

      {/* Invite Observer Modal — a shareable link, not an email invite. */}
      <Modal visible={inviteObserverVisible} transparent animationType="none" onRequestClose={closeInviteObserver}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={closeInviteObserver} />
          <View style={{ backgroundColor: isDark ? '#1E1E36' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <Heading size="lg">Invite an observer</Heading>

              {inviteNotice ? (
                // A minor asking: the server names the parent to ask, so say
                // that plainly rather than showing a failure.
                <HStack className="items-start gap-2 p-3 rounded-xl bg-surface-50 dark:bg-dark-surface-50">
                  <Ionicons name="information-circle-outline" size={18} color={c.brand} style={{ marginTop: 1 }} />
                  <UIText size="sm" className="flex-1 text-typo-500 dark:text-dark-typo-400">
                    {inviteNotice}
                  </UIText>
                </HStack>
              ) : inviteLink ? (
                <>
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                    Send this link to whoever you want following your learning. It
                    works once, and expires in 7 days.
                  </UIText>
                  <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4">
                    <UIText size="sm" className="text-typo-500 dark:text-dark-typo-400" selectable>
                      {inviteLink}
                    </UIText>
                  </View>
                  <Button
                    size="lg"
                    className="w-full"
                    onPress={() => Share.share(
                      Platform.OS === 'ios' ? { url: inviteLink } : { message: inviteLink },
                    )}
                  >
                    <ButtonText>Share link</ButtonText>
                  </Button>
                </>
              ) : (
                <>
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                    Create a link you can send to someone you'd like following your
                    learning journey. They'll be able to see your activity and
                    leave comments.
                  </UIText>
                  <Button size="lg" onPress={handleGenerateInviteLink} loading={invitingObserver} disabled={invitingObserver} className="w-full">
                    <ButtonText>Create invite link</ButtonText>
                  </Button>
                </>
              )}
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="none" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setEditVisible(false)} />
          {/* maxHeight + inner scroll: with the date-of-birth field the sheet is
              tall enough to run off a small screen once the keyboard is up. */}
          <View style={{ backgroundColor: isDark ? '#1E1E36' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, maxHeight: '90%' }}>
            <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mb-4" />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Edit Profile</Heading>
                <Pressable onPress={() => setEditVisible(false)} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
                  <Ionicons name="close" size={18} color={c.icon} />
                </Pressable>
              </HStack>
              {/* Display name is derived from First + Last on the backend, so we
                  don't expose a separate editable field here (it read as
                  redundant: "Display name and first + last name is too much"). */}
              <HStack space="sm">
                <VStack space="xs" className="flex-1">
                  <UIText size="sm" className="font-poppins-medium">First Name</UIText>
                  <TextInput
                    value={editFirst}
                    onChangeText={setEditFirst}
                    placeholder="First name"
                    placeholderTextColor={c.textFaint}
                    className="bg-surface-50 dark:bg-dark-surface-50 dark:text-dark-typo rounded-xl p-4 text-base"
                    style={{ fontFamily: 'Poppins_400Regular' }}
                  />
                </VStack>
                <VStack space="xs" className="flex-1">
                  <UIText size="sm" className="font-poppins-medium">Last Name</UIText>
                  <TextInput
                    value={editLast}
                    onChangeText={setEditLast}
                    placeholder="Last name"
                    placeholderTextColor={c.textFaint}
                    className="bg-surface-50 dark:bg-dark-surface-50 dark:text-dark-typo rounded-xl p-4 text-base"
                    style={{ fontFamily: 'Poppins_400Regular' }}
                  />
                </VStack>
              </HStack>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Date of Birth</UIText>
                {dobLocked ? (
                  <>
                    <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4">
                      <UIText size="sm" style={{ color: savedDob ? c.text : c.textFaint }}>
                        {savedDob ? formatDob(savedDob) : 'Not set'}
                      </UIText>
                    </View>
                    <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
                      {user?.is_dependent
                        ? 'Your parent or guardian manages your date of birth. Ask them to update it from their account.'
                        : 'Your date of birth is on file. Ask a parent, guardian, or your school to correct it if it is wrong.'}
                    </UIText>
                  </>
                ) : Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={editDob}
                    max={todayIso}
                    onChange={(e: any) => setEditDob(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: 'none',
                      fontSize: 16,
                      fontFamily: 'Poppins_400Regular, sans-serif',
                      backgroundColor: isDark ? '#252542' : '#F7F7FB',
                      color: editDob ? c.text : c.textFaint,
                    }}
                  />
                ) : (
                  <>
                    {/* Tapping opens the OS date picker (iOS spinner / Android dialog) */}
                    <Pressable
                      testID="profile-dob-trigger"
                      onPress={() => setShowDobPicker(true)}
                      className="flex-row items-center bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4"
                    >
                      <Ionicons name="calendar-outline" size={18} color={c.iconMuted} style={{ marginRight: 8 }} />
                      <UIText size="sm" style={{ color: editDob ? c.text : c.textFaint }}>
                        {editDob ? formatDob(editDob) : 'Select your date of birth'}
                      </UIText>
                    </Pressable>
                    {showDobPicker && DateTimePicker ? (
                      <DateTimePicker
                        testID="profile-dob-picker"
                        value={editDob ? new Date(`${editDob}T12:00:00`) : initialDob}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={maxDob}
                        onChange={onDobChange}
                      />
                    ) : null}
                    {Platform.OS === 'ios' && showDobPicker ? (
                      <Button size="sm" variant="outline" onPress={() => setShowDobPicker(false)} className="self-end mt-1">
                        <ButtonText>Done</ButtonText>
                      </Button>
                    ) : null}
                  </>
                )}
                {!dobLocked && dobIsUnder13 ? (
                  <UIText size="xs" className="text-red-500">
                    Accounts for children under 13 must be managed by a parent or guardian.
                  </UIText>
                ) : null}
              </VStack>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Learning Vision / Bio</UIText>
                <TextInput
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="What drives your learning? What are you passionate about?"
                  placeholderTextColor={c.textFaint}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="bg-surface-50 rounded-xl p-4 text-base min-h-[80px] dark:bg-dark-surface-50"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
              </VStack>
              <Button size="lg" onPress={handleSaveProfile} loading={saving} disabled={saving} className="w-full">
                <ButtonText>Save Changes</ButtonText>
              </Button>
            </VStack>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FERPA Consent Modal */}
      <Modal visible={showFerpaConsent} transparent animationType="fade" onRequestClose={() => setShowFerpaConsent(false)}>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: c.card, borderRadius: 20, width: 440, maxWidth: '92%', padding: 24, maxHeight: '85%' }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <VStack space="md">
                <HStack className="items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center">
                    <Ionicons name="globe-outline" size={20} color="#16A34A" />
                  </View>
                  <Heading size="lg">Make Your Portfolio Public</Heading>
                </HStack>

                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                  Making your portfolio public means anyone with the link can see:
                </UIText>

                <VStack space="sm" className="bg-surface-50 rounded-xl p-4 dark:bg-dark-surface-50">
                  {[
                    { icon: 'eye-outline' as const, text: 'Your completed quests and achievements' },
                    { icon: 'people-outline' as const, text: 'Evidence of your learning (photos, videos, documents)' },
                    { icon: 'globe-outline' as const, text: 'Your profile name and skill progress' },
                  ].map((item, idx) => (
                    <HStack key={idx} className="items-center gap-3">
                      <Ionicons name={item.icon} size={16} color={c.brand} />
                      <UIText size="xs" className="text-typo-500 flex-1 dark:text-dark-typo-500">{item.text}</UIText>
                    </HStack>
                  ))}
                </VStack>

                {user?.is_dependent && (
                  <View className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <UIText size="xs" className="text-amber-800">
                      Because you are under 18, your parent or guardian may need to approve this change.
                    </UIText>
                  </View>
                )}

                <Pressable
                  onPress={() => setFerpaChecked(!ferpaChecked)}
                  className="flex-row items-start gap-3 p-3 rounded-xl border border-surface-200 dark:border-dark-surface-300"
                >
                  <View className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${ferpaChecked ? 'bg-optio-purple border-optio-purple' : 'border-surface-300 dark:border-dark-surface-300'}`}>
                    {ferpaChecked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <UIText size="xs" className="text-typo-500 flex-1 dark:text-dark-typo-500">
                    I understand that my portfolio will be visible to anyone with the link, and I consent to sharing my learning achievements publicly.
                  </UIText>
                </Pressable>

                <HStack className="gap-3">
                  <Button size="md" variant="outline" onPress={() => setShowFerpaConsent(false)} className="flex-1">
                    <ButtonText>Cancel</ButtonText>
                  </Button>
                  <Button
                    size="md"
                    isDisabled={!ferpaChecked || makingPublic}
                    onPress={async () => {
                      setMakingPublic(true);
                      try {
                        await api.put(`/api/portfolio/user/${user?.id}/privacy`, {
                          is_public: true,
                          consent_acknowledged: true,
                        });
                        setPortfolioPublic(true);
                        setShowFerpaConsent(false);
                      } catch (err: any) {
                        showAlert('Error', err.response?.data?.message || 'Failed to make portfolio public');
                      } finally {
                        setMakingPublic(false);
                      }
                    }}
                    className="flex-1 bg-optio-purple"
                  >
                    <ButtonText>{makingPublic ? 'Publishing...' : 'Make Public'}</ButtonText>
                  </Button>
                </HStack>
              </VStack>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
