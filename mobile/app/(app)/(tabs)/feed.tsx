/**
 * Feed tab - one of three screens, by role.
 *
 *   StudentFeed   the learner's own feed (and a superadmin's Highlights)
 *   ParentFeed    the family's activity, scoped to the child in family scope
 *   ObserverFeed  the students an observer follows, plus their list
 *
 * They share FeedList (components/feed/FeedList): the FlatList, its
 * visibility tracking, the empty and footer cards, the refreshes. The same
 * endpoint serves all three; the backend scopes results by permission.
 *
 * Until 2026-09-15 this file was the three screens interleaved: 840 lines,
 * with `isObserver ? ... : isParent ? ... : ...` in the header, the empty
 * copy, the welcome effects, the moderation check and the render. Each role
 * now reads as one component.
 */

import React from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsObserver, useIsParent } from '@/src/hooks/useStartSomething';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { StudentFeed } from '@/src/components/feed/StudentFeed';
import { ParentFeed } from '@/src/components/feed/ParentFeed';
import { ObserverFeed } from '@/src/components/feed/ObserverFeed';

const DESKTOP_BREAKPOINT = 768;

export default function FeedScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isObserver = useIsObserver();
  const isParent = useIsParent();
  // A superadmin as themselves gets the global feed (and Highlights) even
  // when they are also somebody's parent: the family store picks a first
  // child on its own, which scoped a superadmin-parent to that one kid with
  // no switcher to get back out. Previewing as a parent is the parent feed.
  const role = useAuthStore((s) => s.user?.role);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const superadminSelf = role === 'superadmin' && !previewRole;

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <PageHeader title={isObserver && !superadminSelf ? 'Activity' : 'Feed'} />
      {superadminSelf
        ? <StudentFeed isDesktop={isDesktop} />
        : isObserver
          ? <ObserverFeed isDesktop={isDesktop} />
          : isParent
            ? <ParentFeed isDesktop={isDesktop} />
            : <StudentFeed isDesktop={isDesktop} />}
    </SafeAreaView>
  );
}
