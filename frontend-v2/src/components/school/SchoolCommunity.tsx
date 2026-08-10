/**
 * The school's community board, as a family sees it on mobile — announcements,
 * upcoming events, lost & found, shout-outs. Mirrors the web SchoolCommunity:
 * each section renders only when the school has used it, and the component is
 * a projection — the feed endpoint already sends only family-safe fields.
 *
 * Lost & found carries the item, not the child ("just the item that was lost
 * so parents can see it and know to come pick it up" — iCreate, 2026-08-01).
 */

import React from 'react';
import { View, Image, ScrollView } from 'react-native';
import { Badge, BadgeText, HStack, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { SchoolFeed } from '@/src/hooks/useSchool';
import { SchoolSection } from './SchoolSection';
import RichBody from './RichBody';
import { fmtDate, fmtWhen } from './format';

const RECOGNITION_LABEL: Record<string, string> = {
  shout_out: 'Shout-out',
  student_spotlight: 'Student spotlight',
  volunteer: 'Volunteer thanks',
  weekly_win: 'Win of the week',
  thank_you: 'Thank you',
};

export default function SchoolCommunity({ feed }: { feed: SchoolFeed | null }) {
  const c = useThemeColors();
  if (!feed) return null;
  const { announcements = [], events = [], lost_found: lostFound = [], recognition = [] } = feed;

  return (
    <View>
      {announcements.length > 0 && (
        <SchoolSection title="Announcements" icon="megaphone-outline">
          <VStack space="sm">
            {announcements.map((a) => (
              <View
                key={a.id}
                testID={`announcement-${a.id}`}
                className={`rounded-lg border p-3.5 ${
                  a.priority === 'urgent'
                    ? 'border-error-200 bg-error-50/40 dark:border-error-500/40 dark:bg-dark-surface-200'
                    : 'border-surface-100 bg-surface-50/60 dark:border-dark-surface-300 dark:bg-dark-surface-200'
                }`}
              >
                <HStack className="items-start justify-between gap-2">
                  <HStack className="items-center gap-2 flex-wrap flex-1">
                    {a.pinned && (
                      <Badge className="bg-optio-purple/10 rounded-full">
                        <BadgeText className="text-optio-purple text-[11px] normal-case">Pinned</BadgeText>
                      </Badge>
                    )}
                    {a.priority === 'urgent' && (
                      <Badge className="bg-error-100 rounded-full">
                        <BadgeText className="text-error-700 text-[11px] normal-case">Urgent</BadgeText>
                      </Badge>
                    )}
                    <UIText size="sm" className="font-poppins-semibold flex-shrink">{a.title}</UIText>
                  </HStack>
                  <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 mt-0.5">
                    {fmtDate(a.created_at)}
                  </UIText>
                </HStack>
                {a.body ? (
                  <View className="mt-2">
                    <RichBody text={a.body} />
                  </View>
                ) : null}
              </View>
            ))}
          </VStack>
        </SchoolSection>
      )}

      {events.length > 0 && (
        <SchoolSection title="Upcoming events" icon="calendar-outline">
          <VStack>
            {events.map((e, i) => (
              <View
                key={e.id}
                testID={`event-${e.id}`}
                className={`py-3 ${i === 0 ? 'pt-0' : ''} ${i === events.length - 1 ? 'pb-0' : 'border-b border-surface-100 dark:border-dark-surface-300'}`}
              >
                <HStack className="items-start justify-between gap-3">
                  <UIText size="sm" className="font-poppins-medium flex-1">{e.title}</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{fmtWhen(e)}</UIText>
                </HStack>
                {e.location ? (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">{e.location}</UIText>
                ) : null}
                {e.description ? (
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-1">{e.description}</UIText>
                ) : null}
              </View>
            ))}
          </VStack>
        </SchoolSection>
      )}

      {lostFound.length > 0 && (
        <SchoolSection
          title="Lost & found"
          icon="archive-outline"
          count={lostFound.length}
          intro="Recognize something? Collect it from the office."
        >
          {/* Horizontal cards — photos are the point, and a phone-width grid
              would shrink them to thumbnails. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HStack space="sm">
              {lostFound.map((item) => (
                <View
                  key={item.id}
                  testID={`lostfound-${item.id}`}
                  className="w-44 rounded-lg border border-surface-100 dark:border-dark-surface-300 bg-surface-50/60 dark:bg-dark-surface-200 overflow-hidden"
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 110 }} resizeMode="cover" />
                  ) : null}
                  <View className="p-3">
                    <UIText size="sm" className="font-poppins-medium" numberOfLines={2}>{item.description}</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1" numberOfLines={2}>
                      {[item.category,
                        item.location_found && `found at ${item.location_found}`,
                        item.date_found && `on ${fmtDate(item.date_found)}`]
                        .filter(Boolean).join(' · ')}
                    </UIText>
                    {/* Unclaimed items are donated after a fortnight — the
                        deadline is the useful part for a parent. */}
                    {typeof item.days_until_donation === 'number' && item.days_until_donation >= 0 && (
                      <UIText size="xs" className="text-warning-700 mt-1">
                        {item.days_until_donation === 0
                          ? 'Being donated today'
                          : `Donated in ${item.days_until_donation} day${item.days_until_donation === 1 ? '' : 's'}`}
                      </UIText>
                    )}
                  </View>
                </View>
              ))}
            </HStack>
          </ScrollView>
        </SchoolSection>
      )}

      {recognition.length > 0 && (
        <SchoolSection title="Shout-outs" icon="sparkles-outline">
          <VStack space="sm">
            {recognition.map((r) => (
              <View
                key={r.id}
                testID={`recognition-${r.id}`}
                className="rounded-lg border border-surface-100 dark:border-dark-surface-300 bg-surface-50/60 dark:bg-dark-surface-200 p-3.5"
              >
                <HStack className="items-center gap-2 flex-wrap">
                  <Badge className="bg-optio-pink/10 rounded-full">
                    <BadgeText className="text-optio-pink text-[11px] normal-case">
                      {RECOGNITION_LABEL[r.type] || 'Shout-out'}
                    </BadgeText>
                  </Badge>
                  {r.recipient_name ? (
                    <UIText size="sm" className="font-poppins-semibold">{r.recipient_name}</UIText>
                  ) : null}
                  <View className="flex-1" />
                  <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{fmtDate(r.created_at)}</UIText>
                </HStack>
                {r.message ? (
                  <UIText size="sm" className="text-typo-600 dark:text-dark-typo-600 mt-2">{r.message}</UIText>
                ) : null}
              </View>
            ))}
          </VStack>
        </SchoolSection>
      )}
    </View>
  );
}
