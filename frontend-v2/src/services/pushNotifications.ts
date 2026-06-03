/**
 * Push Notification Service for Expo (mobile) and Web.
 *
 * Mobile: Uses expo-notifications to register for push tokens and handle
 * foreground/background notifications. Tokens are sent to backend for storage.
 *
 * Web: No-op for now -- V1 handles web push via service worker.
 */

import { Platform } from 'react-native';
import api from './api';

// Only import expo-notifications on native (not available on web)
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let Constants: typeof import('expo-constants') | null = null;

if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants');
}

/**
 * Fetch the Expo push token with a few retries. Expo's token endpoint
 * intermittently returns 503 ("upstream connect error … connection timeout");
 * a short backoff almost always clears it without bothering the user.
 */
async function getExpoTokenWithRetry(projectId: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const tokenData = await Notifications!.getExpoPushTokenAsync({ projectId });
      return tokenData.data;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Register for push notifications on mobile.
 * Requests permission, gets Expo push token, sends to backend.
 *
 * Call after successful login.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications || !Device || !Constants) {
    return null;
  }

  try {
    // 1. Request notification permission ALWAYS, even on iOS sim. The
    //    permission grant is what lets the OS display banners — including
    //    locally-injected `xcrun simctl push` payloads we use for dev. If we
    //    bail before this, the user never sees the system prompt and every
    //    simulator push is silently dropped.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.debug('[Push] Permission not granted');
      return null;
    }

    // 2. Skip the actual token GET + backend POST on iOS Simulator: Apple's
    //    APNs doesn't deliver to sims, so an Expo token from here is useless
    //    in the DB. Android emulators *do* get real FCM tokens and should
    //    register normally. Physical iOS / Android devices also register.
    if (!Device.isDevice && Platform.OS === 'ios') {
      console.debug('[Push] iOS simulator: permission granted, skipping Expo token registration');
      return null;
    }

    // 3. Get Expo push token.
    //    S3: read projectId only from Expo runtime config. A hardcoded fallback
    //    would mask configuration bugs and quietly send push tokens to a stale
    //    project if app.json ever changes.
    const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId
      || Constants.default?.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId in expoConfig — skipping push registration.');
      return null;
    }

    const token = await getExpoTokenWithRetry(projectId);

    // 4. Send token to backend.
    await api.post('/api/push/expo-token', {
      token,
      platform: Platform.OS, // 'ios' or 'android'
      device_name: Device.modelName || undefined,
    });

    console.debug('[Push] Registered push token:', token.slice(0, 20) + '...');
    return token;

  } catch (error) {
    // Push registration is best-effort. Transient failures (Expo token service
    // 503s, flaky network) are expected and retry on the next launch/login, so
    // warn rather than error — no scary red LogBox, no Sentry alert.
    console.warn('[Push] Registration failed (will retry next launch):', error);
    return null;
  }
}

/**
 * Deactivate push token on logout.
 */
export async function deactivatePushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications || !Constants) return;

  try {
    // S3: read projectId only from Expo runtime config. A hardcoded fallback
    // would mask configuration bugs and quietly send push tokens to a stale
    // project if app.json ever changes.
    const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId
      || Constants.default?.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId in expoConfig — skipping push deactivation.');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.delete('/api/push/expo-token', {
      data: { token: tokenData.data },
    });
  } catch {
    // Non-critical -- token will expire naturally
  }
}

/**
 * Configure notification handling (foreground display, tap response).
 * Call once at app startup.
 */
export function configurePushNotifications(): void {
  if (Platform.OS === 'web' || !Notifications) return;

  // Show notifications when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Set Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance?.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6D469B',
    });
  }
}

/**
 * Add a listener for notification taps (user interacts with notification).
 * Returns a cleanup function.
 */
export function addNotificationResponseListener(
  callback: (link: string | null) => void,
): (() => void) | null {
  if (Platform.OS === 'web' || !Notifications) return null;

  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    const link = (data?.url || data?.link || null) as string | null;
    callback(link);
  });

  return () => subscription.remove();
}

/**
 * Link for the notification that COLD-STARTED the app (tapped while the app was
 * killed). `addNotificationResponseReceivedListener` never fires for this case,
 * so without checking the last response here, tapping a notification from a
 * killed app would launch the app with no navigation — the "tapped a
 * notification and nothing happened / it made me log back in" bug report.
 *
 * Returns null if the app wasn't opened from a notification.
 */
export async function getInitialNotificationLink(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    const data = response.notification.request.content.data;
    return (data?.url || data?.link || null) as string | null;
  } catch {
    return null;
  }
}
