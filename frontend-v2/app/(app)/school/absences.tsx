/**
 * Absence reporting — a guardian tells the school ahead of time that one or
 * more children will be out, for a whole day or one scheduled class. The child
 * chips multi-select so "all three are out Friday" is one report, not three.
 * Distinct from the teacher's attendance roster; the office is notified when
 * one is added. Backed by /api/sis/parent/absences (authorized by family
 * relationship).
 *
 * Date selection is a horizontal strip of the next 28 days on every platform —
 * no native date-picker modal, so the web preview and the native app behave
 * identically, and "out sick tomorrow" is two taps.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button, ButtonText, Card, HStack, Heading, Input, InputField, UIText, VStack, toast,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { confirmAlert } from '@/src/utils/alerts';
import { useSchoolAbsences } from '@/src/hooks/useSchool';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** The next 28 days, starting today, as selectable chips. */
const upcomingDays = () => {
  const days: { iso: string; label: string; sub: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 28; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    days.push({
      iso: isoDate(d),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[d.getDay()],
      sub: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return days;
};

function Chip({ selected, onPress, children, testID }: {
  selected: boolean; onPress: () => void; children: React.ReactNode; testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      className={`px-3.5 py-2 rounded-full border ${
        selected
          ? 'bg-optio-purple border-optio-purple'
          : 'bg-white dark:bg-dark-surface-100 border-surface-200 dark:border-dark-surface-300'
      }`}
    >
      {children}
    </Pressable>
  );
}

const chipText = (selected: boolean) =>
  selected ? 'text-white font-poppins-medium' : 'text-typo-500 dark:text-dark-typo-500';

export default function AbsencesScreen() {
  const c = useThemeColors();
  const {
    orgs, orgId, setOrgId, students, studentIds, toggleStudent,
    absences, classes, orgName, loading, report, cancel,
  } = useSchoolAbsences();

  const days = useMemo(upcomingDays, []);
  const [date, setDate] = useState(days[0].iso);
  const [classId, setClassId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((cl) => [cl.class_id, cl.name])),
    [classes],
  );

  const studentName = (sid: string) => students.find((s) => s.student_id === sid)?.name || 'A student';

  // Deselect a class that stopped being shared by everyone selected.
  useEffect(() => {
    if (classId && !classes.some((cl) => cl.class_id === classId)) setClassId(null);
  }, [classes, classId]);

  const submit = async () => {
    if (!studentIds.length || busy) return;
    setBusy(true);
    try {
      const result = await report({ absence_date: date, class_id: classId, reason: reason.trim() || null });
      const created = result?.absences || [];
      const errors: Record<string, string> = result?.errors || {};
      if (created.length) {
        const who = created.length === 1
          ? studentName(created[0].student_user_id)
          : `${created.length} children`;
        toast.success(`Absence reported for ${who} — ${orgName || 'the office'} has been notified`);
      }
      Object.entries(errors).forEach(([sid, msg]) => {
        toast.error(`${studentName(sid)}: ${msg}`);
      });
      setDate(days[0].iso);
      setClassId(null);
      setReason('');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not report absence');
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async (id: string) => {
    const ok = await confirmAlert({
      title: 'Cancel this absence?',
      message: 'The office will see it as withdrawn.',
      confirmText: 'Cancel absence',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    try {
      await cancel(id);
      toast.success('Absence cancelled');
    } catch {
      toast.error('Could not cancel absence');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="absences-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }}>Report an absence</Heading>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : !students.length ? (
        <VStack className="items-center px-8 pt-20 gap-3">
          <Ionicons name="calendar-outline" size={44} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
            Absence reporting isn't available for your family yet. If your
            family's organization uses Optio for attendance, ask them to add
            your family.
          </UIText>
        </VStack>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-2 pb-12 max-w-3xl w-full md:mx-auto"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mb-4">
            Let {orgName || 'the office'} know ahead of time when your children will be out.
          </UIText>

          {/* Org picker — only for the rare family enrolled in two orgs. The
              chips are the org names themselves, so the label stays generic. */}
          {orgs.length > 1 && (
            <View className="mb-4">
              <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">Organization</UIText>
              <HStack space="sm" className="flex-wrap">
                {orgs.map((o: any) => (
                  <Chip key={o.organization_id} selected={o.organization_id === orgId} onPress={() => setOrgId(o.organization_id)}>
                    <UIText size="xs" className={chipText(o.organization_id === orgId)}>
                      {o.organization_name || 'School'}
                    </UIText>
                  </Chip>
                ))}
              </HStack>
            </View>
          )}

          {/* Children — multi-select so one report covers every sibling who's out */}
          <View className="mb-4">
            <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">
              {students.length > 1 ? 'Children — select everyone who will be out' : 'Child'}
            </UIText>
            <HStack space="sm" className="flex-wrap">
              {students.map((s) => (
                <Chip
                  key={s.student_id}
                  selected={studentIds.includes(s.student_id)}
                  onPress={() => toggleStudent(s.student_id)}
                  testID={`absence-student-${s.student_id}`}
                >
                  <UIText size="xs" className={chipText(studentIds.includes(s.student_id))}>{s.name}</UIText>
                </Chip>
              ))}
            </HStack>
          </View>

          {/* Date strip */}
          <View className="mb-4">
            <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">Date</UIText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <HStack space="sm">
                {days.map((d) => (
                  <Chip key={d.iso} selected={d.iso === date} onPress={() => setDate(d.iso)} testID={`absence-date-${d.iso}`}>
                    <VStack className="items-center">
                      <UIText size="xs" className={chipText(d.iso === date)}>{d.label}</UIText>
                      <UIText size="xs" className={d.iso === date ? 'text-white/80' : 'text-typo-300 dark:text-dark-typo-300'}>
                        {d.sub}
                      </UIText>
                    </VStack>
                  </Chip>
                ))}
              </HStack>
            </ScrollView>
          </View>

          {/* Whole day vs one class */}
          <View className="mb-4">
            <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">What are they missing?</UIText>
            <HStack space="sm" className="flex-wrap">
              <Chip selected={classId === null} onPress={() => setClassId(null)} testID="absence-whole-day">
                <UIText size="xs" className={chipText(classId === null)}>The whole day</UIText>
              </Chip>
              {classes.map((cl) => (
                <Chip
                  key={cl.class_id}
                  selected={classId === cl.class_id}
                  onPress={() => setClassId(cl.class_id)}
                  testID={`absence-class-${cl.class_id}`}
                >
                  <UIText size="xs" className={chipText(classId === cl.class_id)}>{cl.name}</UIText>
                </Chip>
              ))}
            </HStack>
            {studentIds.length > 1 && !classes.length ? (
              <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 mt-2">
                Only whole-day absences can be reported for multiple children unless they share a class.
              </UIText>
            ) : null}
          </View>

          {/* Reason */}
          <View className="mb-5">
            <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">Reason (optional)</UIText>
            <Input>
              <InputField
                placeholder="e.g. doctor appointment"
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                testID="absence-reason"
              />
            </Input>
          </View>

          <Button onPress={submit} disabled={busy || !studentIds.length} testID="absence-submit">
            <ButtonText>{busy ? 'Reporting…' : 'Report absence'}</ButtonText>
          </Button>

          {/* Upcoming */}
          <Heading size="sm" className="mt-8 mb-3">Upcoming reported absences</Heading>
          {!absences.length ? (
            <UIText size="sm" className="text-typo-300 dark:text-dark-typo-300">None reported.</UIText>
          ) : (
            <VStack space="sm">
              {absences.map((a) => (
                <Card key={a.id} size="sm" className="bg-white dark:bg-dark-surface-100">
                  <HStack className="items-center justify-between gap-3">
                    <View className="flex-1">
                      <UIText size="sm" className="font-poppins-medium">
                        {a.absence_date}
                        {students.length > 1 && a.student_name ? (
                          <UIText size="sm" className="font-poppins-regular">{'  ·  '}{a.student_name}</UIText>
                        ) : null}
                        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 font-poppins-regular">
                          {'  ·  '}{a.class_id ? (a.class_name || classNameById[a.class_id] || 'A class') : 'Whole day'}
                        </UIText>
                      </UIText>
                      {a.reason ? (
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">{a.reason}</UIText>
                      ) : null}
                    </View>
                    <Pressable onPress={() => confirmCancel(a.id)} hitSlop={8} testID={`absence-cancel-${a.id}`}>
                      <UIText size="xs" className="text-error-600 font-poppins-medium">Cancel</UIText>
                    </Pressable>
                  </HStack>
                </Card>
              ))}
            </VStack>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
