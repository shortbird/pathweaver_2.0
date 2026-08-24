/**
 * School stack — the per-organization school surface (hub, message archive,
 * absence reporting, carpool board, documents). Not a tab: it's entered from
 * the header school button (PageHeader), which appears only for users whose
 * /me carries `school`.
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
