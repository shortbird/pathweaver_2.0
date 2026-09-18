/**
 * School stack — the per-organization school surface. Since 2026-09-18 the
 * hub (index) is one tabbed page and the message archive is the only other
 * screen; absences/calendar/carpool/documents remain as routes that redirect
 * into the matching tab so older links still land. Not a tab of the app:
 * it's entered from the header school button (PageHeader), which appears
 * only for users whose /me carries `school`.
 */

import { Stack } from 'expo-router';

export default function SchoolLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="archive" />
      <Stack.Screen name="absences" />
      <Stack.Screen name="carpool" />
      <Stack.Screen name="documents" />
    </Stack>
  );
}
