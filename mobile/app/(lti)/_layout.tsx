/**
 * LTI iframe layout.
 *
 * No sidebar, no top nav. Used when Canvas embeds Optio inside a course
 * navigation tab or assignment external tool launch. Routes inside this
 * group are reachable at `/lti-launch`, `/deep-link`, etc. — the (lti)
 * group name is stripped from the URL by Expo Router.
 *
 * Why a separate group: the (app) layout assumes a logged-in user with full
 * authStore state, mounts the sidebar, and runs onboarding redirects. None
 * of that is appropriate inside an iframe. We bootstrap auth here with the
 * one-time code from /lti/launch instead.
 */

import { Stack } from 'expo-router';
import { View } from 'react-native';

export default function LtiLayout() {
  // Plain bg-page — defers to the user's theme without nav chrome.
  return (
    <View className="flex-1 bg-page">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="lti-launch" />
        <Stack.Screen name="deep-link" />
        <Stack.Screen name="quest/[id]" />
        <Stack.Screen name="lti-evidence" />
        <Stack.Screen name="error" />
      </Stack>
    </View>
  );
}
