/**
 * The class schedule on the school hub: what a family's classes are, when they
 * meet, and which room to walk to.
 *
 * Rooms are the reason this exists (iCreate family orientation, 2026-08-18),
 * so a room is never silently dropped: when the meeting has none the class's
 * own location is used, and when neither is recorded the row simply carries
 * the time rather than an empty "Room" label pretending to be information.
 */
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, VStack, HStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useClassSchedule, dayName, meetingTime,
  type ScheduledClass, type StudentSchedule,
} from '@/src/hooks/useClassSchedule';

function ClassRow({ cls }: { cls: ScheduledClass }) {
  const c = useThemeColors();
  return (
    <View className="bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl px-3.5 py-3">
      <UIText size="sm" className="font-poppins-semibold">{cls.name}</UIText>
      {cls.teacher_name ? (
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
          {cls.teacher_name}
        </UIText>
      ) : null}

      {cls.meetings.length > 0 ? (
        <VStack space="xs" className="mt-2">
          {cls.meetings.map((m, i) => {
            const day = dayName(m.day_of_week) || m.specific_date || '';
            const time = meetingTime(m);
            const room = m.location || cls.location;
            return (
              <HStack key={i} className="items-center gap-2 flex-wrap">
                <Ionicons name="time-outline" size={13} color={c.iconMuted} />
                <UIText size="xs" className="text-typo-600 dark:text-dark-typo-400">
                  {[day, time].filter(Boolean).join(' · ')}
                </UIText>
                {room ? (
                  <HStack className="items-center gap-1 px-1.5 py-0.5 rounded bg-optio-purple/10">
                    <Ionicons name="location-outline" size={11} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">{room}</UIText>
                  </HStack>
                ) : null}
              </HStack>
            );
          })}
        </VStack>
      ) : (
        <HStack className="items-center gap-2 mt-2">
          <Ionicons name="time-outline" size={13} color={c.iconMuted} />
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            Meeting times not posted yet
          </UIText>
          {cls.location ? (
            <HStack className="items-center gap-1 px-1.5 py-0.5 rounded bg-optio-purple/10">
              <Ionicons name="location-outline" size={11} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium">{cls.location}</UIText>
            </HStack>
          ) : null}
        </HStack>
      )}
    </View>
  );
}

export default function ClassSchedule({ organizationId }: { organizationId?: string | null }) {
  const { schedules, loading, hasAny } = useClassSchedule(organizationId);

  // Nothing to say beats an empty box: a member with no classes at all should
  // not get a "Schedule" heading over blank space.
  if (loading || !hasAny) return null;

  const withClasses = schedules.filter((s) => s.classes.length > 0);
  const showNames = withClasses.length > 1 || withClasses[0]?.student_name !== 'My schedule';

  return (
    <VStack space="sm" className="mb-5" testID="class-schedule">
      <Heading size="md">Class schedule</Heading>
      {withClasses.map((s: StudentSchedule) => (
        <VStack key={s.student_id} space="xs">
          {showNames && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase">
              {s.student_name}
            </UIText>
          )}
          {s.classes.map((cls) => <ClassRow key={cls.id} cls={cls} />)}
        </VStack>
      ))}
    </VStack>
  );
}
