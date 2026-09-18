/**
 * The Calendar tab: the school's month, as an agenda.
 *
 * iCreate, 2026-09-04 (e223b6db): "Can we get the calendar to show up on the
 * app?" The hub's "Coming up" strip showed the next three dates and said the
 * rest lived on the web. It was its own screen until the hub grew tabs
 * (2026-09-18); the body is unchanged.
 *
 * An agenda, not a month grid: a 7x5 grid of tappable cells on a phone gives
 * each day about forty pixels and still needs a second tap to read anything.
 * Days with nothing on them are simply absent, so scrolling a term is
 * scrolling what actually happens.
 *
 * The current month opens on today (2026-09-18): the days already gone sit
 * behind one "earlier this month" tap instead of above the fold.
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, LinkedText, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  useSchoolCalendar, shiftMonth, thisMonth, todayIso, splitAtToday, type CalendarDay,
} from '@/src/hooks/useSchoolCalendar';
// Every label that comes from an event's stamps is built in format.ts, which
// reads them as the wall clock the office typed. This screen once had its own
// copy of the time label without that rule and showed a 6:30 event at 12:30.
import { fmtDayHeading, fmtTimeRange } from './format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

function DayCard({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
  return (
    <Card className="mb-3 bg-white dark:bg-dark-surface-100" testID={isToday ? 'cal-today' : undefined}>
      <UIText size="xs"
        className="font-poppins-medium text-optio-purple mb-2 uppercase tracking-wide">
        {isToday ? 'Today · ' : ''}{fmtDayHeading(day.date)}
      </UIText>
      <VStack>
        {day.events.map((e, i) => (
          <View key={e.id}
            className={`py-2 ${i === 0 ? 'pt-0' : ''} ${
              i === day.events.length - 1
                ? 'pb-0'
                : 'border-b border-surface-100 dark:border-dark-surface-300'}`}>
            <HStack className="items-start justify-between gap-3">
              <UIText size="sm" className="font-poppins-medium flex-1">{e.title}</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {fmtTimeRange(e)}
              </UIText>
            </HStack>
            {/* Both are typed by the office and both carry pasted links: a
                sign-up form in the description, a Zoom link where a room
                would be. LinkedText makes them tappable. */}
            {e.location ? (
              <LinkedText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
                {e.location}
              </LinkedText>
            ) : null}
            {e.description ? (
              <LinkedText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1">
                {e.description}
              </LinkedText>
            ) : null}
          </View>
        ))}
      </VStack>
    </Card>
  );
}

export function CalendarTab({ organizationId }: { organizationId?: string }) {
  const c = useThemeColors();
  const { month, setMonth, days, loading, error, reload } = useSchoolCalendar(organizationId);
  const [showPast, setShowPast] = useState(false);

  const today = todayIso();
  const isThisMonth = month === thisMonth();
  const { past, upcoming } = isThisMonth
    ? splitAtToday(days || [], today)
    : { past: [], upcoming: days || [] };
  const hidden = isThisMonth && !showPast ? past : [];
  const shown = isThisMonth && !showPast ? upcoming : days || [];
  const todayHasEvents = shown.some((d) => d.date === today);

  return (
    <View className="flex-1" testID="school-tab-calendar">
      <HStack className="items-center justify-between px-4 pb-2">
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))}
          accessibilityRole="button" accessibilityLabel="Previous month"
          testID="cal-prev" className="p-2 active:opacity-60">
          <Ionicons name="chevron-back" size={20} color={c.brand} />
        </Pressable>
        <UIText className="font-poppins-medium" testID="cal-month">{monthLabel(month)}</UIText>
        <Pressable onPress={() => setMonth(shiftMonth(month, 1))}
          accessibilityRole="button" accessibilityLabel="Next month"
          testID="cal-next" className="p-2 active:opacity-60">
          <Ionicons name="chevron-forward" size={20} color={c.brand} />
        </Pressable>
      </HStack>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={c.brand} />}
      >
        {loading && (
          <View className="py-12 items-center">
            <ActivityIndicator color={c.brand} />
          </View>
        )}

        {!loading && error && (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-8 text-center">
            {error}
          </UIText>
        )}

        {!loading && !error && days?.length === 0 && (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-8 text-center"
            testID="cal-empty">
            Nothing on the calendar this month.
          </UIText>
        )}

        {/* The days already gone, folded up out of the way. */}
        {!loading && !error && hidden.length > 0 && (
          <Pressable onPress={() => setShowPast(true)} accessibilityRole="button"
            testID="cal-show-past" className="mb-3 active:opacity-60">
            <UIText size="xs" className="text-optio-purple font-poppins-medium">
              {hidden.length === 1 ? 'Show 1 earlier day this month' : `Show ${hidden.length} earlier days this month`}
            </UIText>
          </Pressable>
        )}

        {/* Today anchors the top even when nothing is on it, so the first
            heading a parent reads is never a date they have to place. */}
        {!loading && !error && isThisMonth && !showPast && !todayHasEvents && (days || []).length > 0 && (
          <View className="mb-3 px-1" testID="cal-today-empty">
            <UIText size="xs"
              className="font-poppins-medium text-optio-purple uppercase tracking-wide">
              Today · {fmtDayHeading(today)}
            </UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1">
              Nothing scheduled today.
            </UIText>
          </View>
        )}

        {!loading && !error && shown.map((day) => (
          <DayCard key={day.date} day={day} isToday={day.date === today} />
        ))}

        {!loading && !error && isThisMonth && upcoming.length === 0 && (days || []).length > 0 && !showPast && (
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-4 text-center"
            testID="cal-rest-empty">
            Nothing more this month.
          </UIText>
        )}
      </ScrollView>
    </View>
  );
}

export default CalendarTab;
