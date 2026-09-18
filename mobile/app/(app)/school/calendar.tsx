/**
 * /school/calendar is a tab of the hub since 2026-09-18. The route stays so a
 * deep link or an older notification still lands on the right tab; any
 * params (?student=, ?org=) ride along.
 */

import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SchoolCalendarRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/(app)/school', params: { ...params, tab: 'calendar' } } as any} />;
}
