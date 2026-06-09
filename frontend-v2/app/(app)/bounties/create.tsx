/**
 * Create / Edit Bounty - a 3-step wizard for parents / observers / advisors.
 *
 *   Step 1 — The challenge: title, description, deliverables
 *   Step 2 — The reward:    one pillar + XP amount + optional custom rewards
 *   Step 3 — Who & when:    visibility (+ kid picker), deadline, claim limit
 *
 * Pillar model: a bounty has ONE pillar. Its XP credits to that pillar — there
 * is no separate per-reward pillar (that duplicate picker was the #1 source of
 * confusion). Custom (non-XP) rewards are still supported.
 *
 * Edit mode: pass ?edit=bountyId to pre-fill from an existing bounty.
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
  Input, InputField,
} from '@/src/components/ui';

const MAX_XP = 200;
const MIN_XP = 25;
const STEP_TITLES = ['The challenge', 'The reward', 'Who & when'];
const STEP_ICONS: (keyof typeof Ionicons.glyphMap)[] = ['clipboard-outline', 'gift-outline', 'people-outline'];

function pillarLabel(p: string): string {
  return p === 'stem' ? 'STEM' : p.charAt(0).toUpperCase() + p.slice(1);
}

export default function CreateBountyPage() {
  const { edit: editId } = useLocalSearchParams<{ edit?: string }>();
  const isEditMode = !!editId;
  const c = useThemeColors();

  const [step, setStep] = useState(0);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverables, setDeliverables] = useState(['']);
  // Unified pillar + a single XP amount that credits to it (0 = no XP reward).
  const [pillar, setPillar] = useState('stem');
  const [xpValue, setXpValue] = useState(50);
  const [customRewards, setCustomRewards] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'family'>('family');
  const [limitClaims, setLimitClaims] = useState(false);
  const [maxClaims, setMaxClaims] = useState('10');
  // Native date picker holds the deadline as a Date. Default: 30 days out at
  // end-of-day so a "March 20" deadline doesn't time out at midnight.
  const [deadline, setDeadline] = useState<Date>(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    d.setHours(23, 59, 59, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedKids, setSelectedKids] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);

  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const effectiveRole = (user?.role === 'superadmin' && previewRole) ? previewRole
    : (user?.org_role && user?.role === 'org_managed' ? user.org_role : user?.role);
  const isObserver = effectiveRole === 'observer';
  const childNoun = isObserver ? 'student' : 'kid';

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
        const rewards = bounty.rewards || [];
        const xpReward = rewards.find((r: any) => r.type === 'xp');
        setXpValue(xpReward?.value || 0);
        setPillar(bounty.pillar || xpReward?.pillar || 'stem');
        setCustomRewards(rewards.filter((r: any) => r.type === 'custom').map((r: any) => r.text).filter(Boolean));
        setVisibility(bounty.visibility === 'family' ? 'family' : 'public');
        if (bounty.max_participants && bounty.max_participants > 0) {
          setLimitClaims(true);
          setMaxClaims(String(bounty.max_participants));
        }
        if (bounty.deadline) setDeadline(new Date(bounty.deadline));
        setSelectedKids(bounty.allowed_student_ids || []);
      } catch {
        Alert.alert('Error', 'Failed to load bounty');
        router.back();
      } finally {
        setLoadingEdit(false);
      }
    })();
  }, [editId]);

  // Fetch dependents / linked students for the family-visibility kid selector
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

  const addCustomReward = () => setCustomRewards([...customRewards, '']);
  const removeCustomReward = (i: number) => setCustomRewards(customRewards.filter((_, idx) => idx !== i));
  const updateCustomReward = (i: number, text: string) => {
    const updated = [...customRewards];
    updated[i] = text;
    setCustomRewards(updated);
  };

  const toggleKid = (kidId: string) => {
    setSelectedKids((prev) => (prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId]));
  };

  const handleDateChange = (_event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (picked) {
      const next = new Date(picked);
      next.setHours(23, 59, 59, 0);
      setDeadline(next);
    }
  };

  // Per-step validation so errors surface where they're fixable.
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!title.trim()) return 'Give your bounty a title';
      if (!description.trim()) return 'Add a short description';
      if (deliverables.filter((d) => d.trim()).length === 0) return 'Add at least one deliverable';
    }
    if (s === 1) {
      if (xpValue > 0 && xpValue < MIN_XP) return `XP must be at least ${MIN_XP}`;
      if (xpValue > MAX_XP) return `XP can't exceed ${MAX_XP}`;
      const hasCustom = customRewards.some((t) => t.trim());
      if (xpValue < MIN_XP && !hasCustom) return 'Add a reward — XP or a custom reward';
    }
    if (s === 2) {
      if (deadline.getTime() < Date.now()) return 'Deadline must be in the future';
      if (limitClaims && (parseInt(maxClaims, 10) || 0) < 1) return 'Set how many can take it on (or turn off the limit)';
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { setFormError(err); haptic.error(); return; }
    setFormError(null);
    setStep(step + 1);
  };

  const handleBack = () => {
    setFormError(null);
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    // Re-validate every step before posting.
    for (let s = 0; s <= 2; s++) {
      const err = validateStep(s);
      if (err) { setFormError(err); setStep(s); haptic.error(); return; }
    }

    setFormError(null);
    setSaving(true);
    try {
      const rewards: any[] = [];
      if (xpValue >= MIN_XP) rewards.push({ type: 'xp', value: xpValue, pillar, text: '' });
      for (const t of customRewards) {
        if (t.trim()) rewards.push({ type: 'custom', value: 0, pillar: '', text: t.trim() });
      }
      const payload = {
        title: title.trim(),
        description: description.trim(),
        pillar,
        max_participants: limitClaims ? (parseInt(maxClaims, 10) || 0) : 0,
        visibility,
        deliverables: deliverables.filter((d) => d.trim()),
        rewards,
        allowed_student_ids: visibility === 'family' && selectedKids.length > 0 ? selectedKids : null,
        deadline: deadline.toISOString(),
      };

      if (isEditMode) await updateBounty(editId!, payload);
      else await createBounty(payload);
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

  const activePillar = getPillar(pillar);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="px-5 pt-3 pb-2">
        <Pressable onPress={() => router.back()} className="flex-row items-center gap-2 mb-2" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#6D469B" />
          <UIText size="sm" className="text-optio-purple font-poppins-medium">Cancel</UIText>
        </Pressable>
        <Heading size="xl">{isEditMode ? 'Edit bounty' : 'Post a bounty'}</Heading>
        <HStack className="items-center gap-1.5 mt-0.5">
          <Ionicons name={STEP_ICONS[step]} size={15} color="#6D469B" />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
            Step {step + 1} of 3 · {STEP_TITLES[step]}
          </UIText>
        </HStack>
      </View>

      {/* Body */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <VStack className="max-w-2xl w-full md:mx-auto" space="lg">

          {/* ── Step 1: The challenge ───────────────────────────────── */}
          {step === 0 && (
            <>
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Title</UIText>
                <Input><InputField placeholder="What's the challenge?" value={title} onChangeText={setTitle} /></Input>
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Description</UIText>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What should they do, and why is it worth doing?"
                  placeholderTextColor={c.textFaint}
                  multiline
                  className="bg-white dark:bg-dark-surface-100 rounded-xl p-4 text-base font-poppins text-typo dark:text-dark-typo min-h-[110px] border border-surface-200 dark:border-dark-surface-300"
                  style={{ textAlignVertical: 'top' }}
                />
              </VStack>

              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <VStack>
                    <UIText size="sm" className="font-poppins-medium">Deliverables</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">The concrete steps they check off.</UIText>
                  </VStack>
                  <Pressable onPress={addDeliverable} hitSlop={8}>
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
                        <InputField placeholder={`Deliverable ${i + 1}`} value={d} onChangeText={(t) => updateDeliverable(i, t)} />
                      </Input>
                    </View>
                    {deliverables.length > 1 && (
                      <Pressable onPress={() => removeDeliverable(i)} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color="#EF4444" />
                      </Pressable>
                    )}
                  </HStack>
                ))}
              </VStack>
            </>
          )}

          {/* ── Step 2: The reward ──────────────────────────────────── */}
          {step === 1 && (
            <>
              <VStack space="sm">
                <VStack>
                  <UIText size="sm" className="font-poppins-medium">Skill</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    The pillar this bounty builds. XP is awarded here.
                  </UIText>
                </VStack>
                <View className="flex-row flex-wrap gap-2">
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
                          <Ionicons name={active ? pc.iconFilled : pc.icon} size={15} color={active ? '#fff' : pc.color} />
                          <UIText size="sm" style={{ color: active ? '#fff' : pc.color, fontFamily: 'Poppins_500Medium' }}>
                            {pc.label}
                          </UIText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">XP reward</UIText>
                <HStack className="items-center gap-3">
                  {/* Fixed-width box (XP is <= 200, i.e. 3 digits) so the field
                      doesn't resize as the pillar label length changes. */}
                  <View style={{ width: 88 }}>
                    <Input>
                      <InputField
                        placeholder="50"
                        value={xpValue ? String(xpValue) : ''}
                        onChangeText={(t) => setXpValue(parseInt(t, 10) || 0)}
                        keyboardType="numeric"
                      />
                    </Input>
                  </View>
                  <HStack className="items-center gap-1.5 flex-1">
                    <Ionicons name={activePillar.iconFilled} size={16} color={activePillar.color} />
                    <UIText size="sm" className="font-poppins-bold" numberOfLines={1} style={{ color: activePillar.color }}>
                      XP in {pillarLabel(pillar)}
                    </UIText>
                  </HStack>
                </HStack>
                <UIText size="xs" className={xpValue > MAX_XP ? 'text-red-500 font-poppins-bold' : 'text-typo-400 dark:text-dark-typo-400'}>
                  {xpValue > MAX_XP
                    ? `Max ${MAX_XP} XP per bounty`
                    : `Between ${MIN_XP} and ${MAX_XP} XP. Leave blank for a custom-reward-only bounty.`}
                </UIText>
              </VStack>

              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <VStack>
                    <UIText size="sm" className="font-poppins-medium">Custom rewards</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Optional, e.g. "Pizza night" or "$10 gift card".</UIText>
                  </VStack>
                  <Pressable onPress={addCustomReward} hitSlop={8}>
                    <HStack className="items-center gap-1">
                      <Ionicons name="add-circle-outline" size={20} color="#6D469B" />
                      <UIText size="sm" className="text-optio-purple font-poppins-medium">Add</UIText>
                    </HStack>
                  </Pressable>
                </HStack>
                {customRewards.map((t, i) => (
                  <HStack key={i} className="items-center gap-2">
                    <View className="flex-1">
                      <Input>
                        <InputField placeholder="Describe the reward" value={t} onChangeText={(v) => updateCustomReward(i, v)} />
                      </Input>
                    </View>
                    <Pressable onPress={() => removeCustomReward(i)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </Pressable>
                  </HStack>
                ))}
              </VStack>
            </>
          )}

          {/* ── Step 3: Who & when ──────────────────────────────────── */}
          {step === 2 && (
            <>
              <VStack space="sm">
                <UIText size="sm" className="font-poppins-medium">Who can see this?</UIText>
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
                          {isObserver ? 'My students' : 'My kids'}
                        </UIText>
                      </VStack>
                    </Card>
                  </Pressable>
                </HStack>

                {visibility === 'family' && dependents.length > 1 && (
                  <VStack space="xs">
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                      {selectedKids.length === 0 ? `All ${isObserver ? 'students' : 'kids'} — tap to limit to specific ones` : `${selectedKids.length} selected`}
                    </UIText>
                    <View className="flex-row flex-wrap gap-2">
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
                    </View>
                  </VStack>
                )}
              </VStack>

              {/* Deadline */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Deadline</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  The date they have to take it on and finish by.
                </UIText>
                {Platform.OS === 'web' ? (
                  <TextInput
                    // @ts-expect-error — RN web supports type="date" via the underlying <input>.
                    type="date"
                    value={`${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`}
                    onChangeText={(v) => {
                      const [y, m, d] = v.split('-').map((n) => parseInt(n, 10));
                      if (!y || !m || !d) return;
                      setDeadline(new Date(y, m - 1, d, 23, 59, 59));
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

              {/* Claim limit — a toggle instead of "0 = unlimited" jargon. */}
              <VStack space="sm">
                <Pressable onPress={() => setLimitClaims((v) => !v)}>
                  <HStack className="items-center justify-between">
                    <VStack className="flex-1 pr-3">
                      <UIText size="sm" className="font-poppins-medium">Limit how many can take it on</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Off = unlimited.</UIText>
                    </VStack>
                    <View style={{
                      width: 48, height: 28, borderRadius: 14, padding: 2,
                      backgroundColor: limitClaims ? '#6D469B' : c.surfaceMuted,
                      alignItems: limitClaims ? 'flex-end' : 'flex-start',
                    }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
                    </View>
                  </HStack>
                </Pressable>
                {limitClaims && (
                  <HStack className="items-center gap-3">
                    <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Up to</UIText>
                    <View className="flex-1">
                      <Input>
                        <InputField placeholder="10" value={maxClaims} onChangeText={setMaxClaims} keyboardType="numeric" />
                      </Input>
                    </View>
                    <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{isObserver ? 'students' : 'kids'}</UIText>
                  </HStack>
                )}
              </VStack>
            </>
          )}

          {formError && (
            <View className="bg-red-50 dark:bg-red-950 p-3 rounded-lg">
              <UIText size="sm" className="text-red-600 dark:text-red-300">{formError}</UIText>
            </View>
          )}
        </VStack>
      </ScrollView>

      {/* Sticky footer: progress dots + actions */}
      <View
        className="px-5 pt-3 border-t border-surface-200 dark:border-dark-surface-300"
        style={{ paddingBottom: 24 }}
      >
        <HStack className="items-center justify-center gap-1.5 mb-3">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === step ? '#6D469B' : c.border,
              }}
            />
          ))}
        </HStack>
        <HStack className="gap-3">
          {step > 0 && (
            <Button size="lg" variant="outline" onPress={handleBack} disabled={saving} className="flex-1">
              <ButtonText>Back</ButtonText>
            </Button>
          )}
          {step < 2 ? (
            <Button size="lg" onPress={handleNext} className="flex-1">
              <ButtonText>Next</ButtonText>
            </Button>
          ) : (
            <Button size="lg" onPress={handleSubmit} loading={saving} disabled={saving} className="flex-1">
              <ButtonText>{isEditMode ? 'Save changes' : 'Post bounty'}</ButtonText>
            </Button>
          )}
        </HStack>
      </View>
    </SafeAreaView>
  );
}
