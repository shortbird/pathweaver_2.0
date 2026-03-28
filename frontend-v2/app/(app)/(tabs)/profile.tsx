/**
 * Profile - Student overview with XP breakdown, achievements, engagement, and settings.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, Platform, Modal, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useProfile, Viewer } from '@/src/hooks/useProfile';
import api from '@/src/services/api';
import { useGlobalEngagement } from '@/src/hooks/useDashboard';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { PillarRadar } from '@/src/components/engagement/PillarRadar';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Avatar, AvatarFallbackText, AvatarImage,
  Skeleton,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { PortfolioSection } from '@/src/components/portfolio/PortfolioSection';

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
  const { pillarXP, achievements, subjectXP, viewers, deletionStatus, portfolioPublic: hookPortfolioPublic, setPortfolioPublic: setHookPortfolioPublic, portfolioSlug, loading, refetch } = useProfile();
  const { data: engagement } = useGlobalEngagement();

  const [editVisible, setEditVisible] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editDisplay, setEditDisplay] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteObserverVisible, setInviteObserverVisible] = useState(false);
  const [observerEmail, setObserverEmail] = useState('');
  const [invitingObserver, setInvitingObserver] = useState(false);
  const [deletionRequesting, setDeletionRequesting] = useState(false);
  const [portfolioCopied, setPortfolioCopied] = useState(false);
  const [makingPublic, setMakingPublic] = useState(false);
  const portfolioPublic = hookPortfolioPublic;
  const setPortfolioPublic = setHookPortfolioPublic;

  const isStudent = user?.role === 'student' || user?.org_role === 'student';

  const handleInviteObserver = async () => {
    if (!observerEmail.trim()) return;
    setInvitingObserver(true);
    try {
      await api.post('/api/observers/invite', { observer_email: observerEmail.trim() });
      Alert.alert('Sent', `Invitation sent to ${observerEmail.trim()}`);
      setObserverEmail('');
      setInviteObserverVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInvitingObserver(false);
    }
  };

  const handleRemoveObserver = (linkId: string, name: string) => {
    Alert.alert('Remove Observer', `Remove ${name} from your observers?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/observers/${linkId}/remove`);
            Alert.alert('Removed', `${name} has been removed as an observer.`);
            refetch();
          } catch {
            Alert.alert('Error', 'Failed to remove observer');
          }
        },
      },
    ]);
  };

  const handleRequestDeletion = () => {
    Alert.alert(
      'Delete Account',
      'This will schedule your account for permanent deletion in 30 days. You can cancel within the grace period.\n\nAll your data will be permanently deleted after 30 days. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account', style: 'destructive', onPress: async () => {
            setDeletionRequesting(true);
            try {
              await api.post('/api/users/delete-account', { reason: 'User requested deletion' });
              Alert.alert('Scheduled', 'Account deletion scheduled. You have 30 days to cancel.');
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to request account deletion');
            } finally {
              setDeletionRequesting(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelDeletion = async () => {
    try {
      await api.post('/api/users/cancel-deletion', {});
      Alert.alert('Cancelled', 'Account deletion has been cancelled.');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to cancel deletion');
    }
  };

  const openEdit = () => {
    setEditFirst(user?.first_name || '');
    setEditLast(user?.last_name || '');
    setEditDisplay(user?.display_name || '');
    setEditBio((user as any)?.bio || '');
    setEditVisible(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/api/users/profile', {
        display_name: editDisplay.trim(),
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        bio: editBio.trim(),
      });
      setEditVisible(false);
      refetch();
      // Update authStore user
      useAuthStore.getState().loadUser();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

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
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pb-12" showsVerticalScrollIndicator={false}>
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
                {memberSince && <UIText size="sm" className="text-typo-400">Member since {memberSince}</UIText>}
                <Pressable onPress={openEdit} className="flex-row items-center gap-1 mt-1">
                  <Ionicons name="pencil-outline" size={14} color="#6D469B" />
                  <UIText size="xs" className="text-optio-purple font-poppins-medium">Edit Profile</UIText>
                </Pressable>
                {(user as any)?.bio ? (
                  <UIText size="sm" className="text-typo-500 text-center mt-1 px-4" numberOfLines={3}>
                    {(user as any).bio}
                  </UIText>
                ) : null}
              </VStack>
              <HStack className="justify-around w-full mt-2">
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-purple">{(user?.total_xp || 0).toLocaleString()}</UIText>
                  <UIText size="xs" className="text-typo-400">Total XP</UIText>
                </VStack>
                <VStack className="items-center">
                  <UIText size="lg" className="font-poppins-bold text-optio-pink">{achievements.filter((a: any) => a.status === 'completed').length}</UIText>
                  <UIText size="xs" className="text-typo-400">Quests</UIText>
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
                <VStack space="sm" className="items-center">
                  <PillarRadar data={pillarXP} />
                  <HStack className="flex-wrap gap-3 justify-center">
                    {pillarXP.map(({ pillar, xp }, idx) => (
                      <HStack key={`${pillar}-${idx}`} className="items-center gap-1">
                        <UIText size="xs" className="font-poppins-medium text-typo-500">
                          {pillar === 'stem' ? 'STEM' : pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                        </UIText>
                        <UIText size="xs" className="text-typo-400">{xp.toLocaleString()}</UIText>
                      </HStack>
                    ))}
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
                    color={portfolioPublic ? '#16A34A' : '#9CA3AF'}
                  />
                  <UIText size="xs" className={portfolioPublic ? 'text-green-600' : 'text-typo-400'}>
                    {portfolioPublic ? 'Public' : 'Private'}
                  </UIText>
                </HStack>
                <HStack className="items-center gap-2">
                  {!portfolioPublic && (
                    <Pressable
                      onPress={async () => {
                        if (makingPublic) return;
                        const confirmed = Platform.OS === 'web'
                          ? window.confirm('Make your portfolio public? Anyone with the link will be able to view your learning achievements.')
                          : true;
                        if (!confirmed) return;
                        setMakingPublic(true);
                        try {
                          await api.put(`/api/portfolio/user/${user?.id}/privacy`, {
                            is_public: true,
                            consent_acknowledged: true,
                          });
                          setPortfolioPublic(true);
                        } catch (err: any) {
                          const msg = err.response?.data?.message || 'Failed to make portfolio public';
                          Alert.alert('Error', msg);
                        } finally {
                          setMakingPublic(false);
                        }
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
                        Alert.alert('Private Portfolio', 'Make your portfolio public first to share it.');
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
                        Share.share({ message: `Check out my learning portfolio: ${url}`, url });
                      }
                    }}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      portfolioCopied ? 'bg-green-100' : portfolioPublic ? 'bg-optio-purple/10' : 'bg-surface-100'
                    }`}
                  >
                    <Ionicons
                      name={portfolioCopied ? 'checkmark-circle' : 'share-outline'}
                      size={16}
                      color={portfolioCopied ? '#16A34A' : portfolioPublic ? '#6D469B' : '#9CA3AF'}
                    />
                    <UIText size="xs" className={`font-poppins-medium ${
                      portfolioCopied ? 'text-green-700' : portfolioPublic ? 'text-optio-purple' : 'text-typo-400'
                    }`}>
                      {portfolioCopied ? 'Link copied!' : 'Share Portfolio'}
                    </UIText>
                  </Pressable>
                </HStack>
              </HStack>
            </VStack>
            <PortfolioSection achievements={achievements} />
          </CollapsibleSection>

          {/* Subject XP */}
          {subjectXP.length > 0 && (
            <CollapsibleSection title="Subject Credits" defaultOpen={false}>
              <Card variant="elevated" size="md">
                <VStack space="sm">
                  {subjectXP.map((s: any, idx: number) => (
                    <HStack key={s.school_subject || `subject-${idx}`} className="items-center justify-between py-1">
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

          {/* Observer management (students) */}
          {isStudent && (
            <CollapsibleSection title="Who Can See My Activity">
              <Card variant="elevated" size="md">
                <VStack space="md">
                  <UIText size="sm" className="text-typo-500">
                    These people can view your learning activity and leave comments.
                  </UIText>
                  {viewers.length > 0 ? (
                    <VStack space="xs">
                      {viewers.map((viewer: Viewer, idx: number) => (
                        <HStack key={`viewer-${idx}`} className="items-center justify-between py-2">
                          <HStack className="items-center gap-3 flex-1">
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: viewer.type === 'platform' ? '#6D469B15' : viewer.type === 'parent' ? '#3B82F615' : viewer.type === 'advisor' ? '#10B98115' : '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons
                                name={viewer.type === 'platform' ? 'shield-checkmark' : viewer.type === 'parent' ? 'people' : viewer.type === 'advisor' ? 'school' : 'eye'}
                                size={18}
                                color={viewer.type === 'platform' ? '#6D469B' : viewer.type === 'parent' ? '#3B82F6' : viewer.type === 'advisor' ? '#10B981' : '#F59E0B'}
                              />
                            </View>
                            <VStack>
                              <UIText size="sm" className="font-poppins-medium">{viewer.name}</UIText>
                              <UIText size="xs" className="text-typo-400">{viewer.detail}</UIText>
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
                    <UIText size="sm" className="text-typo-400 text-center py-2">No observers yet</UIText>
                  )}
                  <Divider />
                  <Button size="md" variant="outline" onPress={() => setInviteObserverVisible(true)}>
                    <ButtonText>Invite an Observer</ButtonText>
                  </Button>
                </VStack>
              </Card>
            </CollapsibleSection>
          )}

          {/* Family link (mobile only, parents/superadmin) */}
          {Platform.OS !== 'web' &&
            (user?.role === 'parent' || user?.role === 'superadmin' ||
              user?.org_role === 'parent' ||
              (user as any)?.has_dependents || (user as any)?.has_linked_students) && (
            <Pressable onPress={() => router.push('/(app)/(tabs)/family' as any)}>
              <Card variant="elevated" size="md">
                <HStack className="items-center gap-3">
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#6D469B15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={22} color="#6D469B" />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="sm" className="font-poppins-semibold">Family Dashboard</UIText>
                    <UIText size="xs" className="text-typo-400">View your children's learning</UIText>
                  </VStack>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </HStack>
              </Card>
            </Pressable>
          )}

          {/* Account Settings */}
          <CollapsibleSection title="Account Settings" defaultOpen={false}>
            <Card variant="elevated" size="md">
              <VStack space="md">
                {deletionStatus.deletion_status === 'pending' ? (
                  <VStack space="sm">
                    <HStack className="items-center gap-2">
                      <Ionicons name="warning" size={20} color="#EF4444" />
                      <UIText size="sm" className="font-poppins-semibold text-red-600">Account Deletion Scheduled</UIText>
                    </HStack>
                    <UIText size="sm" className="text-typo-500">
                      Your account is scheduled for permanent deletion
                      {deletionStatus.days_remaining !== undefined && ` in ${deletionStatus.days_remaining} days`}.
                      All data will be permanently removed after this period.
                    </UIText>
                    {deletionStatus.deletion_scheduled_for && (
                      <UIText size="xs" className="text-typo-400">
                        Scheduled for: {new Date(deletionStatus.deletion_scheduled_for).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </UIText>
                    )}
                    <Button size="md" variant="outline" onPress={handleCancelDeletion}>
                      <ButtonText>Cancel Deletion</ButtonText>
                    </Button>
                  </VStack>
                ) : (
                  <VStack space="sm">
                    <UIText size="sm" className="font-poppins-medium">Delete Account</UIText>
                    <UIText size="sm" className="text-typo-500">
                      Permanently delete your account and all associated data. A 30-day grace period applies.
                    </UIText>
                    <Button size="md" variant="outline" action="negative" onPress={handleRequestDeletion} loading={deletionRequesting} disabled={deletionRequesting}>
                      <ButtonText>Delete My Account</ButtonText>
                    </Button>
                  </VStack>
                )}
              </VStack>
            </Card>
          </CollapsibleSection>

          <Divider />
          <Button variant="outline" action="negative" onPress={logout}>
            <ButtonText>Sign Out</ButtonText>
          </Button>
        </VStack>
      </ScrollView>

      {/* Invite Observer Modal */}
      <Modal visible={inviteObserverVisible} transparent animationType="none" onRequestClose={() => setInviteObserverVisible(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setInviteObserverVisible(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <Heading size="lg">Invite Observer</Heading>
              <UIText size="sm" className="text-typo-500">
                Enter the email of someone you'd like to observe your learning journey.
              </UIText>
              <TextInput
                value={observerEmail}
                onChangeText={setObserverEmail}
                placeholder="Observer's email address"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                className="bg-surface-50 rounded-xl p-4 text-base"
                style={{ fontFamily: 'Poppins_400Regular' }}
              />
              <Button size="lg" onPress={handleInviteObserver} loading={invitingObserver} disabled={!observerEmail.trim() || invitingObserver} className="w-full">
                <ButtonText>Send Invitation</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} transparent animationType="none" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setEditVisible(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Edit Profile</Heading>
                <Pressable onPress={() => setEditVisible(false)} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </HStack>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Display Name</UIText>
                <TextInput
                  value={editDisplay}
                  onChangeText={setEditDisplay}
                  placeholder="Display name"
                  placeholderTextColor="#9CA3AF"
                  className="bg-surface-50 rounded-xl p-4 text-base"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
              </VStack>
              <HStack space="sm">
                <VStack space="xs" className="flex-1">
                  <UIText size="sm" className="font-poppins-medium">First Name</UIText>
                  <TextInput
                    value={editFirst}
                    onChangeText={setEditFirst}
                    placeholder="First name"
                    placeholderTextColor="#9CA3AF"
                    className="bg-surface-50 rounded-xl p-4 text-base"
                    style={{ fontFamily: 'Poppins_400Regular' }}
                  />
                </VStack>
                <VStack space="xs" className="flex-1">
                  <UIText size="sm" className="font-poppins-medium">Last Name</UIText>
                  <TextInput
                    value={editLast}
                    onChangeText={setEditLast}
                    placeholder="Last name"
                    placeholderTextColor="#9CA3AF"
                    className="bg-surface-50 rounded-xl p-4 text-base"
                    style={{ fontFamily: 'Poppins_400Regular' }}
                  />
                </VStack>
              </HStack>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Learning Vision / Bio</UIText>
                <TextInput
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="What drives your learning? What are you passionate about?"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="bg-surface-50 rounded-xl p-4 text-base min-h-[80px]"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
              </VStack>
              <Button size="lg" onPress={handleSaveProfile} loading={saving} disabled={saving} className="w-full">
                <ButtonText>Save Changes</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
