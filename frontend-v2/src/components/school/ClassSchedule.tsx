/**
 * The class schedule on the school hub: what a family's classes are, when they
 * meet, and which room to walk to.
 *
 * Rooms are the reason this exists (iCreate family orientation, 2026-08-18),
 * so a room is never silently dropped: when the meeting has none the class's
 * own location is used, and when neither is recorded the row simply carries
 * the time rather than an empty "Room" label pretending to be information.
 *
 * Laid out day by day, in time order, since 2026-08-25 — see StudentDays.
 */
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, VStack, HStack } from '@/src/components/ui';
import { SchoolSection } from './SchoolSection';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useClassSchedule, meetingsByDay, meetingTime,
  type ScheduledClass, type ClassMeeting, type StudentSchedule,
} from '@/src/hooks/useClassSchedule';

function MeetingRow({ cls, meeting }: { cls: ScheduledClass; meeting: ClassMeeting | null }) {
  const c = useThemeColors();
  // The meeting's own room wins over the class default: a class that moves
  // rooms on one day would otherwise send a family to the wrong door.
  const room = meeting?.location || cls.location;
  const time = meeting ? meetingTime(meeting) : '';
  return (
    <View className="bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl px-3.5 py-2.5">
      <HStack className="items-baseline gap-2 flex-wrap">
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-400 font-poppins-medium">
          {time || 'Time not posted'}
        </UIText>
        <UIText size="sm" className="font-poppins-semibold flex-1">{cls.name}</UIText>
      </HStack>
      <HStack className="items-center gap-2 flex-wrap mt-1">
        {cls.teacher_name ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            {cls.teacher_name}
          </UIText>
        ) : null}
        {room ? (
          <HStack className="items-center gap-1 px-1.5 py-0.5 rounded bg-optio-purple/10">
            <Ionicons name="location-outline" size={11} color={c.brand} />
            <UIText size="xs" className="text-optio-purple font-poppins-medium">{room}</UIText>
          </HStack>
        ) : null}
      </HStack>
    </View>
  );
}

/**
 * One student's week, day by day, each day in time order.
 *
 * Was a card per class with its meetings listed inside, which answered "when
 * does Pottery meet?" but not the question families actually arrive with —
 * "where is she at 10:30 on Tuesday?" (iCreate parent, 2026-08-25). Day
 * headings with time-ordered rows put the answer where they look for it.
 */
function StudentDays({ classes }: { classes: ScheduledClass[] }) {
  const days = meetingsByDay(classes);
  return (
    <VStack space="md">
      {days.map((day) => (
        <VStack key={day.key} space="xs">
          <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase">
            {day.label}
          </UIText>
          <VStack space="xs">
            {day.rows.map((row, i) => (
              <MeetingRow key={`${row.cls.id}-${i}`} cls={row.cls} meeting={row.meeting} />
            ))}
          </VStack>
        </VStack>
      ))}
    </VStack>
  );
}

export default function ClassSchedule({ organizationId }: { organizationId?: string | null }) {
  const { schedules, loading, hasAny } = useClassSchedule(organizationId);

  // Nothing to say beats an empty box: a member with no classes at all should
  // not get a "Schedule" heading over blank space.
  if (loading || !hasAny) return null;

  const withClasses = schedules.filter((s) => s.classes.length > 0);

  // One section PER STUDENT, not one section holding all of them. A parent with
  // three children was opening a single "Class schedule" block and getting
  // thirty-odd classes at once; with a section each they open the child they
  // came for. Each carries the page's usual closed-on-arrival default, so a
  // four-child family lands on four headings rather than four schedules.
  //
  // A student looking at their own gets the neutral title — "Class schedule"
  // reads better than their own name on their own page.
  return (
    <View testID="class-schedule">
      {withClasses.map((s: StudentSchedule) => (
        <SchoolSection
          key={s.student_id}
          title={s.student_name === 'My schedule' ? 'Class schedule' : s.student_name}
          icon="time-outline"
          count={s.classes.length}
        >
          <StudentDays classes={s.classes} />
        </SchoolSection>
      ))}
    </View>
  );
}
