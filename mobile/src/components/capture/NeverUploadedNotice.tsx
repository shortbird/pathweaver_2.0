/**
 * Shown where a saved link block holds a path on the student's own device
 * instead of a web address (ticket d0cc8d45). The file never uploaded, so a
 * tappable link would open nothing; say so and point at Upload.
 */
import React from 'react';
import { HStack, UIText } from '../ui';
import { Ionicons } from '@expo/vector-icons';
import { neverUploadedMessage } from '@/src/utils/localFilePath';

export function NeverUploadedNotice({ item }: { item: { url?: unknown; title?: unknown; filename?: unknown } }) {
  return (
    <HStack
      className="items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg"
      accessibilityRole="text"
      testID="never-uploaded-notice"
    >
      <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
      <UIText size="xs" className="flex-1 text-amber-800 dark:text-amber-200">
        {neverUploadedMessage(item)}
      </UIText>
    </HStack>
  );
}
