/**
 * UploadStatusPill - a small floating indicator that appears while the durable
 * media upload queue has pending jobs. Tapping it re-kicks processing (manual
 * retry). Mounted once, app-wide, in the authenticated layout.
 */

import React from 'react';
import { View, Pressable, ActivityIndicator, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingUploadCount, processUploadQueue } from '@/src/services/uploadQueue';

export function UploadStatusPill() {
  const count = usePendingUploadCount();
  const insets = useSafeAreaInsets();
  if (count <= 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 72, alignItems: 'center' }}
    >
      <Pressable
        onPress={() => { void processUploadQueue(); }}
        accessibilityLabel="Media uploading. Tap to retry now."
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#1F1F2E',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontFamily: 'Poppins_500Medium', fontSize: 13 }}>
          Uploading {count} {count === 1 ? 'item' : 'items'}…
        </Text>
      </Pressable>
    </View>
  );
}
