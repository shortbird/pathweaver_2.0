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
 * Register for push notifications on mobile.
 * Requests permission, gets Expo push token, sends to backend.
 *
 * Call after successful login.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications || !Device || !Constants) {
    return null;
  }

  // Must be a physical device (not simulator)
  if (!Device.isDevice) {
    console.debug('[Push] Not a physical device, skipping registration');
    return null;
  }

  try {
    // Check/request permission
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

    // Get Expo push token
    // S3: read projectId only from Expo runtime config. A hardcoded fallback
    // would mask configuration bugs and quietly send push tokens to a stale
    // project if app.json ever changes.
    const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId
      || Constants.default?.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Push] No EAS projectId in expoConfig — skipping push registration.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Send token to backend
    await api.post('/api/push/expo-token', {
      token,
      platform: Platform.OS, // 'ios' or 'android'
      device_name: Device.modelName || undefined,
    });

    console.debug('[Push] Registered push token:', token.slice(0, 20) + '...');
    return token;

  } catch (error) {
    console.error('[Push] Registration failed:', error);
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
