/**
 * The school calendar, on the phone.
 *
 * iCreate, 2026-09-04 (e223b6db): "Can we get the calendar to show up on the
 * app?" The hub's "Coming up" strip showed the next three dates and said the
 * rest lived on the web.
 *
 * An agenda, not a month grid: a 7x5 grid of tappable cells on a phone gives
 * each day about forty pixels and still needs a second tap to read anything.
 * Days with nothing on them are simply absent, so scrolling a term is scrolling
 * what actually happens.
 */

import React from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, Heading, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useSchoolHub } from '@/src/hooks/useSchool';
import { useSchoolCalendar, shiftMonth } from '@/src/hooks/useSchoolCalendar';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** "Tue 9" — the day's own heading. Parsed as parts, never as a Date, so a
 *  date-only string is not shifted by the device's timezone. */
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};

const timeLabel = (e: { all_day: boolean; start_at: string | null; end_at: string | null }) => {
  if (e.all_day || !e.start_at) return 'All day';
  const t = (v: string | null) => (v
    ? new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '');
  const start = t(e.start_at);
  const end = t(e.end_at);
  return end && end !== start ? `${start} – ${end}` : start;
};

export default function SchoolCalendarScreen() {
  const c = useThemeColors();
  // Same org resolution as the hub and the class schedule beside it — it also
  // covers the superadmin preview, which has no membership of its own.
  const { org } = useSchoolHub();
  const { month, setMonth, days, loading, error, reload } =
    useSchoolCalendar(org?.organization_id);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top']}>
      <HStack className="items-center gap-2 px-4 py-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button"
          accessibilityLabel="Back" className="p-1 -ml-1 active:opacity-60">
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="md" className="flex-1">Calendar</Heading>
      </HStack>

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
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
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

        {!loading && !error && (days || []).map((day) => (
          <Card key={day.date} className="mb-3 bg-white dark:bg-dark-surface-100">
            <UIText size="xs"
              className="font-poppins-medium text-optio-purple mb-2 uppercase tracking-wide">
              {dayLabel(day.date)}
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
                      {timeLabel(e)}
                    </UIText>
                  </HStack>
                  {e.location ? (
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">
                      {e.location}
                    </UIText>
                  ) : null}
                  {e.description ? (
                    <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1">
                      {e.description}
                    </UIText>
                  ) : null}
                </View>
              ))}
            </VStack>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
