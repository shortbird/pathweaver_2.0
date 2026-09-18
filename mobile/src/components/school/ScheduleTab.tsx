/**
 * The Schedule tab: pick a child, see their week, and say when they will be
 * out.
 *
 * Schedule and Absence were two chips on the hub until 2026-09-18 (and the
 * schedules themselves sat, collapsed, at the bottom of the feed). They are
 * about the same thing — one child's time at the school — and "she won't be
 * there Tuesday" is a thought a parent has while looking at Tuesday, so the
 * absence report opens from the week it is about, with the child already
 * chosen, and the absences already reported sit under that week.
 *
 * One child at a time, chosen up top. A family with three children opening a
 * page that lists all three at once gets thirty-odd rows and a scroll; a
 * picker shows the child they came for and nothing else. The week itself is
 * StudentDays, shared with the child's profile page, so the two places a
 * schedule appears cannot drift. Reading only: changing classes is the web
 * schedule builder's job and is not linked from here.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, Heading, UIText, VStack, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { confirmAlert } from '@/src/utils/alerts';
import { useSchoolAbsences, groupAbsenceRuns } from '@/src/hooks/useSchool';
import { useClassSchedule, type StudentSchedule } from '@/src/hooks/useClassSchedule';
import { StudentDays, PrintScheduleButton } from './ClassSchedule';
import { AbsenceReportSheet } from './AbsenceReportSheet';

function ChildChip({ schedule, selected, onPress }: {
  schedule: StudentSchedule; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={schedule.student_name}
      testID={`schedule-child-${schedule.student_id}`}
      className={`px-4 py-2 rounded-full border ${
        selected
          ? 'bg-optio-purple border-optio-purple'
          : 'bg-white dark:bg-dark-surface-100 border-surface-200 dark:border-dark-surface-300'
      }`}
    >
      <UIText
        size="sm"
        className={selected ? 'text-white font-poppins-semibold' : 'font-poppins-medium'}
      >
        {schedule.student_name}
      </UIText>
    </Pressable>
  );
}

export function ScheduleTab({ organizationId, initialStudentId }: {
  organizationId?: string | null;
  /** A child's profile page can deep-link straight to that child. */
  initialStudentId?: string | null;
}) {
  const c = useThemeColors();
  const { schedules, loading, refresh } = useClassSchedule(organizationId);
  const absences = useSchoolAbsences(organizationId);
  const [pickedId, setPickedId] = useState<string | null>(initialStudentId || null);
  const [reporting, setReporting] = useState(false);

  // The child on screen: the one tapped (or deep-linked to) if they are in the
  // list, else the first. Derived, not stored, so the list loading or a child
  // leaving it can never strand the page on nobody.
  const selectedId = pickedId && schedules.some((s) => s.student_id === pickedId)
    ? pickedId
    : schedules[0]?.student_id ?? null;
  const selected = schedules.find((s) => s.student_id === selectedId) || null;
  const isOwn = selected?.student_name === 'My schedule';
  // A student sees only their own week: no picker over a single name.
  const showPicker = schedules.length > 1;

  // The absence report starts from the child on screen. Siblings can still
  // be added inside the sheet.
  const canReport = !!selectedId && !isOwn
    && absences.students.some((s) => s.student_id === selectedId);
  const { selectStudents } = absences;
  useEffect(() => {
    if (canReport && selectedId && !reporting) selectStudents([selectedId]);
  }, [canReport, selectedId, reporting, selectStudents]);

  // This child's reported absences, folded into ranges, soonest first.
  const upcoming = useMemo(() => (
    selectedId ? groupAbsenceRuns(absences.byStudent[selectedId]?.absences || []) : []
  ), [absences.byStudent, selectedId]);

  const cancelRun = async (ids: string[]) => {
    const ok = await confirmAlert({
      title: ids.length > 1 ? 'Cancel these absences?' : 'Cancel this absence?',
      message: 'The office will see it as withdrawn.',
      confirmText: ids.length > 1 ? 'Cancel absences' : 'Cancel absence',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    try {
      await absences.cancel(ids);
      toast.success('Absence cancelled');
    } catch {
      toast.error('Could not cancel absence');
    }
  };

  return (
    <View className="flex-1" testID="school-tab-schedule">
      {showPicker && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // flex-grow-0: a horizontal ScrollView in a column otherwise takes
          // its share of the height and the chips stretch to fill it.
          className="flex-grow-0"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8, alignItems: 'center' }}
          testID="schedule-children"
        >
          {schedules.map((s) => (
            <ChildChip
              key={s.student_id}
              schedule={s}
              selected={s.student_id === selectedId}
              onPress={() => setPickedId(s.student_id)}
            />
          ))}
        </ScrollView>
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={c.brand} />}
      >
        {loading && (
          <View className="py-12 items-center">
            <ActivityIndicator color={c.brand} />
          </View>
        )}

        {!loading && !schedules.length && (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-8 text-center"
            testID="schedule-empty">
            No students to show a schedule for.
          </UIText>
        )}

        {!loading && selected && selected.classes.length === 0 && (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-8 text-center"
            testID="schedule-no-classes">
            {isOwn
              ? 'No classes on your schedule yet.'
              : `No classes on ${selected.student_name}'s schedule yet.`}
          </UIText>
        )}

        {!loading && selected && selected.classes.length > 0 && (
          <View testID="schedule-week">
            <StudentDays classes={selected.classes} />
            <PrintScheduleButton
              studentName={isOwn ? 'Class schedule' : selected.student_name}
              classes={selected.classes}
            />
          </View>
        )}

        {/* Absences, under the week they interrupt. */}
        {!loading && canReport && (
          <View className="mt-6" testID="schedule-absences">
            <HStack className="items-center justify-between mb-2">
              <Heading size="sm">Reported absences</Heading>
              <Pressable
                onPress={() => setReporting(true)}
                accessibilityRole="button"
                testID="schedule-report-absence"
                className="flex-row items-center gap-1 active:opacity-60"
              >
                <Ionicons name="add-circle-outline" size={16} color={c.brand} />
                <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                  Report an absence
                </UIText>
              </Pressable>
            </HStack>
            {!upcoming.length ? (
              <UIText size="sm" className="text-typo-300 dark:text-dark-typo-300">
                None reported.
              </UIText>
            ) : (
              <VStack space="sm">
                {upcoming.map((a) => (
                  <Card key={a.ids[0]} size="sm" className="bg-white dark:bg-dark-surface-100">
                    <HStack className="items-center justify-between gap-3">
                      <View className="flex-1">
                        <UIText size="sm" className="font-poppins-medium">
                          {a.absence_date}{a.end_date !== a.absence_date ? ` – ${a.end_date}` : ''}
                          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 font-poppins-regular">
                            {'  ·  '}{a.class_id ? (a.class_name || 'A class') : 'Whole day'}
                          </UIText>
                        </UIText>
                        {a.reason ? (
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">{a.reason}</UIText>
                        ) : null}
                      </View>
                      <Pressable onPress={() => cancelRun(a.ids)} hitSlop={8} testID={`absence-cancel-${a.ids[0]}`}>
                        <UIText size="xs" className="text-error-600 font-poppins-medium">Cancel</UIText>
                      </Pressable>
                    </HStack>
                  </Card>
                ))}
              </VStack>
            )}
          </View>
        )}

      </ScrollView>

      {canReport && (
        <AbsenceReportSheet
          absences={absences}
          visible={reporting}
          onClose={() => setReporting(false)}
        />
      )}
    </View>
  );
}

export default ScheduleTab;
