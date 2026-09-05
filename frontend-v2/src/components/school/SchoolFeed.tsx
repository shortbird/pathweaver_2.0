/**
 * The unified school feed — ONE stream for everything the school has said.
 *
 * Board announcements (sis_announcements) and sent messages (the announcements
 * archive) are two backend systems doing one job from a family's point of
 * view; splitting them across a "Messages" door and an "Announcements"
 * dropdown had parents reporting things "missing" depending on which they
 * opened (iCreate, 2026-08-06). Merged here instead, with shout-outs and
 * lost & found folded in as typed items — pinned posts first, then everything
 * newest-first.
 *
 * The one seam the merge has to hide: a board post created with "notify" also
 * writes an archive row, so the same words arrive twice. An archive message
 * whose title matches a board post on the same calendar day is that copy, and
 * the board copy wins — it carries pinned/urgent.
 */

import React, { useMemo, useState } from 'react';
import { View, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BadgeText, Card, HStack, Heading, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { htmlToText } from '@/src/utils/richText';
import type { SchoolFeed as SchoolFeedData, ArchivedMessage } from '@/src/hooks/useSchool';
import RichBody from './RichBody';
import { SchoolSection } from './SchoolSection';
import { fmtDate, fmtWhen } from './format';

// Three, not six: on a phone six posts is most of a screen before anything else
// on the page gets a look in. "Show all" is right there for the rest.
const FEED_CAP = 3;

const RECOGNITION_LABEL: Record<string, string> = {
  shout_out: 'Shout-out',
  student_spotlight: 'Student spotlight',
  volunteer: 'Volunteer thanks',
  weekly_win: 'Win of the week',
  thank_you: 'Thank you',
};

export interface FeedItem {
  key: string;
  kind: 'announcement' | 'message' | 'shoutout' | 'lostfound';
  date: string;
  pinned: boolean;
  data: any;
}

const norm = (s?: string | null) => (s || '').trim().toLowerCase();
const dayOf = (iso?: string | null) => (iso || '').slice(0, 10);

/** Everything merged into one dated list. Exported for tests. */
export function mergeSchoolFeed(
  feed: SchoolFeedData | null,
  messages: ArchivedMessage[],
): FeedItem[] {
  const board: FeedItem[] = (feed?.announcements || []).map((a) => ({
    key: `announcement-${a.id}`, kind: 'announcement',
    date: a.created_at, pinned: Boolean(a.pinned), data: a,
  }));
  const boardKeys = new Set(board.map((i) => `${norm(i.data.title)}|${dayOf(i.date)}`));
  const msgs: FeedItem[] = (messages || [])
    .filter((m) => !boardKeys.has(`${norm(m.title)}|${dayOf(m.created_at)}`))
    .map((m) => ({ key: `message-${m.id}`, kind: 'message', date: m.created_at, pinned: false, data: m }));
  const shouts: FeedItem[] = (feed?.recognition || []).map((r) => ({
    key: `shoutout-${r.id}`, kind: 'shoutout', date: r.created_at, pinned: false, data: r,
  }));
  const lost: FeedItem[] = (feed?.lost_found || []).map((l) => ({
    key: `lostfound-${l.id}`, kind: 'lostfound', date: l.created_at, pinned: false, data: l,
  }));
  return [...board, ...msgs, ...shouts, ...lost].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.date || '').localeCompare(a.date || '');
  });
}

const itemCard = 'rounded-lg border border-surface-100 bg-surface-50/60 dark:border-dark-surface-300 dark:bg-dark-surface-200';

function AnnouncementItem({ item }: { item: FeedItem }) {
  const d = item.data;
  const isUrgent = d.priority === 'urgent';
  const [expanded, setExpanded] = useState(false);
  const c = useThemeColors();
  const body = d.body || d.content || d.message || '';
  // Length is judged on the words, not the markup, so a formatted message
  // doesn't collapse itself for two lines of tags.
  const plain = htmlToText(body);
  const isLong = item.kind === 'message' && plain.length > 280;

  return (
    <View
      testID={`feed-${item.key}`}
      className={`p-3.5 ${isUrgent
        ? 'rounded-lg border border-red-200 bg-red-50/40 dark:border-red-500/40 dark:bg-dark-surface-200'
        : itemCard}`}
    >
      <HStack className="items-start justify-between gap-2">
        <HStack className="items-center gap-2 flex-wrap flex-1">
          {item.pinned && (
            <Badge className="bg-optio-purple/10 rounded-full">
              <BadgeText className="text-optio-purple text-[11px] normal-case">Pinned</BadgeText>
            </Badge>
          )}
          {isUrgent && (
            <Badge className="bg-red-100 rounded-full">
              <BadgeText className="text-red-700 text-[11px] normal-case">Urgent</BadgeText>
            </Badge>
          )}
          <UIText size="sm" className="font-poppins-semibold flex-shrink">{d.title}</UIText>
        </HStack>
        <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 mt-0.5">
          {fmtDate(item.date)}
        </UIText>
      </HStack>
      {body ? (
        <View className="mt-2">
          {!expanded && isLong ? (
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={4}>
              {plain}
            </UIText>
          ) : (
            <RichBody text={body} />
          )}
        </View>
      ) : null}
      {isLong && (
        <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8} className="mt-2">
          <HStack className="items-center gap-1">
            <UIText size="sm" className="text-optio-purple font-poppins-medium">
              {expanded ? 'Show less' : 'Read more'}
            </UIText>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={c.brand} />
          </HStack>
        </Pressable>
      )}
    </View>
  );
}

function ShoutoutItem({ item }: { item: FeedItem }) {
  const d = item.data;
  return (
    <View testID={`feed-${item.key}`} className={`p-3.5 ${itemCard}`}>
      <HStack className="items-center gap-2 flex-wrap">
        <Badge className="bg-optio-pink/10 rounded-full">
          <BadgeText className="text-optio-pink text-[11px] normal-case">
            {RECOGNITION_LABEL[d.type] || 'Shout-out'}
          </BadgeText>
        </Badge>
        {d.recipient_name ? (
          <UIText size="sm" className="font-poppins-semibold">{d.recipient_name}</UIText>
        ) : null}
        <View className="flex-1" />
        <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{fmtDate(item.date)}</UIText>
      </HStack>
      {d.message ? (
        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2">{d.message}</UIText>
      ) : null}
    </View>
  );
}

/** One lost & found card. Exported for the hub's "Lost & found" chip modal,
 *  which lists the same feed items outside the merged stream. */
export function LostFoundItem({ item }: { item: FeedItem }) {
  const d = item.data;
  return (
    <View testID={`feed-${item.key}`} className={`p-3.5 flex-row gap-3 ${itemCard}`}>
      {d.image_url ? (
        <Image
          source={{ uri: d.image_url }}
          style={{ width: 56, height: 56, borderRadius: 8 }}
          resizeMode="cover"
        />
      ) : null}
      <View className="flex-1 min-w-0">
        <HStack className="items-center gap-2 flex-wrap">
          <Badge className="bg-amber-100 rounded-full">
            <BadgeText className="text-amber-700 text-[11px] normal-case">Lost &amp; found</BadgeText>
          </Badge>
          <View className="flex-1" />
          <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{fmtDate(item.date)}</UIText>
        </HStack>
        <UIText size="sm" className="font-poppins-medium mt-1" numberOfLines={2}>{d.description}</UIText>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5" numberOfLines={2}>
          {[d.category,
            d.location_found && `found at ${d.location_found}`,
            'collect it from the office']
            .filter(Boolean).join(' · ')}
        </UIText>
        {/* Unclaimed items are donated after a fortnight — the deadline is
            the useful part for a parent. */}
        {typeof d.days_until_donation === 'number' && d.days_until_donation >= 0 && (
          <UIText size="xs" className="text-amber-700 mt-0.5">
            {d.days_until_donation === 0
              ? 'Being donated today'
              : `Donated in ${d.days_until_donation} day${d.days_until_donation === 1 ? '' : 's'}`}
          </UIText>
        )}
      </View>
    </View>
  );
}

function renderItem(item: FeedItem) {
  if (item.kind === 'shoutout') return <ShoutoutItem key={item.key} item={item} />;
  if (item.kind === 'lostfound') return <LostFoundItem key={item.key} item={item} />;
  return <AnnouncementItem key={item.key} item={item} />;
}

export default function SchoolFeed({ schoolName, feed, messages, onSeeAll }: {
  schoolName: string;
  feed: SchoolFeedData | null;
  messages: ArchivedMessage[];
  onSeeAll: () => void;
}) {
  const c = useThemeColors();
  const [showAll, setShowAll] = useState(false);
  const items = useMemo(() => mergeSchoolFeed(feed, messages), [feed, messages]);

  if (items.length === 0) return null;

  const overflows = items.length > FEED_CAP;
  const visible = showAll || !overflows ? items : items.slice(0, FEED_CAP);

  // Collapsible, like every other block on this page, and open on arrival
  // because it is what a family comes here for. It was the one section that
  // could not be closed and it ran the full height of the screen, so nobody
  // realised the schedule and the rest sat underneath it (iCreate, 2026-08-26:
  // "Families are not understanding there are more things below the
  // announcements").
  return (
    <View testID="school-feed">
      <SchoolSection
        title={`From ${schoolName}`}
        icon="megaphone-outline"
        count={items.length}
        defaultOpen
      >
        <VStack space="sm">
          {visible.map(renderItem)}
        </VStack>
        {overflows && !showAll && (
          <Pressable onPress={() => setShowAll(true)} hitSlop={8} className="mt-3" testID="feed-show-all">
            <UIText size="sm" className="text-optio-purple font-poppins-medium">
              Show all {items.length}
            </UIText>
          </Pressable>
        )}
        <Pressable onPress={onSeeAll} hitSlop={8} className="mt-3" testID="feed-see-all">
          <HStack className="items-center gap-1">
            <UIText size="sm" className="text-optio-purple font-poppins-semibold">
              Older messages &amp; search
            </UIText>
            <Ionicons name="chevron-forward" size={14} color={c.brand} />
          </HStack>
        </Pressable>
      </SchoolSection>
    </View>
  );
}

/**
 * The next few dates, as a slim strip — not a section a parent has to open.
 * This is the "don't get surprised Tuesday" glance; `onSeeAll` opens the month
 * behind it (e223b6db — the full calendar used to be web-only).
 */
export function ComingUp({ events, onSeeAll }: {
  events: SchoolFeedData['events'];
  onSeeAll?: () => void;
}) {
  const c = useThemeColors();
  const upcoming = (events || []).slice(0, 3);
  // The strip hides itself when the next few weeks are empty, but the month
  // behind it may not be — so the way through survives an empty strip.
  if (upcoming.length === 0) return null;
  return (
    <Card className="mb-3 bg-white dark:bg-dark-surface-100" testID="coming-up">
      <HStack className="items-center gap-2.5 mb-3">
        <View className="w-8 h-8 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name="calendar-outline" size={17} color={c.brand} />
        </View>
        <Heading size="sm" className="flex-1">Coming up</Heading>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button"
            accessibilityLabel="See the whole calendar" testID="coming-up-see-all"
            className="active:opacity-60">
            <UIText size="xs" className="text-optio-purple font-poppins-medium">Calendar</UIText>
          </Pressable>
        ) : null}
      </HStack>
      <VStack>
        {upcoming.map((e, i) => (
          <View
            key={e.id}
            className={`py-2 ${i === 0 ? 'pt-0' : ''} ${
              i === upcoming.length - 1 ? 'pb-0' : 'border-b border-surface-100 dark:border-dark-surface-300'}`}
          >
            <HStack className="items-start justify-between gap-3">
              <UIText size="sm" className="font-poppins-medium flex-1">{e.title}</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{fmtWhen(e)}</UIText>
            </HStack>
            {e.location ? (
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-0.5">{e.location}</UIText>
            ) : null}
          </View>
        ))}
      </VStack>
    </Card>
  );
}
