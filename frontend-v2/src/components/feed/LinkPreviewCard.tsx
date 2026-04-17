/**
 * LinkPreviewCard - Renders a link evidence block with an OG preview.
 *
 * For video URLs (YouTube, TikTok, Vimeo, etc.) and any link whose og:image
 * resolves, shows a large thumbnail with a play-button overlay. Tapping
 * opens the URL externally (deep-links to the TikTok/YouTube app on mobile
 * when installed). Falls back to a compact link row while loading or when
 * no image is available.
 */

import React from 'react';
import { View, Image, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText } from '../ui';
import { useLinkPreview, isVideoPreview, isVideoUrl } from '@/src/hooks/useLinkPreview';

function openUrl(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface Props {
  url: string;
  title?: string | null;
}

export function LinkPreviewCard({ url, title }: Props) {
  const { data: preview } = useLinkPreview(url);

  const image = preview?.image || null;
  const isVideo = isVideoPreview(preview, url);
  const displayTitle = preview?.title || title || url;
  const host = hostLabel(url);

  // Video-style: large thumbnail with play overlay
  if (image && (isVideo || isVideoUrl(url))) {
    return (
      <Pressable onPress={() => openUrl(url)}>
        <View className="rounded-lg overflow-hidden bg-black">
          <View className="relative">
            <Image
              source={{ uri: image }}
              style={{ width: '100%', aspectRatio: 16 / 9 }}
              resizeMode="cover"
            />
            <View className="absolute inset-0 items-center justify-center">
              <View
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
              >
                <Ionicons name="play" size={28} color="#FFFFFF" style={{ marginLeft: 3 }} />
              </View>
            </View>
          </View>
          <View className="bg-surface-50 px-3 py-2 border-t border-surface-200">
            <UIText size="sm" className="font-poppins-medium text-typo-700" numberOfLines={2}>
              {displayTitle}
            </UIText>
            <HStack className="items-center gap-1 mt-0.5">
              <Ionicons name="play-circle-outline" size={12} color="#9CA3AF" />
              <UIText size="xs" className="text-typo-400">{host}</UIText>
            </HStack>
          </View>
        </View>
      </Pressable>
    );
  }

  // Compact preview with thumbnail on left
  if (image) {
    return (
      <Pressable onPress={() => openUrl(url)}>
        <View className="bg-surface-50 rounded-lg border border-surface-200 overflow-hidden flex-row">
          <Image
            source={{ uri: image }}
            style={{ width: 72, height: 72 }}
            resizeMode="cover"
          />
          <View className="flex-1 px-3 py-2 justify-center">
            <UIText size="sm" className="font-poppins-medium text-typo-700" numberOfLines={2}>
              {displayTitle}
            </UIText>
            <UIText size="xs" className="text-typo-400 mt-0.5" numberOfLines={1}>
              {host}
            </UIText>
          </View>
        </View>
      </Pressable>
    );
  }

  // Fallback: simple link row (same as before)
  return (
    <Pressable onPress={() => openUrl(url)}>
      <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
        <HStack className="items-center gap-2">
          <Ionicons name="link-outline" size={16} color="#6D469B" />
          <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
            {title || url}
          </UIText>
        </HStack>
      </View>
    </Pressable>
  );
}
