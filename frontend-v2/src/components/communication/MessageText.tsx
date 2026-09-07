import React from 'react';
import { UIText } from '@/src/components/ui';
import { splitUrls } from '@/src/utils/messageLinks';
import { safeOpenURL } from '@/src/utils/linking';

/**
 * A message bubble's text, with its links tappable.
 *
 * iCreate, 2026-09-07 (208b75b5): "my students can't access homework links from
 * the mobile app." The teacher pastes an assignment link into the class chat;
 * the app rendered the whole message as one flat string, so on a phone the only
 * way to follow it was to select 90 characters by hand.
 *
 * Nested <Text> is how React Native does inline styling — the pressable
 * segments are children of the same paragraph, so the link stays in the flow of
 * the sentence instead of breaking onto its own line the way a <Pressable>
 * would. Taps go through `safeOpenURL`, which is the app's one guarded exit to
 * the OS (it re-checks the scheme, so a crafted message cannot smuggle a
 * non-http intent past this).
 */
export default function MessageText({
  content,
  color,
  linkColor,
  size = 'sm',
}: {
  content: string;
  color: string;
  /** Sent bubbles are dark; underline alone carries the affordance there. */
  linkColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const segments = splitUrls(content);
  return (
    <UIText size={size} style={{ color, lineHeight: 20 }}>
      {segments.map((s, i) => (s.url ? (
        <UIText
          key={i}
          size={size}
          accessibilityRole="link"
          style={{
            color: linkColor || color,
            lineHeight: 20,
            textDecorationLine: 'underline',
          }}
          onPress={() => { void safeOpenURL(s.url); }}
        >
          {s.url}
        </UIText>
      ) : (
        <UIText key={i} size={size} style={{ color, lineHeight: 20 }}>{s.text}</UIText>
      )))}
    </UIText>
  );
}
