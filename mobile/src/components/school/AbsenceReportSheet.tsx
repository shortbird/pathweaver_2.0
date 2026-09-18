/**
 * Report an absence: the form, as a sheet the Schedule tab opens.
 *
 * A guardian tells the school ahead of time that one or more children will
 * be out, for a whole day or one scheduled class. Distinct from the teacher's
 * attendance roster; the office is notified when one is added. Backed by
 * /api/sis/parent/absences (authorized by family relationship).
 *
 * This was its own screen behind an "Absence" chip until 2026-09-18, with its
 * own child picker. It now opens from the child's schedule, so the child is
 * already chosen; the sibling chips stay so "all three are out Friday" is
 * still one report, not three.
 *
 * Dates come from a real date picker (native picker on iOS/Android, the
 * browser's <input type="date"> on web — same platform split as
 * bounties/create), with an optional last day for multi-day absences. A range
 * is stored one row per day but displayed and cancelled as one line.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Pressable, Platform, ScrollView, TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Button, ButtonText, HStack, Heading, Input, InputField, UIText, toast,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { useSchoolAbsences } from '@/src/hooks/useSchool';

export type AbsencesApi = ReturnType<typeof useSchoolAbsences>;

export const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** One date field, platform-split like the bounty deadline picker: web gets the
 * browser's own date input, Android a tap-to-open modal, iOS the compact
 * inline control (two stacked full calendars would eat the screen). */
function DateField({ label, value, minimumDate, onChange, testID }: {
  label: string; value: Date; minimumDate?: Date; onChange: (d: Date) => void; testID: string;
}) {
  const c = useThemeColors();
  const [show, setShow] = useState(false);
  const handleChange = (_event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (picked) onChange(picked);
  };
  if (Platform.OS === 'web') {
    return (
      <TextInput
        // @ts-expect-error — RN web supports type="date" via the underlying <input>.
        type="date"
        value={isoDate(value)}
        onChangeText={(v: string) => {
          const [y, m, d] = v.split('-').map((n) => parseInt(n, 10));
          if (!y || !m || !d) return;
          onChange(new Date(y, m - 1, d));
        }}
        accessibilityLabel={label}
        testID={testID}
        className="border border-surface-300 dark:border-dark-surface-300 rounded-xl p-3 text-base bg-white dark:bg-dark-surface-100 text-typo dark:text-dark-typo self-start"
        style={{ fontFamily: 'Poppins_400Regular' }}
      />
    );
  }
  if (Platform.OS === 'android') {
    return (
      <>
        <Pressable
          onPress={() => setShow(true)}
          testID={`${testID}-trigger`}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="border border-surface-300 dark:border-dark-surface-300 rounded-xl px-4 py-3 bg-white dark:bg-dark-surface-100 flex-row items-center justify-between self-start gap-3"
        >
          <UIText size="sm" className="font-poppins-medium text-typo dark:text-dark-typo">
            {value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </UIText>
          <Ionicons name="calendar-outline" size={18} color={c.brand} />
        </Pressable>
        {show && (
          <DateTimePicker
            testID={testID}
            value={value}
            mode="date"
            display="default"
            minimumDate={minimumDate}
            onChange={handleChange}
          />
        )}
      </>
    );
  }
  return (
    <View className="self-start">
      <DateTimePicker
        testID={testID}
        value={value}
        mode="date"
        display="compact"
        minimumDate={minimumDate}
        onChange={handleChange}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Chip({ selected, onPress, children, testID }: {
  selected: boolean; onPress: () => void; children: React.ReactNode; testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
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

export function AbsenceReportSheet({ absences: a, visible, onClose }: {
  absences: AbsencesApi;
  visible: boolean;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const { students, studentIds, toggleStudent, classes, orgName, report } = a;

  const [startDate, setStartDate] = useState<Date>(new Date());
  // null = a single-day absence; set = the inclusive last day of a range.
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const studentName = (sid: string) => students.find((s) => s.student_id === sid)?.name || 'A student';

  // Deselect a class that stopped being shared by everyone selected.
  useEffect(() => {
    if (classId && !classes.some((cl) => cl.class_id === classId)) setClassId(null);
  }, [classes, classId]);

  const submit = async () => {
    if (!studentIds.length || busy) return;
    setBusy(true);
    try {
      const result = await report({
        absence_date: isoDate(startDate),
        end_date: endDate ? isoDate(endDate) : null,
        class_id: classId,
        reason: reason.trim() || null,
      });
      const created = result?.absences || [];
      const errors: Record<string, string> = result?.errors || {};
      // A range writes one row per day, so count children, not rows.
      const reportedFor = [...new Set(created.map((x: any) => x.student_user_id))] as string[];
      if (reportedFor.length) {
        const who = reportedFor.length === 1
          ? studentName(reportedFor[0])
          : `${reportedFor.length} children`;
        toast.success(`Absence reported for ${who} — ${orgName || 'the office'} has been notified`);
      }
      Object.entries(errors).forEach(([sid, msg]) => {
        toast.error(`${studentName(sid)}: ${msg}`);
      });
      setStartDate(new Date());
      setEndDate(null);
      setClassId(null);
      setReason('');
      if (reportedFor.length) onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not report absence');
    } finally {
      setBusy(false);
    }
  };

  const primary = studentIds[0] ? studentName(studentIds[0]) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top', 'bottom']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <HStack className="items-center px-4 py-3 gap-2">
            <Heading size="lg" className="flex-1">Report an absence</Heading>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"
              hitSlop={8} testID="absence-close">
              <Ionicons name="close" size={24} color={c.icon} />
            </Pressable>
          </HStack>

          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pt-1 pb-12"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mb-4">
              Let {orgName || 'the office'} know ahead of time
              {primary ? ` that ${primary} will be out.` : ' when your children will be out.'}
            </UIText>

            {/* Siblings — one report covers every child who is out. The child
                whose schedule this opened from is already selected. */}
            {students.length > 1 && (
              <View className="mb-4">
                <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">
                  Who will be out?
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
            )}

            {/* Dates: first day, plus an optional last day for a range */}
            <View className="mb-4">
              <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">
                {endDate ? 'First day' : 'Date'}
              </UIText>
              <DateField
                label="First day of absence"
                value={startDate}
                minimumDate={new Date()}
                onChange={(d) => {
                  setStartDate(d);
                  // Keep the range valid if the first day moves past the last.
                  if (endDate && endDate < d) setEndDate(d);
                }}
                testID="absence-start-date"
              />
              {endDate ? (
                <View className="mt-3">
                  <UIText size="xs" className="font-poppins-medium text-typo-400 dark:text-dark-typo-400 mb-2">Last day</UIText>
                  <HStack space="sm" className="items-center">
                    <DateField
                      label="Last day of absence"
                      value={endDate}
                      minimumDate={startDate}
                      onChange={setEndDate}
                      testID="absence-end-date"
                    />
                    <Pressable
                      onPress={() => setEndDate(null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove last day"
                      testID="absence-clear-end-date"
                    >
                      <Ionicons name="close-circle" size={22} color={c.iconMuted} />
                    </Pressable>
                  </HStack>
                </View>
              ) : (
                <Pressable
                  onPress={() => setEndDate(startDate)}
                  className="mt-2 self-start"
                  accessibilityRole="button"
                  testID="absence-add-end-date"
                >
                  <UIText size="xs" className="text-optio-purple font-poppins-medium">
                    + Out more than one day? Add a last day
                  </UIText>
                </Pressable>
              )}
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default AbsenceReportSheet;
