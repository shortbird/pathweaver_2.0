/**
 * Create / Edit Bounty - Form for parents/advisors to post or edit a bounty.
 *
 * Fields: title, description, deliverables (dynamic), rewards (XP + custom),
 * visibility (public/family), and kid selector for family visibility.
 *
 * Edit mode: pass ?edit=bountyId to pre-fill from existing bounty.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import api, { bountyAPI } from '@/src/services/api';
import { haptic } from '@/src/utils/haptics';
import { createBounty, updateBounty } from '@/src/hooks/useBounties';
import { pillarKeys, getPillar } from '@/src/config/pillars';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Input, InputField, Divider, PillarBadge,
} from '@/src/components/ui';

interface Reward {
  type: 'xp' | 'custom';
  value: number;
  pillar: string;
  text: string;
}

export default function CreateBountyPage() {
  const { edit: editId } = useLocalSearchParams<{ edit?: string }>();
  const isEditMode = !!editId;
  const c = useThemeColors();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverables, setDeliverables] = useState(['']);
  const [rewards, setRewards] = useState<Reward[]>([{ type: 'xp', value: 50, pillar: 'stem', text: '' }]);
  const [pillar, setPillar] = useState('stem');
  const [visibility, setVisibility] = useState<'public' | 'family'>('family');
  const [maxClaims, setMaxClaims] = useState('0');
  // Native date picker holds the deadline as a Date. Default: 30 days out at
  // end-of-day so a "March 20" deadline doesn't time out at midnight.
  const [deadline, setDeadline] = useState<Date>(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    d.setHours(23, 59, 59, 0);
    return d;
  });
  // Android opens the system modal on demand; iOS uses an inline picker so
  // no toggle is needed there.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedKids, setSelectedKids] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);

  // Load existing bounty data in edit mode
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const { data } = await bountyAPI.get(editId);
        const bounty = data.bounty || data;
        setTitle(bounty.title || '');
        setDescription(bounty.description || '');
        setDeliverables(
          (bounty.deliverables || []).map((d: any) => d.text || d).filter(Boolean).length > 0
            ? (bounty.deliverables || []).map((d: any) => d.text || d)
            : ['']
        );
        setRewards(
          (bounty.rewards || []).map((r: any) => ({
            type: r.type || 'xp',
            value: r.value || 0,
            pillar: r.pillar || 'stem',
            text: r.text || '',
          }))
        );
        setPillar(bounty.pillar || 'stem');
        setVisibility(bounty.visibility === 'family' ? 'family' : 'public');
        if (bounty.max_participants != null) setMaxClaims(String(bounty.max_participants));
        if (bounty.deadline) {
          setDeadline(new Date(bounty.deadline));
        }
        setSelectedKids(bounty.allowed_student_ids || []);
      } catch {
        Alert.alert('Error', 'Failed to load bounty');
        router.back();
      } finally {
        setLoadingEdit(false);
      }
    })();
  }, [editId]);

  // Fetch dependents for family visibility kid selector
  useEffect(() => {
    (async () => {
      const allKids: any[] = [];
      const seenIds = new Set<string>();
      try {
        const res = await api.get('/api/dependents/my-dependents');
        for (const kid of (res.data.dependents || [])) {
          if (!seenIds.has(kid.id)) { allKids.push(kid); seenIds.add(kid.id); }
        }
      } catch { /* not a parent */ }
      try {
        const res = await api.get('/api/observers/my-students');
        for (const link of (res.data.students || [])) {
          const kidId = link.student_id || link.id;
          const info = link.student || {};
          if (kidId && !seenIds.has(kidId)) {
            allKids.push({ id: kidId, display_name: info.display_name || `${info.first_name || ''} ${info.last_name || ''}`.trim() || 'Student' });
            seenIds.add(kidId);
          }
        }
      } catch { /* no linked students */ }
      setDependents(allKids);
    })();
  }, []);

  const addDeliverable = () => setDeliverables([...deliverables, '']);
  const removeDeliverable = (i: number) => {
    if (deliverables.length <= 1) return;
    setDeliverables(deliverables.filter((_, idx) => idx !== i));
  };
  const updateDeliverable = (i: number, text: string) => {
    const updated = [...deliverables];
    updated[i] = text;
    setDeliverables(updated);
  };

  const addXPReward = () => setRewards([...rewards, { type: 'xp', value: 50, pillar: 'stem', text: '' }]);
  const addCustomReward = () => setRewards([...rewards, { type: 'custom', value: 0, pillar: '', text: '' }]);
  const removeReward = (i: number) => setRewards(rewards.filter((_, idx) => idx !== i));
  const updateReward = (i: number, updates: Partial<Reward>) => {
    const updated = [...rewards];
    updated[i] = { ...updated[i], ...updates };
    setRewards(updated);
  };

  const totalXP = rewards.filter((r) => r.type === 'xp').reduce((sum, r) => sum + r.value, 0);

  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const effectiveRole = (user?.role === 'superadmin' && previewRole) ? previewRole
    : (user?.org_role && user?.role === 'org_managed' ? user.org_role : user?.role);
  const isObserver = effectiveRole === 'observer';

  const toggleKid = (kidId: string) => {
    setSelectedKids((prev) => {
      if (prev.includes(kidId)) {
        const next = prev.filter((id) => id !== kidId);
        return next.length === 0 ? [] : next; // empty = all kids
      }
      return [...prev, kidId];
    });
  };

  const handleDateChange = (_event: DateTimePickerEvent, picked?: Date) => {
    // On Android, the modal dismisses itself after a selection; reflect that
    // in state so we can re-open it next tap. iOS uses the inline display so
    // we just keep the picker visible.
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) {
      const next = new Date(picked);
      next.setHours(23, 59, 59, 0);
      setDeadline(next);
    }
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required';
    if (!description.trim()) return 'Description is required';
    const validDeliverables = deliverables.filter((d) => d.trim());
    if (validDeliverables.length === 0) return 'At least one deliverable is required';
    for (const r of rewards) {
      if (r.type === 'xp' && r.value < 25) return 'XP reward must be at least 25';
      if (r.type === 'xp' && !r.pillar) return 'XP reward must have a pillar';
      if (r.type === 'custom' && !r.text.trim()) return 'Custom reward needs a description';
    }
    if (totalXP > 200) return 'Total XP cannot exceed 200';
    if (deadline.getTime() < Date.now()) return 'Deadline must be in the future';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setFormError(validationError); return; }

    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        pillar,
        max_participants: parseInt(maxClaims, 10) || 0,
        visibility,
        deliverables: deliverables.filter((d) => d.trim()),
        rewards: rewards.filter((r) => (r.type === 'xp' && r.value >= 25) || (r.type === 'custom' && r.text.trim())),
        allowed_student_ids: visibility === 'family' && selectedKids.length > 0 ? selectedKids : null,
        deadline: deadline.toISOString(),
      };

      if (isEditMode) {
        await updateBounty(editId!, payload);
      } else {
        await createBounty(payload);
      }
      haptic.success();
      router.replace('/(app)/(tabs)/bounties');
    } catch (err: any) {
      haptic.error();
      const msg = err.response?.data?.message || err.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} bounty`;
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loadingEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <VStack className="px-5 pt-4 max-w-2xl w-full md:mx-auto" space="lg">

          {/* Back */}
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>

          <Heading size="xl">{isEditMode ? 'Edit Bounty' : 'Post a Bounty'}</Heading>

          {/* Title */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium">Title</UIText>
            <Input><InputField placeholder="What's the challenge?" value={title} onChangeText={setTitle} /></Input>
          </VStack>

          {/* Description */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium">Description</UIText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the bounty..."
              placeholderTextColor={c.textFaint}
              multiline
              numberOfLines={4}
              className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base font-poppins text-typo dark:text-dark-typo min-h-[100px] border border-surface-200 dark:border-dark-surface-300"
              style={{ textAlignVertical: 'top' }}
            />
          </VStack>

          <Divider />

          {/* Deliverables */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Deliverables</Heading>
              <Pressable onPress={addDeliverable}>
                <HStack className="items-center gap-1">
                  <Ionicons name="add-circle-outline" size={20} color="#6D469B" />
                  <UIText size="sm" className="text-optio-purple font-poppins-medium">Add</UIText>
                </HStack>
              </Pressable>
            </HStack>

            {deliverables.map((d, i) => (
              <HStack key={i} className="items-center gap-2">
                <View className="w-6 h-6 rounded-full bg-optio-purple/10 items-center justify-center">
                  <UIText size="xs" className="text-optio-purple font-poppins-bold">{i + 1}</UIText>
                </View>
                <View className="flex-1">
                  <Input>
                    <InputField
                      placeholder={`Deliverable ${i + 1}`}
                      value={d}
                      onChangeText={(text) => updateDeliverable(i, text)}
                    />
                  </Input>
                </View>
                {deliverables.length > 1 && (
                  <Pressable onPress={() => removeDeliverable(i)}>
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </Pressable>
                )}
              </HStack>
            ))}
          </VStack>

          <Divider />

          {/* Rewards */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Rewards</Heading>
              <HStack className="gap-2">
                <Pressable onPress={addXPReward}>
                  <View className="bg-optio-purple/10 px-3 py-1.5 rounded-full">
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">+ XP</UIText>
                  </View>
                </Pressable>
                <Pressable onPress={addCustomReward}>
                  <View className="bg-amber-50 px-3 py-1.5 rounded-full">
                    <UIText size="xs" className="text-amber-700 font-poppins-medium">+ Custom</UIText>
                  </View>
                </Pressable>
              </HStack>
            </HStack>

            {totalXP > 0 && (
              <UIText size="xs" className={totalXP > 200 ? 'text-red-500 font-poppins-bold' : 'text-typo-400 dark:text-dark-typo-400'}>
                Total XP: {totalXP}/200
              </UIText>
            )}

            {isObserver && totalXP > 0 && (
              <Card variant="outline" size="sm" className="bg-amber-50 border-amber-200">
                <HStack className="items-start gap-2">
                  <Ionicons name="information-circle-outline" size={18} color="#B45309" style={{ marginTop: 2 }} />
                  <UIText size="xs" style={{ color: '#92400E', flex: 1 }}>
                    XP awarded by observers requires Optio approval before counting toward official totals. Your bounty can still be claimed and completed normally; the student's XP will sit in a pending state until reviewed.
                  </UIText>
                </HStack>
              </Card>
            )}

            {rewards.map((r, i) => (
              <Card key={i} variant="outline" size="sm">
                <VStack space="sm">
                  <HStack className="items-center justify-between">
                    <UIText size="sm" className="font-poppins-semibold">
                      {r.type === 'xp' ? 'XP Reward' : 'Custom Reward'}
                    </UIText>
                    <Pressable onPress={() => removeReward(i)}>
                      <Ionicons name="close" size={18} color={c.iconMuted} />
                    </Pressable>
                  </HStack>

                  {r.type === 'xp' ? (
                    <>
                      <HStack className="items-center gap-3">
                        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Amount:</UIText>
                        <Input className="flex-1">
                          <InputField
                            placeholder="50"
                            value={String(r.value)}
                            onChangeText={(t) => updateReward(i, { value: parseInt(t) || 0 })}
                            keyboardType="numeric"
                          />
                        </Input>
                        <UIText size="sm" className="font-poppins-bold text-optio-purple">XP</UIText>
                      </HStack>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Pillar:</UIText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <HStack className="gap-2">
                          {pillarKeys.map((p) => {
                            const pc = getPillar(p);
                            const active = r.pillar === p;
                            return (
                              <Pressable key={p} onPress={() => updateReward(i, { pillar: p })}>
                                <View style={{
                                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                                  backgroundColor: active ? pc.color : c.surfaceMuted,
                                }}>
                                  <UIText size="xs" style={{ color: active ? '#fff' : pc.color, fontFamily: 'Poppins_500Medium' }}>
                                    {p === 'stem' ? 'STEM' : p.charAt(0).toUpperCase() + p.slice(1)}
                                  </UIText>
                                </View>
                              </Pressable>
                            );
                          })}
                        </HStack>
                      </ScrollView>
                    </>
                  ) : (
                    <Input>
                      <InputField
                        placeholder="e.g. Pizza night, $10 gift card"
                        value={r.text}
                        onChangeText={(t) => updateReward(i, { text: t })}
                      />
                    </Input>
                  )}
                </VStack>
              </Card>
            ))}
          </VStack>

          <Divider />

          {/* Bounty Pillar */}
          <VStack space="sm">
            <Heading size="md">Pillar</Heading>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Which pillar does this bounty align with?</UIText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <HStack className="gap-2">
                {pillarKeys.map((p) => {
                  const pc = getPillar(p);
                  const active = pillar === p;
                  return (
                    <Pressable key={p} onPress={() => setPillar(p)}>
                      <View style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: active ? pc.color : c.surfaceMuted,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}>
                        <UIText size="sm" style={{ color: active ? '#fff' : pc.color, fontFamily: 'Poppins_500Medium' }}>
                          {p === 'stem' ? 'STEM' : p.charAt(0).toUpperCase() + p.slice(1)}
                        </UIText>
                      </View>
                    </Pressable>
                  );
                })}
              </HStack>
            </ScrollView>
          </VStack>

          <Divider />

          {/* Visibility */}
          <VStack space="sm">
            <Heading size="md">Who can see this?</Heading>
            <HStack className="gap-3">
              <Pressable onPress={() => setVisibility('public')} className="flex-1">
                <Card variant={visibility === 'public' ? 'elevated' : 'outline'} size="sm">
                  <VStack className="items-center" space="xs">
                    <Ionicons name="globe-outline" size={24} color={visibility === 'public' ? '#6D469B' : c.iconMuted} />
                    <UIText size="sm" className={visibility === 'public' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                      Everyone
                    </UIText>
                  </VStack>
                </Card>
              </Pressable>
              <Pressable onPress={() => setVisibility('family')} className="flex-1">
                <Card variant={visibility === 'family' ? 'elevated' : 'outline'} size="sm">
                  <VStack className="items-center" space="xs">
                    <Ionicons name="people-outline" size={24} color={visibility === 'family' ? '#6D469B' : c.iconMuted} />
                    <UIText size="sm" className={visibility === 'family' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                      {isObserver ? 'My Students' : 'My Kids'}
                    </UIText>
                  </VStack>
                </Card>
              </Pressable>
            </HStack>

            {/* Kid selector for family visibility */}
            {visibility === 'family' && dependents.length > 1 && (
              <VStack space="xs">
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  {selectedKids.length === 0 ? `All ${isObserver ? 'students' : 'kids'} (tap to select specific)` : `${selectedKids.length} selected`}
                </UIText>
                <HStack className="flex-wrap gap-2">
                  {dependents.map((kid) => {
                    const selected = selectedKids.includes(kid.id);
                    return (
                      <Pressable key={kid.id} onPress={() => toggleKid(kid.id)}>
                        <View style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: selected ? '#6D469B' : c.surfaceMuted,
                        }}>
                          <UIText size="sm" style={{ color: selected ? '#fff' : c.textMuted, fontFamily: 'Poppins_500Medium' }}>
                            {kid.display_name || kid.first_name || 'Student'}
                          </UIText>
                        </View>
                      </Pressable>
                    );
                  })}
                </HStack>
              </VStack>
            )}
          </VStack>

          {/* Deadline — native date picker. iOS shows inline; Android opens
           *  a system modal on tap (and dismisses itself after a pick).
           *  Web falls back to a typed-date input. */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium">Deadline</UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
              The date students have to claim and complete this bounty by.
            </UIText>
            {Platform.OS === 'web' ? (
              <TextInput
                // @ts-expect-error — RN web supports type="date" via the underlying <input>.
                type="date"
                value={`${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`}
                onChangeText={(v) => {
                  const [y, m, d] = v.split('-').map((n) => parseInt(n, 10));
                  if (!y || !m || !d) return;
                  const next = new Date(y, m - 1, d, 23, 59, 59);
                  setDeadline(next);
                }}
                accessibilityLabel="Bounty deadline"
                className="border border-surface-300 dark:border-dark-surface-300 rounded-xl p-3 text-base bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo"
                style={{ fontFamily: 'Poppins_400Regular' }}
              />
            ) : Platform.OS === 'android' ? (
              <>
                <Pressable
                  testID="bounty-deadline-android-trigger"
                  onPress={() => setShowDatePicker(true)}
                  accessibilityLabel="Pick deadline date"
                  className="border border-surface-300 dark:border-dark-surface-300 rounded-xl px-4 py-3 bg-white dark:bg-dark-surface-100 flex-row items-center justify-between"
                >
                  <UIText size="md" className="font-poppins-medium text-typo dark:text-dark-typo">
                    {deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </UIText>
                  <Ionicons name="calendar-outline" size={20} color="#6D469B" />
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    testID="bounty-deadline-picker"
                    value={deadline}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={handleDateChange}
                  />
                )}
              </>
            ) : (
              // iOS — inline picker is nicer than tap-to-open since the form is short.
              <View className="border border-surface-300 dark:border-dark-surface-300 rounded-xl bg-white dark:bg-dark-surface-100 px-2 py-1">
                <DateTimePicker
                  testID="bounty-deadline-picker"
                  value={deadline}
                  mode="date"
                  display="inline"
                  minimumDate={new Date()}
                  onChange={handleDateChange}
                />
              </View>
            )}
          </VStack>

          {/* Max Claims */}
          <VStack space="xs">
            <UIText size="sm" className="font-poppins-medium">Max Claims</UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">0 = unlimited. Set a number to limit how many students can claim this bounty.</UIText>
            <TextInput
              className="border border-surface-300 dark:border-dark-surface-300 rounded-xl px-4 py-3 text-sm bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo"
              placeholder="0"
              value={maxClaims}
              onChangeText={setMaxClaims}
              keyboardType="numeric"
              style={{ fontFamily: 'Poppins_400Regular' }}
            />
          </VStack>

          {/* Error */}
          {formError && (
            <View className="bg-red-50 p-3 rounded-lg">
              <UIText size="sm" className="text-red-600">{formError}</UIText>
            </View>
          )}

          {/* Submit */}
          <Button size="lg" onPress={handleSubmit} loading={saving} disabled={saving} className="w-full">
            <ButtonText>{isEditMode ? 'Save Changes' : 'Post Bounty'}</ButtonText>
          </Button>

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
